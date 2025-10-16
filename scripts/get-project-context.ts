#!/usr/bin/env bun
import { db } from "../src/lib/db/db";
import { projectsTable } from "../src/lib/db/schema";
import { eq } from "drizzle-orm";

/**
 * Script to get project context for testing in Mastra playground
 * 
 * Usage:
 *   bun scripts/get-project-context.ts <project-id>
 * 
 * Example:
 *   bun scripts/get-project-context.ts 237a7950-c7e3-4eee-9545-a4ec43665e1a
 */

async function getProjectContext(projectId: string) {
  try {
    console.log(`\n🔍 Fetching project: ${projectId}\n`);

    // Fetch project from database
    const [project] = await db
      .select()
      .from(projectsTable)
      .where(eq(projectsTable.id, projectId))
      .limit(1);

    if (!project) {
      console.error(`❌ Project not found: ${projectId}`);
      process.exit(1);
    }

    console.log(`✅ Found project: ${project.name}\n`);

    // Create the project context object
    const projectContext = {
      projectId: project.id,
      projectName: project.name,
      neonProjectId: project.neonProjectId,
      repoId: project.repoId,
      userId: project.userId,
    };

    // Output for Mastra playground
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.log("📋 Copy the following RuntimeContext for Mastra Playground:");
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");

    // Output as JSON that can be pasted
    console.log("RuntimeContext:");
    console.log(JSON.stringify({ project: projectContext }, null, 2));

    console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.log("\n📝 How to use in Mastra Playground:");
    console.log("   1. Start the Mastra dev server: npm run mastra:dev");
    console.log("   2. Open http://localhost:4111");
    console.log("   3. Navigate to Agents > codegen-agent");
    console.log("   4. In the Runtime Context section, paste the JSON above");
    console.log("   5. You can now test the agent with project-specific context!\n");

    console.log("⚠️  Note: MCP tools won't be available in the playground");
    console.log("   The playground doesn't create MCP clients dynamically.");
    console.log("   Use the Next.js app for full functionality.\n");

    // Also output project details for reference
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.log("📊 Project Details:");
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");
    console.log(`Name:            ${project.name}`);
    console.log(`ID:              ${project.id}`);
    console.log(`Neon Project:    ${project.neonProjectId}`);
    console.log(`Repository:      ${project.repoId}`);
    console.log(`User ID:         ${project.userId}`);
    console.log(`Created:         ${project.createdAt}`);
    console.log("");

    process.exit(0);
  } catch (error) {
    console.error("\n❌ Error fetching project context:", error);
    process.exit(1);
  }
}

// Get project ID from command line arguments
const projectId = process.argv[2];

if (!projectId) {
  console.error("\n❌ Error: Project ID is required");
  console.log("\nUsage:");
  console.log("  bun scripts/get-project-context.ts <project-id>");
  console.log("\nExample:");
  console.log("  bun scripts/get-project-context.ts 237a7950-c7e3-4eee-9545-a4ec43665e1a\n");
  process.exit(1);
}

// Run the script
getProjectContext(projectId);

