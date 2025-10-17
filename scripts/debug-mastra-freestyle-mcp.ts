#!/usr/bin/env bun

import { anthropic } from "@ai-sdk/anthropic";
import { Agent } from "@mastra/core/agent";
import { MCPClient } from "@mastra/mcp";

async function main() {
  console.log("🔍 Starting Mastra Agent + Freestyle MCP Debug Script...\n");

  // Create MCP client with hardcoded Freestyle URL
  const mcpClient = new MCPClient({
    id: "freestyle-debug",
    servers: {
      freestyleDevServer: {
        url: new URL("https://vm-api.freestyle.sh/vms/pjxwk/mcp"),
      },
    },
  });

  console.log("📦 Fetching tools from Freestyle MCP server...");
  const tools = await mcpClient.getTools();

  console.log("🤖 Creating Mastra Agent with Sonnet-4...\n");

  // Create Mastra Agent
  const debugAgent = new Agent({
    name: "debug-agent",
    description: "Debug agent for testing Freestyle MCP tools",
    model: anthropic("claude-sonnet-4-0"),
    tools,
    instructions:
      "Tell me the folder structure of this coding project using the available tools.",
  });

  console.log("💬 Starting agent stream...\n");

  // Run the agent
  const result = await debugAgent.stream(
    "What is the folder structure of this project?",
  );

  // Stream the response
  for await (const chunk of result.textStream) {
    process.stdout.write(chunk);
  }

  console.log("\n\n✅ Done!");
}

main().catch((error) => {
  console.error("❌ Error:", error);
  console.error("\nStack trace:", error.stack);
  process.exit(1);
});
