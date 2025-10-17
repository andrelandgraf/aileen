#!/usr/bin/env bun

import { FreestyleSandboxes } from "freestyle-sandboxes";

/**
 * Script to debug Freestyle filesystem tools
 *
 * Usage:
 *   bun scripts/debug-fs-freestyle-tools.ts <repo-id>
 *
 * Example:
 *   bun scripts/debug-fs-freestyle-tools.ts pjxwk
 */

async function debugFreestyleTools(repoId: string) {
  try {
    console.log(`\n🔍 Testing Freestyle repository: ${repoId}\n`);

    // Initialize Freestyle SDK
    const freestyle = new FreestyleSandboxes({
      apiKey: process.env.FREESTYLE_API_KEY!,
    });

    // Request dev server
    console.log("🚀 Requesting Freestyle dev server...");
    const devServerResponse = await freestyle.requestDevServer({
      repoId,
    });

    const { fs, process: execProcess, isNew } = devServerResponse;
    console.log(`✅ Dev server ready (${isNew ? "new" : "existing"})\n`);

    // Test 1: List root directory
    console.log("📁 Test 1: List root directory (fs.ls)");
    try {
      const rootFiles = await fs.ls();
      console.log(`✅ Success! Found ${rootFiles.length} items:`);
      rootFiles.forEach((file) => {
        console.log(`   - ${file}`);
      });
    } catch (error) {
      console.error("❌ Error listing root directory:");
      console.error(error);
      console.log("");
    }

    // Test 2: List src directory
    console.log("📁 Test 2: List src directory (fs.ls('src'))");
    try {
      const srcFiles = await fs.ls("src");
      console.log(`✅ Success! Found ${srcFiles.length} items:`);
      srcFiles.forEach((file) => {
        console.log(`   - ${file}`);
      });
      console.log("");
    } catch (error) {
      console.error("❌ Error listing src directory:");
      console.error(error);
      console.log("");
    }

    // Test 4: Execute command (ls -la)
    console.log("⚡ Test 4: Execute command (process.exec('ls -la'))");
    try {
      const result = await execProcess.exec("ls");
      console.log(`✅ Success!`);
      console.log(`   stdout lines: ${result.stdout?.length || 0}`);
      console.log(`   stderr lines: ${result.stderr?.length || 0}`);
      if (result.stdout && result.stdout.length > 0) {
        console.log(`   First few lines:`);
        result.stdout.slice(0, 5).forEach((line) => {
          console.log(`   ${line}`);
        });
      }
      console.log("");
    } catch (error) {
      console.error("❌ Error executing command:");
      console.error(error);
      console.log("");
    }

    process.exit(0);
  } catch (error) {
    console.error("\n❌ Error:", error);
    process.exit(1);
  }
}

// Get repo ID from command line arguments
const repoId = process.argv[2];

if (!repoId) {
  console.error("\n❌ Error: Repo ID is required");
  console.log("\nUsage:");
  console.log("  bun scripts/debug-fs-freestyle-tools.ts <repo-id>");
  console.log("\nExample:");
  console.log("  bun scripts/debug-fs-freestyle-tools.ts pjxwk\n");
  process.exit(1);
}

// Run the script
debugFreestyleTools(repoId);
