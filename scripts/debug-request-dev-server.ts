#!/usr/bin/env bun

import { FreestyleSandboxes } from "freestyle-sandboxes";
import { mainConfig } from "@/lib/config";

async function main() {
  console.log("🚀 Starting Freestyle Dev Server Request Debug Script...\n");

  // Get repo ID from command line arguments
  const repoId = process.argv[2];

  if (!repoId) {
    console.error("❌ Error: Please provide a repo ID as an argument");
    console.log("\nUsage: bun scripts/debug-request-dev-server.ts <repoId>");
    console.log("Example: bun scripts/debug-request-dev-server.ts abc123\n");
    process.exit(1);
  }

  console.log(`📦 Repo ID: ${repoId}`);

  // Get API key from environment
  const apiKey = mainConfig.freestyle.apiKey;

  console.log("🔑 API Key found\n");

  // Initialize Freestyle client
  const freestyle = new FreestyleSandboxes({
    apiKey,
  });

  console.log("⏳ Requesting dev server...\n");

  try {
    // Request the dev server
    const devServer = await freestyle.requestDevServer({
      repoId,
    });

    console.log("✅ Dev server ready!\n");
    console.log("📊 Response:");
    console.log("─".repeat(50));
    console.log(`Ephemeral URL:     ${devServer.ephemeralUrl}`);
    console.log(`MCP URL:           ${devServer.mcpEphemeralUrl}`);
    console.log(`Code Server URL:   ${devServer.codeServerUrl}`);
    console.log(`Is New:            ${devServer.isNew}`);
    console.log("─".repeat(50));
    console.log("\n✨ Done!");
  } catch (error) {
    console.error("\n❌ Error requesting dev server:", error);
    if (error instanceof Error) {
      console.error("Error message:", error.message);
      console.error("\nStack trace:", error.stack);
    }
    process.exit(1);
  }
}

main().catch((error) => {
  console.error("❌ Unexpected error:", error);
  process.exit(1);
});
