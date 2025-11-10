#!/usr/bin/env bun
import { AssistantCloud } from "@assistant-ui/react";
import invariant from "tiny-invariant";

/**
 * Script to clean up orphaned threads in AssistantCloud
 *
 * This script:
 * 1. Uses a hardcoded list of threadIds we want to keep (from the database)
 * 2. Lists all threads from AssistantCloud
 * 3. Deletes threads that are not in the keep list
 *
 * Usage:
 *   bun scripts/cleanup-threads.ts [--dry-run]
 *
 * Options:
 *   --dry-run    Show what would be deleted without actually deleting
 *
 * Environment variables required:
 *   - ASSISTANT_API_KEY: AssistantCloud API key
 */

const DRY_RUN = process.argv.includes("--dry-run");
const DELAY_BETWEEN_DELETES_MS = 1000; // 1 second delay to avoid rate limiting

// Hardcoded list of thread IDs to keep (fetched from database)
const THREAD_IDS_TO_KEEP = [
  "thread_0icqW3w5EB1coajnlFxMQ0rp",
  "thread_08pdSQdAxpTS81sbo6QZwp0v",
  "thread_0WeQ8kpTwU4Y1kgjIpPtUGvc",
  "thread_088vi2KNjylhPGTH3QciVzA8",
  "thread_0x07H5Gvlu2gajkQSYMOikli",
  "thread_0GCedReF8RIHyTA2HIBQaMfk",
  "thread_0chRPoxa3yAKQnIcENLUhXtT",
  "thread_0qvABiMIczSoNdYlJN8R2ANc",
  "thread_0Rd911nuak4w0pkoabzH7AsP",
  "thread_0YXOloZWbjQr0YePZvBxWqVi",
  "thread_0tpXfz8j6frcgWoIwWFvvwNj",
  "thread_07Ki8TcCtbWnue9eVJ4hDzXM",
  "thread_0XwV4QSs6P2m1aECvwTi93Ex",
  "thread_0JVUvxJzwj74igKPJ17k0sUM",
  "thread_0u2jylRMlTkCi7wNsYTxINwm",
  "thread_0XFgbES1kRWOvOrCaki7HQGA",
  "thread_0z0CkLvtPG0Usap7MbmQm7JK",
  "thread_0WYV32k6Zr1HYfCp6IEDwNLF",
  "thread_0aOu4WWXxrXbqqTwi3chllpz",
  "thread_0utXyLgwu2ge7sVOZnHsBW22",
  "thread_0pe2z7ufoHYxpsq9GZtRQaUI",
  "thread_0mfuapWmDpoFiznOjhMnStil",
  "thread_0kPttu1QrRQnaR8uO4DsSiLx",
  "thread_0h7OfZH2t7Ut6NL5C3u3ZzPv",
  "thread_09npqyrhmafXhqTUwYIBHbzG",
  "thread_0xfqBpRoqqw9TSl9Y5QvGnH0",
  "thread_02HggPpU3kUGVoN42Czvr8i4",
  "thread_08FRmB3HUR2NZ50QpqOTWF1Q",
  "thread_0WYceFcLvw2Iv042x2MpQEWT",
  "thread_0T6YwHXODrQl192aEbukBflV",
  "thread_0XoKR0LnNGtaVHg4S2wBLLrC",
  "thread_0KNManpgpulMJvlTZ7lNRjAA",
  "thread_0HuBVnzCxZkFHenQL8ZSIh0y",
  "thread_0xF41GOvjB8zMB6gMEDpy7BT",
  "thread_04SOCdsLHd0VfxqCdodESVGA",
  "thread_0y5GAF1yO2n5cJADzDN7lJgw",
  "thread_0I3PXVJx77AQR4cNqGpAeqvc",
  "thread_0y3gGywRMonFYgCHeC3mp0Fi",
  "thread_0LbcgTxwDZQKTc8ZXQs1Q5Wj",
  "thread_0UStYbdu4vWpZvzl8YuxGjT4",
  "thread_0CMb2IAT1MYt6elWdsuSj0k6",
  "thread_06iWGJRkfiEzs9ndxPyolhew",
  "thread_0S1SKKpeemoyNy76JieuNtJG",
  "thread_0oQBMts4aMFCge7cYmThKjfV",
  "thread_0iyopB7VYgoG5M4SSbjmqAX0",
  "thread_0qsr8PwZloUWn17NzV2qEDiN",
  "thread_0Jra4wTdEf8Si9vWdx5yf7O2",
  "thread_0o5SJpZyrC4mna84NyZToFv0",
  "thread_0ZnRUaV5pmX1fjR94Jyaz3E0",
  "thread_01PyONo8FPCVxlxCjrNPNTjj",
  "thread_0FsPuhi42HYV04WNNB5nlWh7",
  "thread_0tvFi5IntKQSRKIwdCQ5SNWK",
  "thread_0IGgsXiZ3rwGuuDjDfqVz8ta",
  "thread_0d6tHOKCixT3K9hewvz7XaQR",
  "thread_0vOyEAi0dKGfaJPFCh99eJwq",
  "thread_0LcTdxiDpcZpLZTL5E5ZPSyw",
  "thread_0HxWE6RJRGok61lnJMjUB9Gf",
  "thread_0kD9lfBneAvNtFB7KQ7352oD",
  "thread_08GNo5zxhenw5SkSrJto2GBY",
  "thread_02KXt8NYCwqBTbpOQoJTlAw7",
  "thread_010GKyJvkP9hC0Nu82MQRPbp",
  "thread_0Ow2nYvObCRuobvRMnQkggGQ",
  "thread_0txx80jK44fIibbuRpw1xlgp",
  "thread_02nnSOUROMoI6HRzNeFyq7TH",
  "thread_0Yw5u9uLticO2jJHOZtLDFpm",
  "thread_0qGGuS1aFZvovXD4mqwj4NZm",
  "thread_0uVjILCf7cDbM9vW3w4xIlEi",
  "thread_0HxP7uVPRJB0rLI3OpnD8emQ",
  "thread_0h7llkvV9ZKQwO9ITqWiXLmZ",
  "thread_0Zl8xxD4xkAOBlxt9v70EnFN",
  "thread_0znHN85VUTsHJDYXjAKWyhxW",
  "thread_00qELLV4JZLQ2NtdNuRA1953",
  "thread_05vUBh2h4vh8lxVjPXahhjh0",
  "thread_0fiCiK0Abu1R5bTZQvw7h2c8",
  "thread_0kAUpEC17T3MZVxGuW1krzJw",
  "thread_0QPpSsdjqqhSOBqw3lB7ybvi",
  "thread_0SM9XGdisafIy0iwBCAuriFv",
  "thread_0Emm81ZNIkKrw5gubL8ps3Mw",
  "thread_0RXPQHG5dQjj0k8hg0y0CDBX",
  "thread_0He78AQg9muAFt2q0hCrInBw",
  "thread_0wXAxu1h2urVExdYyCvyZath",
  "thread_0h2Y977Ruao4DsQi3WnQL8pS",
  "thread_0F2emUZbFXfQaVLL8owLAAki",
  "thread_0K1FC5Ncm0rDhJdtPcI3tkFB",
  "thread_0U7VasygspgGAITV8DHaT7Sx",
  "thread_0oRo0kgXZ4Z12eLdZIAxzCYr",
  "thread_00ngCVooGobUb1KpM3XQFOsR",
  "thread_0zGFLJ2b9KixoDI6wiJyCR4O",
  "thread_0nLnYJcgvQdeIjxz0yedeIXA",
  "thread_0QgjiTa2cq48V5rom9lf7yO7",
  "thread_0K2RLP9WGpBixyKnSXQEIiKF",
  "thread_08BysFvGm0RNwefqKRxsmuzu",
  "thread_0p2W5N8ehEYlY2lFRuYcFAdv",
  "thread_0JqA1Vutz8BfsBZTrgmX217Q",
  "thread_0XA00rKgsSKYSz3Jnqe5XNfa",
  "thread_0x5EEVvjR6zQ60x87mmq3G75",
  "thread_0IEikTeyFPY3RSBZoYkXG7Uw",
  "thread_0lkaorn63mMNNIoIiNgWOb4E",
  "thread_0qJeKPPO40MyfH3jisqIUfYo",
  "thread_0e16yma2S7aIxNAuPMb8oPeP",
  "thread_0V96Xtj7jE2TpsPBcotWnVnD",
  "thread_0AX0JVEpHRwzFYbusKaXTzdo",
  "thread_0TJRbXOgK7rfUNhOhgDXIQDL",
  "thread_0skMm9gurY0q5p4J1qfcQkgd",
  "thread_0OWXuwgnMyfA2YabvIlNCYjs",
  "thread_0gkXNAfg3CzPvq7eHx6WoUeS",
  "thread_0E03XoNYJ7xnguaM6dYCqc4K",
  "thread_08ZB7bgelZ13eZ6N69KYg2BP",
  "thread_0sMQHrUzpLi6U5oAerQA4EmH",
  "thread_0QmJ61qRdTUh46A0viZZH5Ub",
  "thread_0J2SgLrmYrTuR6gSrZlnjDpi",
  "thread_0ZVxM9Nyg95aPmWZOgkyQR4t",
  "thread_0iD0Focjp7pOMPzkVxX8ljw1",
  "thread_0ZqtITKcgsn7J4ChUZUvL0LR",
  "thread_0lP6NR05jhYg4TZ1NwHb1tNf",
  "thread_0wXYHg2WQM66YsbL07F8x8mk",
  "thread_0icZdQHDj71YB2fFMm9rqVWm",
  "thread_0uK0zjTVxtRtwjXTRfd0NLmT",
  "thread_0G00MC6NIFsq48LPJmP0pSqG",
  "thread_0f1g42cEFU7DyVmujtVioFsH",
  "thread_0w9GODkk6ETCheEc8mDPGFLt",
  "thread_0lbexufUvXglnMSwpM6RUNKO",
  "thread_0RcW6t6XEFvWfYMsXjwc3Scr",
  "thread_07fPUBoqPJS4pkkKFf5c4txU",
  "thread_0RWumO6VpTORwfgxea4pxKcq",
  "thread_0YN6UZ0HYjST2I3wTRyLso5t",
  "thread_0NB765eEDEfq9sXoRRbEddo1",
  "thread_0800WDGc9JAZ52VLJtaYTl4f",
  "thread_0POSkXT3B8wsS4H5VSEWuYSf",
  "thread_07nBbvIde5UsUiLrTMMhAZcU",
  "thread_0tqZekxSy13Xd6R8vypXDdMq",
  "thread_0BzoeT6EuoSylRjJ37sBH4vp",
  "thread_0dtWU1DMPQc52OSgaBZ1pFnL",
  "thread_0iejOBhDlxbHSkWfl40g31v2",
  "thread_02bK6PkBcC9DoJfInXFseCbT",
  "thread_03czuzx5JS4B1t8TtDnjsXtq",
  "thread_0Mf6OYEHyFwle04Q3xl1xk51",
  "thread_0hAcvHmWC0SupllHQ0lsi3oh",
  "thread_0RAiHTrN4ewu38i3q9Sg3bMS",
  "thread_06pKslFs0mmxFWHKZkZ7h2qR",
  "thread_0RGwkrqS3HFAahZbSJXWDYWv",
  "thread_0L2t22nLO2VNLQVkv9f3pc9w",
  "thread_01i8anovkRDycBDLlWDTYJ7S",
  "thread_0NzEH8kNpNTO7SQmNaLOtVsT",
  "thread_0aN4twMB29IkRwaqP8tyiBIv",
  "thread_00UU1MVGsXJ49L16ONfeJ0nx",
  "thread_0TaSfyloy5uyrFADdw6GNxLz",
  "thread_0M5je92zIWyZAoPPryvMIr47",
  "thread_040X6qu8fCr1wSodWEa4oONk",
  "thread_0n20RJpb9sJthAS0hXIAYJcH",
  "thread_0XPb9W0SvnxX8sk3Z7y3mGiT",
  "thread_0Ij7AyaPb8QnI0CVrNvthYC0",
  "thread_0ILjTsUgNA7RMfrjNBMorhxB",
  "thread_0NsZU1LCJa8SKhV8uESFMO9M",
  "thread_04hnc7zCsIXK6FPf063rq15y",
  "thread_0hldiyat20VDfoZlwx2cl2a3",
  "thread_0vGuUoffSwWVWYclUoSkTFnc",
  "thread_0sfN0Z9pMcWJOXlhGPPPgwcO",
  "thread_0qeLygAoLCMy00DErI9eeIdb",
  "thread_0rGLpIs72kRBwH9VZSprhWko",
  "thread_0VWlj2kBNRMJvsZzVpuKoxsA",
  "thread_0SHfC1IXEunrdMgZAq5u3UNu",
  "thread_0kPHb2meRpoRWQlSA9Gq7Swt",
  "thread_0nNUPyegWPjDnSAzCRutt9ZI",
  "thread_0yCxCD4ZT6fYeLfQRRKJDBE3",
  "thread_0YlUDMA2P1EWe7eOKh90SSl0",
  "thread_02y3NMr97BsQkB2CGFrO40g9",
  "thread_0YZzvaiHzYYtdFftHc7fbQ4G",
  "thread_0oRvIf7SR3egG3mfkBUL3gik",
  "thread_00cAKWYd4kSCV7jJ89Q8o2rr",
  "thread_0Aep2maEHQbRMrNJ3cp0gJ5T",
  "thread_0yW6iUJxS4izqu1YsRfKsBAn",
  "thread_0Ye97hPnefBBiPGEMtJgKuZR",
  "thread_0AJT4dM0vWRJnBY8ZwPsfpas",
  "thread_0g2S87mbGsaajxaARcyzNG35",
  "thread_07YBO2wUH5cV2hf8KmevKuhw",
  "thread_06AWdeBlDO8gBu0t8b0ouCta",
  "thread_0eOcsLukzp3AVlNn2eQkgNN7",
  "thread_0BJs59lvhuVfzGRU423m1J6H",
  "thread_0fAT0OgOIvIvs2YU1xWT4GMY",
  "thread_00fy23n9fdSo3RT7E3ou0mwA",
  "thread_07ElXWgEawqtkgJFUygb1uI4",
];

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

    // Use hardcoded list of threadIds to keep
    const threadIdsToKeep = new Set(THREAD_IDS_TO_KEEP);
    console.log(`🔒 Thread IDs to keep: ${threadIdsToKeep.size}\n`);

    // List all threads from AssistantCloud for the target user
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

        // Delete threads not in our keep list
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
