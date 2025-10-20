import { RuntimeContext } from "@mastra/core/runtime-context";
import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import { neonMcpClient } from "../mcp/neon";
import { context7McpClient } from "../mcp/context7";
import type { CodegenRuntimeContext } from "./context";
import { eq, asc } from "drizzle-orm";

import { freestyleService } from "@/lib/freestyle";
import { neonService } from "@/lib/neon";
import { db } from "@/lib/db/db";
import {
  projectVersionsTable,
  projectsTable,
  projectSecretsTable,
} from "@/lib/db/schema";

export async function createFreestyleTools(
  repoId: string,
  neonProjectId: string,
  projectId: string,
  assistantMessageId: string,
  runtimeContext: RuntimeContext<CodegenRuntimeContext>,
) {
  // Fetch the project to get current dev version
  const [project] = await db
    .select()
    .from(projectsTable)
    .where(eq(projectsTable.id, projectId))
    .limit(1);

  if (!project) {
    throw new Error(`Project ${projectId} not found`);
  }

  let secrets: Record<string, string> = {};

  // If there's a current dev version, fetch its secrets
  if (project.currentDevVersionId) {
    console.log(
      `[createFreestyleTools] Fetching secrets for version: ${project.currentDevVersionId}`,
    );
    const [versionSecrets] = await db
      .select()
      .from(projectSecretsTable)
      .where(
        eq(projectSecretsTable.projectVersionId, project.currentDevVersionId),
      )
      .limit(1);

    if (versionSecrets) {
      secrets = versionSecrets.secrets;
      console.log(
        `[createFreestyleTools] Loaded ${Object.keys(secrets).length} secrets from version`,
      );
    } else {
      console.log(
        `[createFreestyleTools] No secrets found for version, generating fresh DATABASE_URL`,
      );
      // Fallback: generate DATABASE_URL if no secrets found
      const databaseUrl = await neonService.getConnectionUri({
        projectId: neonProjectId,
      });
      secrets = { DATABASE_URL: databaseUrl };
    }
  } else {
    console.log(
      `[createFreestyleTools] No current version set, trying to fetch initial version secrets`,
    );
    // No current version set - try to fetch the initial version's secrets
    const [initialVersion] = await db
      .select()
      .from(projectVersionsTable)
      .where(eq(projectVersionsTable.projectId, projectId))
      .orderBy(asc(projectVersionsTable.createdAt))
      .limit(1);

    if (initialVersion) {
      console.log(
        `[createFreestyleTools] Found initial version: ${initialVersion.id}`,
      );
      const [versionSecrets] = await db
        .select()
        .from(projectSecretsTable)
        .where(eq(projectSecretsTable.projectVersionId, initialVersion.id))
        .limit(1);

      if (versionSecrets) {
        secrets = versionSecrets.secrets;
        console.log(
          `[createFreestyleTools] Loaded ${Object.keys(secrets).length} secrets from initial version`,
        );
      }
    }

    // Final fallback if still no secrets
    if (Object.keys(secrets).length === 0) {
      console.log(
        `[createFreestyleTools] No secrets found, generating fresh DATABASE_URL`,
      );
      const databaseUrl = await neonService.getConnectionUri({
        projectId: neonProjectId,
      });
      secrets = { DATABASE_URL: databaseUrl };
    }
  }

  // Initialize environment variables in runtime context
  console.log(
    `[createFreestyleTools] Initializing environment variables in context`,
  );
  runtimeContext.set("environmentVariables", secrets);

  // Request dev server using the freestyle service
  const devServerResponse = await freestyleService.requestDevServer({
    repoId,
    secrets,
  });

  const { commitAndPush, process, fs } = devServerResponse;

  // List directory tool
  const lsTool = createTool({
    id: "freestyle-ls",
    description:
      "List contents of a directory in the project. Use this to explore the project structure and see what files exist.",
    inputSchema: z.object({
      path: z
        .string()
        .optional()
        .describe(
          "The directory path to list (relative to project root, e.g., 'src', 'src/app'). Leave empty or use '.' for root directory.",
        ),
    }),
    outputSchema: z.object({
      entries: z.array(z.string()).optional(),
      error: z.string().optional(),
    }),
    execute: async ({ context }) => {
      try {
        const path = context.path || undefined;
        console.log(`[freestyle-ls] Listing directory: ${path || "root"}`);
        const entries = await fs.ls(path);
        console.log(
          `[freestyle-ls] Found ${entries.length} entries in ${path || "root"}`,
        );
        return { entries };
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : String(error);
        console.error(
          `[freestyle-ls] Error listing directory:`,
          JSON.stringify(error, Object.getOwnPropertyNames(error), 2),
        );
        return {
          error: `Failed to list directory: ${errorMessage}`,
        };
      }
    },
  });

  // Read file tool
  const readFileTool = createTool({
    id: "freestyle-read-file",
    description:
      "Read the contents of a file in the project. Use this to inspect existing files before making changes.",
    inputSchema: z.object({
      path: z
        .string()
        .describe(
          "The file path to read (relative to project root, e.g., 'src/app/page.tsx')",
        ),
    }),
    outputSchema: z.object({
      content: z.string().optional(),
      error: z.string().optional(),
    }),
    execute: async ({ context }) => {
      try {
        console.log(`[freestyle-read-file] Reading file: ${context.path}`);
        const content = await fs.readFile(context.path, "utf-8");
        console.log(
          `[freestyle-read-file] Read ${content.length} characters from ${context.path}`,
        );
        return { content };
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : String(error);
        console.error(
          `[freestyle-read-file] Error reading file:`,
          JSON.stringify(error, Object.getOwnPropertyNames(error), 2),
        );
        return {
          error: `Failed to read file: ${errorMessage}`,
        };
      }
    },
  });

  // Write file tool
  const writeFileTool = createTool({
    id: "freestyle-write-file",
    description:
      "Write content to a file in the project. This will create the file if it doesn't exist or overwrite it if it does. Directories in the path will be created automatically.",
    inputSchema: z.object({
      path: z
        .string()
        .describe(
          "The file path to write (relative to project root, e.g., 'src/components/NewComponent.tsx')",
        ),
      content: z.string().describe("The content to write to the file"),
    }),
    outputSchema: z.object({
      success: z.boolean(),
      message: z.string(),
    }),
    execute: async ({ context }) => {
      try {
        console.log(`[freestyle-write-file] Writing file: ${context.path}`);
        await fs.writeFile(context.path, context.content, "utf-8");
        console.log(
          `[freestyle-write-file] Successfully wrote ${context.content.length} characters to ${context.path}`,
        );
        return {
          success: true,
          message: `Successfully wrote file: ${context.path}`,
        };
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : String(error);
        console.error(
          `[freestyle-write-file] Error writing file:`,
          JSON.stringify(error, Object.getOwnPropertyNames(error), 2),
        );
        return {
          success: false,
          message: `Failed to write file: ${errorMessage}`,
        };
      }
    },
  });

  // Execute command tool
  const execTool = createTool({
    id: "freestyle-exec",
    description:
      "Execute a shell command in the project environment. Use for running build commands, tests, or other CLI operations.",
    inputSchema: z.object({
      command: z.string().describe("The shell command to execute"),
      background: z
        .boolean()
        .optional()
        .describe(
          "Whether to run the command in the background (true for long-running commands like npm install, npm run dev, etc.)",
        ),
    }),
    outputSchema: z.object({
      id: z.string().optional(),
      isNew: z.boolean().optional(),
      stdout: z.array(z.string()).optional(),
      stderr: z.array(z.string()).optional(),
      error: z.string().optional(),
    }),
    execute: async ({ context }) => {
      try {
        // Validate db:push is not used
        if (context.command.includes("db:push")) {
          console.error(
            `[freestyle-exec] Attempted to use db:push which is not supported`,
          );
          return {
            error:
              "The db:push command is not available. Please use 'npm run db:generate' to generate migrations and 'npm run db:migrate' to apply them instead.",
          };
        }

        // Validate db:generate and db:migrate are not run in background
        if (
          (context.command.includes("db:generate") ||
            context.command.includes("db:migrate")) &&
          context.background === true
        ) {
          console.error(
            `[freestyle-exec] Attempted to run database command in background`,
          );
          return {
            error:
              "Database commands (db:generate, db:migrate) must be run in the foreground (background: false) so you can inspect the output and verify success. Please run this command again with background: false.",
          };
        }

        console.log(
          `[freestyle-exec] Executing command: ${context.command}${context.background ? " (background)" : ""}`,
        );
        const result = await process.exec(context.command, context.background);
        if (result.stderr && result.stderr.length > 0) {
          console.warn(
            `[freestyle-exec] Command stderr: ${result.stderr.join("\n")}`,
          );
        }
        console.log(
          `[freestyle-exec] Command completed with ${result.stdout?.length || 0} stdout lines`,
        );
        return result;
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : String(error);
        console.error(
          `[freestyle-exec] Error executing command:`,
          JSON.stringify(error, Object.getOwnPropertyNames(error), 2),
        );
        console.error(`[freestyle-exec] Error object:`, error);
        return {
          error: `Failed to execute command: ${errorMessage}`,
        };
      }
    },
  });

  // Commit and push tool
  const commitAndPushTool = createTool({
    id: "freestyle-commit-and-push",
    description:
      "Commit all changes and push them to the git repository. This should be called after making changes to save your work. This will also create a Neon snapshot of the database and store a version record.",
    inputSchema: z.object({
      message: z
        .string()
        .describe(
          "The commit message describing the changes made (e.g., 'Add new homepage component')",
        ),
    }),
    outputSchema: z.object({
      success: z.boolean(),
      message: z.string(),
      commitHash: z.string().optional(),
      snapshotId: z.string().optional(),
      versionId: z.string().optional(),
    }),
    execute: async ({ context }) => {
      try {
        console.log(
          `[freestyle-commit-and-push] Committing with message: "${context.message}"`,
        );

        // Commit and push changes
        await commitAndPush(context.message);
        console.log(
          `[freestyle-commit-and-push] Successfully committed and pushed`,
        );

        // Get the commit hash
        console.log(`[freestyle-commit-and-push] Getting commit hash...`);
        const commitHashResult = await process.exec("git rev-parse HEAD");
        const commitHash = commitHashResult.stdout?.join("\n").trim() || "";
        console.log(`[freestyle-commit-and-push] Commit hash: ${commitHash}`);

        // Create a Neon snapshot
        console.log(
          `[freestyle-commit-and-push] Creating Neon snapshot for project: ${neonProjectId}`,
        );
        const snapshotId = await neonService.createSnapshot(neonProjectId, {
          name: `snapshot-${commitHash.substring(0, 7)}`,
        });
        console.log(
          `[freestyle-commit-and-push] Created snapshot: ${snapshotId}`,
        );

        // Store the project version in the database
        console.log(
          `[freestyle-commit-and-push] Storing project version in database...`,
        );
        const [version] = await db
          .insert(projectVersionsTable)
          .values({
            projectId,
            gitCommitHash: commitHash,
            neonSnapshotId: snapshotId,
            assistantMessageId,
            summary: context.message,
          })
          .returning();
        console.log(
          `[freestyle-commit-and-push] Created version record: ${version.id}`,
        );

        // Get final environment variables from context and store as secrets for the new version
        const finalEnvVars = runtimeContext.get("environmentVariables") || {};
        console.log(
          `[freestyle-commit-and-push] Storing ${Object.keys(finalEnvVars).length} environment variables for version ${version.id}...`,
        );
        await db.insert(projectSecretsTable).values({
          projectVersionId: version.id,
          secrets: finalEnvVars,
        });
        console.log(
          `[freestyle-commit-and-push] Stored secrets for version ${version.id}`,
        );

        // Update the project's current dev version
        console.log(
          `[freestyle-commit-and-push] Updating project's current dev version...`,
        );
        await db
          .update(projectsTable)
          .set({ currentDevVersionId: version.id })
          .where(eq(projectsTable.id, projectId));
        console.log(
          `[freestyle-commit-and-push] Updated current dev version to ${version.id}`,
        );

        return {
          success: true,
          message: `Successfully committed and pushed with message: "${context.message}". Created snapshot ${snapshotId} and version ${version.id}.`,
          commitHash,
          snapshotId,
          versionId: version.id,
        };
      } catch (error) {
        // Extract detailed error information
        let errorMessage = "Unknown error";
        let errorDetails: any = {};

        if (error instanceof Error) {
          errorMessage = error.message;
          errorDetails = {
            name: error.name,
            message: error.message,
            stack: error.stack,
            // Include any additional properties
            ...(error as any),
          };
        } else if (typeof error === "object" && error !== null) {
          // Try to extract useful information from error object
          errorDetails = error;
          errorMessage =
            (error as any).message ||
            (error as any).error ||
            (error as any).statusText ||
            JSON.stringify(error);
        } else {
          errorMessage = String(error);
          errorDetails = { raw: error };
        }

        console.error(
          `[freestyle-commit-and-push] Error committing and pushing:`,
          JSON.stringify(
            errorDetails,
            Object.getOwnPropertyNames(errorDetails),
            2,
          ),
        );
        console.error(`[freestyle-commit-and-push] Error object:`, error);

        return {
          success: false,
          message: `Failed to commit and push: ${errorMessage}`,
        };
      }
    },
  });

  // List environment variables tool
  const listEnvTool = createTool({
    id: "list-environment-variables",
    description:
      "List all environment variable keys available in the project. Use this to see what environment variables are currently set.",
    inputSchema: z.object({}),
    outputSchema: z.object({
      keys: z.array(z.string()),
    }),
    execute: async () => {
      const envVars = runtimeContext.get("environmentVariables");
      const keys = Object.keys(envVars || {});
      console.log(`[list-environment-variables] Found ${keys.length} keys`);
      return { keys };
    },
  });

  // Get environment variable tool
  const getEnvTool = createTool({
    id: "get-environment-variable",
    description:
      "Get the value of a specific environment variable by its key. Returns the current value or an error if the key doesn't exist.",
    inputSchema: z.object({
      key: z
        .string()
        .describe(
          "The environment variable key to retrieve (e.g., 'DATABASE_URL')",
        ),
    }),
    outputSchema: z.object({
      value: z.string().optional(),
      error: z.string().optional(),
    }),
    execute: async ({ context }) => {
      const envVars = runtimeContext.get("environmentVariables");
      const value = envVars?.[context.key];

      if (value === undefined) {
        console.log(
          `[get-environment-variable] Key "${context.key}" not found`,
        );
        return {
          error: `Environment variable "${context.key}" not found`,
        };
      }

      console.log(
        `[get-environment-variable] Retrieved value for key "${context.key}"`,
      );
      return { value };
    },
  });

  // Set environment variable tool
  const setEnvTool = createTool({
    id: "set-environment-variable",
    description:
      "Set or update an environment variable. This will create a new variable if it doesn't exist or update the value if it does. Changes are kept in memory until you commit and push.",
    inputSchema: z.object({
      key: z
        .string()
        .describe("The environment variable key to set (e.g., 'API_KEY')"),
      value: z
        .string()
        .describe("The value to set for the environment variable"),
    }),
    outputSchema: z.object({
      success: z.boolean(),
      message: z.string(),
    }),
    execute: async ({ context }) => {
      const envVars = runtimeContext.get("environmentVariables") || {};
      const isNew = !(context.key in envVars);

      envVars[context.key] = context.value;
      runtimeContext.set("environmentVariables", envVars);

      console.log(
        `[set-environment-variable] ${isNew ? "Created" : "Updated"} key "${context.key}"`,
      );
      return {
        success: true,
        message: `Successfully ${isNew ? "created" : "updated"} environment variable "${context.key}"`,
      };
    },
  });

  return {
    "freestyle-ls": lsTool,
    "freestyle-read-file": readFileTool,
    "freestyle-write-file": writeFileTool,
    "freestyle-exec": execTool,
    "freestyle-commit-and-push": commitAndPushTool,
    "list-environment-variables": listEnvTool,
    "get-environment-variable": getEnvTool,
    "set-environment-variable": setEnvTool,
  };
}

/**
 * Get composed tools for the codegen agent
 * Combines Freestyle (project-specific) and Neon (shared) tools
 */
export async function getCodegenTools(
  runtimeContext: RuntimeContext<CodegenRuntimeContext>,
) {
  const project = runtimeContext.get("project");
  const assistantMessageId = runtimeContext.get("assistantMessageId");

  if (!project) {
    throw new Error("Project context required to load tools");
  }

  if (!assistantMessageId) {
    throw new Error("Assistant message ID required to load tools");
  }

  // Fetch tools in parallel
  const [freestyleTools, neonTools, context7Tools] = await Promise.all([
    createFreestyleTools(
      project.repoId,
      project.neonProjectId,
      project.id,
      assistantMessageId,
      runtimeContext,
    ),
    neonMcpClient.getTools(),
    context7McpClient.getTools(),
  ]);

  return {
    ...freestyleTools,
    ...neonTools,
    ...context7Tools,
  };
}
