import type { ContextWithMastra } from "@mastra/core/server";
import { createUIMessageStream, createUIMessageStreamResponse } from "ai";
import { toAISdkFormat } from "@mastra/ai-sdk";
import type { ModelSelectionContext } from "../lib/context";

/**
 * Detects if an error is related to insufficient funds/billing quota
 */
function isOutOfFundsError(error: any): boolean {
  const errorMessage = String(
    error?.message || error?.error?.message || "",
  ).toLowerCase();

  return errorMessage.includes("credit balance is too low");
}

/**
 * Extracts user-friendly error message from an error object
 */
function getEnhancedErrorMessage(error: any, keyProvider?: "platform" | "personal"): string {
  if (isOutOfFundsError(error)) {
    if (keyProvider === "personal") {
      return "Snap! Looks like you're out of funds. Please check your Anthropic API account and add credits to continue.";
    }
    
    // Platform key error
    return "Snap! Y'all drained our Anthropic API credits! We're honored you're interested in Aileen and we'll look into this soon! In the meantime, you can keep the party going by clicking the model selector in the navbar and providing your own API key. Or, clone the repo and fire it up locally with your own keys - it's all yours!";
  }

  const errorMessage =
    error?.message || error?.error?.message || "An unexpected error occurred";

  // Include stack trace in development
  if (process.env.NODE_ENV === "development" && error?.stack) {
    return `${errorMessage}\n\nError: ${error.name || "Unknown"}\nStack: ${error.stack}`;
  }

  return errorMessage;
}

/**
 * Custom POST handler for /codegen endpoint
 * Provides enhanced error handling for streaming agent responses
 */
export async function POST(c: ContextWithMastra): Promise<Response> {
  const mastra = c.get("mastra");
  const runtimeContext = c.get("runtimeContext");
  const { messages } = await c.req.json();

  console.log(`[Codegen] Processing request with ${messages.length} messages`);

  // Extract keyProvider from runtime context for error handling
  const modelSelection = runtimeContext.get("modelSelection") as ModelSelectionContext | undefined;
  const keyProvider = modelSelection?.keyProvider;

  const agent = mastra.getAgent("codegenAgent");
  const stream = await agent.stream(messages, {
    runtimeContext,
    maxSteps: 50,
  });

  // https://github.com/mastra-ai/mastra/issues/9613
  // Tee the stream to capture raw error details before transformation
  let capturedError: any = null;
  const [errorCaptureStream, transformStream] = stream.fullStream.tee();

  // Capture error details from raw Mastra stream in parallel
  (async () => {
    const reader = errorCaptureStream.getReader();
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (value.type === "error" && value.payload?.error) {
          capturedError = value.payload.error;
        }
      }
    } catch (err) {
      // Silent fail - this is just for error capture
    } finally {
      reader.releaseLock();
    }
  })();

  // Transform stream for AI SDK
  const streamWithTee = {
    ...stream,
    fullStream: transformStream,
  } as typeof stream;

  const uiMessageStream = createUIMessageStream({
    execute: async ({ writer }) => {
      const aiSdkStream = toAISdkFormat(streamWithTee, { from: "agent" })!;
      const reader = aiSdkStream.getReader();

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          // Throw on error chunks to trigger onError handler
          if (value.type === "error") {
            const error =
              capturedError || new Error(value.errorText || "Unknown error");
            throw error;
          }

          writer.write(value);
        }
      } finally {
        reader.releaseLock();
      }
    },
    onError: (error) => {
      const err = error as Error;
      console.error("[Codegen] Stream error:", err.message || error);
      return getEnhancedErrorMessage(error, keyProvider);
    },
  });

  return createUIMessageStreamResponse({ stream: uiMessageStream });
}
