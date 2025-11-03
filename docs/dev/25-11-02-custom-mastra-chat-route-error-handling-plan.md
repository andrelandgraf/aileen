# Custom Mastra Chat Route with Error Handling - Implementation Plan

**Date:** 2025-11-02  
**Feature:** Custom API route for enhanced error handling in streaming agent responses  
**Status:** ✅ Completed

## Problem Statement

When the Mastra agent throws an error during streaming (e.g., Anthropic API "out of funds" error), the Assistant UI chat displays nothing to the user. The default `chatRoute` from `@mastra/ai-sdk` doesn't provide adequate error handling or user feedback.

**User Experience Issue:**

- User sends a message
- Agent hits an API error (rate limit, out of funds, etc.)
- UI shows nothing - appears broken
- No feedback to user about what went wrong

**Technical Issues:**

1. Default `chatRoute` is minimal and doesn't handle streaming errors
2. Mastra's `toAISdkFormat()` strips detailed error information during transformation:
   - Raw Mastra stream contains: `{ type: "error", payload: { error: { message: "...", name: "...", stack: "..." } } }`
   - After transformation: `{ type: "error", errorText: "Error" }` (all details lost)
3. Can't distinguish between error types (out of funds vs. rate limit vs. auth failure)
4. Can't provide custom error messages based on error type

## Solution Overview

Replace `chatRoute` with a custom API route that:

1. Calls the Mastra agent directly with full control over streaming
2. Uses stream teeing to capture detailed error information before transformation
3. Transforms the stream using AI SDK adapters for compatibility
4. Detects specific error types and provides user-friendly messages
5. Displays errors in the UI via custom error banner

**Stream Teeing Pattern:** The core solution uses `stream.fullStream.tee()` to create two identical streams:

- **Error Capture Stream** - Read raw Mastra stream to capture full error details before transformation
- **Transform Stream** - Pass to `toAISdkFormat()` for AI SDK compatibility

Both streams run in parallel, preserving error details while maintaining stream compatibility.

## Implementation Decisions

### Error Handling Strategy

- **Scope:** Only handle errors during stream iteration, not during `agent.stream()` call
- **Rationale:** If `stream()` throws immediately (auth/validation errors), that's not recoverable and should fail fully. Focus on errors during stream iteration (model errors, out of funds, etc.)

### Stream Transformation Pattern

- **Decision:** Use stream teeing to capture errors before `toAISdkFormat()` transformation
- **Rationale:** `toAISdkFormat()` strips error details from Mastra streams. Stream teeing allows reading the same data twice - once for error capture, once for transformation.

### AI SDK Error Integration

- **Decision:** Throw errors from `execute` block to trigger `onError` callback
- **Rationale:** AI SDK's `onError` callback properly formats error messages and sets message status. Manually writing error chunks doesn't set the correct status for UI display.

### Client-Side Error Display

- **Decision:** Implement custom error banner using React state
- **Rationale:** `MessagePrimitive.Error` from Assistant UI doesn't reliably display errors even when message status is set correctly. Custom banner provides consistent error display.

### Error Detection

- **Decision:** Check for specific Anthropic error message: "credit balance is too low"
- **Rationale:** This is the exact error message from Anthropic API. Keep detection simple and specific.

### maxSteps Configuration

- **Decision:** Use `50` (same as default `chatRoute`)
- **Rationale:** Keep consistent with existing behavior

## Files to Create

### 1. `src/mastra/routes/codegen.ts` (NEW FILE)

**Purpose:** Custom API route handler for the `/codegen` endpoint with enhanced error handling

**Handler Signature:**

```typescript
import type { ContextWithMastra } from "@mastra/core/server";

export async function POST(c: ContextWithMastra): Promise<Response>;
```

**Implementation Structure:**

1. **Extract Request Data:**

   ```typescript
   const mastra = c.get("mastra");
   const runtimeContext = c.get("runtimeContext"); // Already populated by auth middleware
   const { messages } = await c.req.json();
   ```

2. **Get Agent and Stream:**

   ```typescript
   const agent = mastra.getAgent("codegenAgent");
   const stream = await agent.stream(messages, {
     runtimeContext,
     maxSteps: 50,
   });
   ```

3. **Tee Stream and Capture Error Details:**

   ```typescript
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
     } finally {
       reader.releaseLock();
     }
   })();
   ```

4. **Transform and Stream with Error Handling:**

   ```typescript
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
       console.error("[Codegen] Stream error:", error.message);
       return getEnhancedErrorMessage(error);
     },
   });

   return createUIMessageStreamResponse({ stream: uiMessageStream });
   ```

**Helper Functions:**

```typescript
/**
 * Detects if an error is related to insufficient funds
 */
function isOutOfFundsError(error: any): boolean {
  const errorMessage = String(
    error?.message || error?.error?.message || "",
  ).toLowerCase();

  return errorMessage.includes("credit balance is too low");
}

/**
 * Formats user-friendly error messages
 */
function getEnhancedErrorMessage(error: any): string {
  if (isOutOfFundsError(error)) {
    return "Demo is out of funds! Thanks for trying out Aileen. To continue using Aileen, you can run it locally with your own API credentials. Setup instructions: https://github.com/andrelandgraf/aileen#getting-started\n\nYou'll need:\n- Anthropic API key (for Claude)\n- Neon account (database)\n- Freestyle account (dev servers)\n- Assistant UI account";
  }

  const errorMessage =
    error?.message || error?.error?.message || "An unexpected error occurred";

  // Include stack trace in development
  if (process.env.NODE_ENV === "development" && error?.stack) {
    return `${errorMessage}\n\nError: ${error.name || "Unknown"}\nStack: ${error.stack}`;
  }

  return errorMessage;
}
```

