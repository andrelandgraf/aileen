#!/usr/bin/env bun

import { anthropic } from "@ai-sdk/anthropic";
import { stepCountIs, streamText } from "ai";
import { experimental_createMCPClient } from "@ai-sdk/mcp"
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

async function main() {
  console.log("🔍 Starting Freestyle MCP Debug Script...\n");

  // Create MCP client with hardcoded Freestyle URL
  const mcpClient = await experimental_createMCPClient({
    transport: new StreamableHTTPClientTransport(
      new URL("https://vm-api.freestyle.sh/vms/pjxwk/mcp"),
    ),
  });

  const tools = await mcpClient.tools();

  console.log("🤖 Starting AI conversation with Sonnet-4...\n");

  // Use AI SDK with Sonnet-4
  const result = streamText({
    model: anthropic("claude-sonnet-4-0"),
    system:
      "Tell me the folder structure of this coding project using the available tools. Start in /template directory.",
    prompt: "What is the folder structure of this project?",
    stopWhen: stepCountIs(20),
    tools,
  });

  // Stream the response
  for await (const chunk of result.textStream) {
    process.stdout.write(chunk);
  }

  console.log("\n\n✅ Done!");
}

main().catch((error) => {
  console.error("❌ Error:", error);
  process.exit(1);
});
