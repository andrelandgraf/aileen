#!/usr/bin/env bun
import { AssistantCloud } from "@assistant-ui/react";
import { db } from "../src/lib/db/db";
import { projectsTable } from "../src/lib/db/schema";
import invariant from "tiny-invariant";

/**
 * Script to clean up orphaned threads in AssistantCloud
 *
 * This script:
 * 1. Fetches all projects from the database to get threadIds we want to keep
 * 2. Lists all threads from AssistantCloud
 * 3. Deletes threads that are not associated with any project
 *
 * Usage:
 *   bun scripts/cleanup-threads.ts [--dry-run]
 *
 * Options:
 *   --dry-run    Show what would be deleted without actually deleting
 *
 * Environment variables required:
 *   - ASSISTANT_API_KEY: AssistantCloud API key
 *   - DATABASE_URL: Neon database connection string
 */

const DRY_RUN = process.argv.includes("--dry-run");
const DELAY_BETWEEN_DELETES_MS = 1000; // 1 second delay to avoid rate limiting

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function cleanupThreads() {
  try {
    console.log("\n🧹 Starting thread cleanup...");
    if (DRY_RUN) {
      console.log("🔍 DRY RUN MODE - No threads will be deleted\n");
    } else {
      console.log("⚠️  LIVE MODE - Threads will be permanently deleted\n");
    }

    // Validate environment variables
    invariant(process.env.ASSISTANT_API_KEY, "ASSISTANT_API_KEY is required");
    invariant(process.env.DATABASE_URL, "DATABASE_URL is required");

    // Step 1: Fetch all projects from database
    console.log("📊 Fetching all projects from database...");
    const projects = await db.select().from(projectsTable);

    console.log(`✅ Found ${projects.length} projects in database\n`);

    // Extract threadIds we want to keep
    const threadIdsToKeep = new Set(projects.map((p) => p.threadId));
    console.log(`🔒 Thread IDs to keep: ${threadIdsToKeep.size}`);
    console.log(`   ${Array.from(threadIdsToKeep).join("\n   ")}\n`);

    // Step 2: List all threads from AssistantCloud
    // Note: We need to list threads for each user since AssistantCloud is user-scoped
    // TODO: Remove this hardcoded user filter after testing
    const targetUserId = "49f1dcc1-c678-4ad8-b1be-11d3c5024be1";
    console.log(`👥 Processing threads for user: ${targetUserId}\n`);

    let totalThreadsFound = 0;
    let totalThreadsDeleted = 0;
    let totalThreadsKept = 0;
    let totalErrors = 0;

    const userId = targetUserId;
    {
      console.log(
        `\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`,
      );
      console.log(`👤 Processing user: ${userId}`);
      console.log(
        `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`,
      );

      try {
        const assistantCloud = new AssistantCloud({
          apiKey: process.env.ASSISTANT_API_KEY!,
          userId: userId,
          workspaceId: userId,
        });

        // List all threads for this user
        console.log(`📋 Listing threads for user ${userId}...`);
        const threadsResponse = await assistantCloud.threads.list({
          limit: 100,
        });

        const threads = threadsResponse.threads || [];
        totalThreadsFound += threads.length;
        console.log(`   Found ${threads.length} threads for this user\n`);

        // Step 3: Delete threads not in our keep list
        for (const thread of threads) {
          if (threadIdsToKeep.has(thread.id)) {
            console.log(`   ✅ Keeping thread: ${thread.id}`);
            totalThreadsKept++;
          } else {
            const metadata = thread.metadata as Record<string, any> | undefined;
            console.log(
              `   🗑️  ${DRY_RUN ? "[DRY RUN] Would delete" : "Deleting"} orphaned thread: ${thread.id}`,
            );
            if (metadata?.projectName) {
              console.log(`      Project: ${metadata.projectName}`);
            }

            if (DRY_RUN) {
              console.log(`      🔍 [Skipped - Dry Run]`);
              totalThreadsDeleted++;
            } else {
              try {
                await assistantCloud.threads.delete(thread.id);
                console.log(`      ✅ Deleted successfully`);
                totalThreadsDeleted++;

                // Add delay between deletions to avoid rate limiting
                if (DELAY_BETWEEN_DELETES_MS > 0) {
                  await sleep(DELAY_BETWEEN_DELETES_MS);
                }
              } catch (error) {
                // Enhanced error logging
                console.error(`      ❌ Failed to delete: ${error}`);
                if (error instanceof Error) {
                  console.error(`         Error name: ${error.name}`);
                  console.error(`         Error message: ${error.message}`);
                  if ((error as any).response) {
                    console.error(
                      `         Response: ${JSON.stringify((error as any).response)}`,
                    );
                  }
                }
                totalErrors++;
              }
            }
          }
        }
      } catch (error) {
        console.error(`❌ Error processing user ${userId}:`, error);
        totalErrors++;
      }
    } // End of user processing block

    // Summary
    console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.log(`📊 Cleanup Summary ${DRY_RUN ? "(DRY RUN)" : ""}`);
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");
    console.log(`   Total threads found:    ${totalThreadsFound}`);
    console.log(`   Threads kept:           ${totalThreadsKept}`);
    console.log(
      `   Threads ${DRY_RUN ? "to delete" : "deleted"}:      ${totalThreadsDeleted}`,
    );
    console.log(`   Errors:                 ${totalErrors}`);
    console.log("");

    if (DRY_RUN) {
      console.log("🔍 Dry run completed - no threads were deleted");
      if (totalThreadsDeleted > 0) {
        console.log(
          `💡 Run without --dry-run to delete ${totalThreadsDeleted} orphaned thread(s)`,
        );
      }
    } else if (totalThreadsDeleted > 0) {
      console.log("✅ Cleanup completed successfully!");
    } else {
      console.log("✨ No orphaned threads found - all clean!");
    }

    if (totalErrors > 0) {
      console.log(`⚠️  ${totalErrors} error(s) occurred during cleanup`);
      process.exit(1);
    }

    process.exit(0);
  } catch (error) {
    console.error("\n❌ Error during thread cleanup:", error);
    process.exit(1);
  }
}

// Run the script
cleanupThreads();
