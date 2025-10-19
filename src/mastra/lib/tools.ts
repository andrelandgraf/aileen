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
    "freestyle-ls": lsTool,
    "freestyle-read-file": readFileTool,
    "freestyle-write-file": writeFileTool,
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