**Dependencies:**

```typescript
import type { ContextWithMastra } from "@mastra/core/server";
import { createUIMessageStream, createUIMessageStreamResponse } from "ai";
import { toAISdkFormat } from "@mastra/ai-sdk";
```

## Files to Modify

### 2. `src/mastra/index.ts`

**Changes:**

- **Remove:** `import { chatRoute } from "@mastra/ai-sdk";`
- **Add:** `import * as codegenRoute from "./routes/codegen";`
- **Replace in apiRoutes array:**
  ```typescript
  apiRoutes: [
    {
      path: "/codegen",
      method: "POST",
      handler: codegenRoute.POST,
    },
  ],
  ```

**Keep:**

- Middleware configuration (auth middleware already handles `/codegen` path)
- CORS settings
- Server port/host configuration

### 3. `src/components/project-chat.tsx`

**Changes:**

- **Add:** Error state management at component level

  ```typescript
  const [runtimeError, setRuntimeError] = useState<string | null>(null);
  ```

- **Add:** Error handler in `useChatRuntime` configuration

  ```typescript
  onError: (error) => {
    console.error("Chat runtime error:", error.message);
    setRuntimeError(error.message);
  },
  ```

- **Add:** Custom error banner component (before chat thread)
  ```typescript
  {runtimeError && (
    <div className="bg-destructive/10 border-b border-destructive px-4 py-3">
      <div className="flex items-start gap-3">
        <div className="flex-1">
          <p className="text-sm font-medium text-destructive">Error</p>
          <p className="text-sm text-destructive/90 whitespace-pre-wrap">
            {runtimeError}
          </p>
        </div>
        <button
          onClick={() => setRuntimeError(null)}
          className="text-destructive/70 hover:text-destructive"
          aria-label="Dismiss error"
        >
          ✕
        </button>
      </div>
    </div>
  )}
  ```

**Keep:**

- Existing chat runtime configuration
- Thread components and layout

## Directory Structure

```
src/mastra/
├── index.ts                    (MODIFY - replace chatRoute with custom route)
├── routes/                     (NEW DIRECTORY)
│   └── codegen.ts              (NEW FILE - custom route handler)
├── agents/
│   └── codegenAgent.ts         (NO CHANGES)
└── lib/
    ├── tools.ts                (NO CHANGES - getCodegenTools already exists)
    ├── middleware.ts           (NO CHANGES - auth middleware works as-is)
    └── context.ts              (NO CHANGES)
```

## Implementation Flow

```
1. Request arrives → POST /api/mastra/codegen?projectId=xxx
   Headers: Authorization: Bearer <token>
   Body: { messages: [...] }

2. Auth middleware runs → populates RuntimeContext with:
   - project (from database)
   - user (from auth token)
   - assistantMessageId (from request body)
   - environmentVariables (from project secrets)

3. Route handler executes:
   a. Extract messages from body
   b. Get mastra instance and runtimeContext from context
   c. Get agent: mastra.getAgent("codegenAgent")
   d. Call agent.stream(messages, { runtimeContext, maxSteps: 50 })
   e. Tee the fullStream: [errorCaptureStream, transformStream]
   f. Start parallel async task to capture errors from errorCaptureStream
   g. Transform transformStream with toAISdkFormat(streamWithTee, { from: "agent" })
   h. Iterate through transformed stream in try block
   i. If error chunk detected:
      - Use capturedError (full details) or fallback to chunk error
      - Throw error to trigger onError callback
   j. onError callback:
      - Format error message based on error type
      - Return user-friendly string
   k. Return createUIMessageStreamResponse({ stream: uiMessageStream })

4. Client receives streamed response:
   - Success: Display in chat
   - Error: onError callback sets runtimeError state → displays in error banner
```

## Testing Checklist

- [x] Error messages display in custom error banner
- [x] Out of funds errors show user-friendly message
- [x] Development mode includes stack traces
- [x] Production mode shows clean error messages
- [x] Error detection working for "credit balance is too low"
- [x] `onError` callback receives full error details
- [x] Stream teeing captures error details before transformation
- [x] Normal messages stream successfully
- [x] Error banner dismissible by user

## Future Enhancements

- Add `AbortSignal` handling for request cancellation
- Expand error detection for other API providers (OpenAI, etc.)
- Add retry logic for specific error types (rate limits)
- Improve error logging and monitoring
- Consider upstreaming error detail preservation to Mastra's `toAISdkFormat()`
- Investigate Assistant UI's `MessagePrimitive.Error` display issues

## Notes

**Key Technical Patterns:**

1. **Stream Teeing for Data Preservation:**
   - Use `stream.tee()` to create independent copies of a stream
   - Allows reading same data twice for different purposes
   - Critical when transformations lose important information

2. **AI SDK Error Handling:**
   - `onError` callback returns a **string**, not an object
   - AI SDK automatically creates error chunks and sets message status
   - Throw errors from `execute` block to trigger `onError`

3. **Error Object Properties:**
   - Check multiple properties: `error.message`, `error.error.message`, `error.name`, `error.stack`
   - Different error sources structure data differently
   - Always provide fallback values

**Library Limitations Found:**

1. **Mastra:** `toAISdkFormat()` strips detailed error information from streams (filed issue)
2. **Assistant UI:** `MessagePrimitive.Error` doesn't reliably display errors even with correct message status (filed issue)
