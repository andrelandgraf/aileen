import { RuntimeContext } from "@mastra/core/runtime-context";
import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import { neonMcpClient } from "../mcp/neon";
import { context7McpClient } from "../mcp/context7";
import type { CodegenRuntimeContext } from "./context";

import { getNeonConnectionUri } from "@/lib/neon/connection-uri";
import { freestyleService } from "@/lib/freestyle";

export async function createFreestyleTools(
  repoId: string,
  neonProjectId: string,
) {
  // Get the database connection URI
  const databaseUrl = await getNeonConnectionUri({
    projectId: neonProjectId,
  });

  // Request dev server using the freestyle service
  const devServerResponse = await freestyleService.requestDevServer({
    repoId,
    envVars: {
      DATABASE_URL: databaseUrl,
    },
  });

  const { commitAndPush, process, isNew } = devServerResponse;

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
      "Commit all changes and push them to the git repository. This should be called after making changes to save your work.",
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
    }),
    execute: async ({ context }) => {
      try {
        console.log(
          `[freestyle-commit-and-push] Committing with message: "${context.message}"`,
        );
        await commitAndPush(context.message);
        console.log(
          `[freestyle-commit-and-push] Successfully committed and pushed`,
        );
        return {
          success: true,
          message: `Successfully committed and pushed with message: "${context.message}"`,
        };
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : String(error);
        console.error(
          `[freestyle-commit-and-push] Error committing and pushing:`,
          JSON.stringify(error, Object.getOwnPropertyNames(error), 2),
        );
        console.error(`[freestyle-commit-and-push] Error object:`, error);
        return {
          success: false,
          message: `Failed to commit and push: ${errorMessage}`,
        };
      }
    },
  });

  return {
    "freestyle-exec": execTool,
    "freestyle-commit-and-push": commitAndPushTool,
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

  if (!project) {
    throw new Error("Project context required to load tools");
  }

  // Fetch tools in parallel
  const [freestyleTools, neonTools, context7Tools] = await Promise.all([
    createFreestyleTools(project.repoId, project.neonProjectId),
    neonMcpClient.getTools(),
    context7McpClient.getTools(),
  ]);

  return {
    ...freestyleTools,
    ...neonTools,
    ...context7Tools,
  };
}
