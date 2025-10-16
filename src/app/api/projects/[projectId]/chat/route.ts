import { RuntimeContext } from "@mastra/core/runtime-context";
import { stackServerApp } from "@/lib/stack/server";
import { db } from "@/lib/db/db";
import { projectsTable } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { mastra } from "@/mastra";
import {
  createFreestyleMcpClient,
  createNeonMcpClient,
  getProjectToolsets,
} from "@/mastra/lib/mcp-clients";
import type { ProjectContext } from "@/mastra/agents/codegenAgent";

// Allow streaming responses up to 5 minutes (dev server operations can be slow)
export const maxDuration = 300;

interface RouteParams {
  params: Promise<{
    projectId: string;
  }>;
}

/**
 * Project-specific chat API route
 * 
 * This route:
 * 1. Authenticates the user and verifies project ownership
 * 2. Creates MCP clients for Freestyle and Neon (project-specific)
 * 3. Gets toolsets from MCP clients for dynamic tool configuration
 * 4. Creates RuntimeContext with project data
 * 5. Calls the registered agent with toolsets and runtime context
 * 6. Streams the response back to the client
 */
export async function POST(req: Request, { params }: RouteParams) {
  try {
    // Get projectId from URL params
    const { projectId } = await params;
    const { messages } = await req.json();

    console.log("[Chat API] Request for projectId:", projectId);

    // Verify required environment variables
    if (!process.env.FREESTYLE_API_KEY) {
      console.error("[Chat API] FREESTYLE_API_KEY not set!");
      return new Response(
        "Server configuration error: FREESTYLE_API_KEY not set",
        { status: 500 },
      );
    }

    if (!process.env.NEON_API_KEY) {
      console.error("[Chat API] NEON_API_KEY not set!");
      return new Response(
        "Server configuration error: NEON_API_KEY not set",
        { status: 500 },
      );
    }

    // Verify user authentication and project ownership
    const user = await stackServerApp.getUser();
    if (!user) {
      return new Response("Unauthorized", { status: 401 });
    }

    // Fetch project from database
    const [project] = await db
      .select()
      .from(projectsTable)
      .where(
        and(eq(projectsTable.id, projectId), eq(projectsTable.userId, user.id)),
      )
      .limit(1);

    if (!project) {
      return new Response("Project not found", { status: 404 });
    }

    console.log("[Chat API] Project found:", project.name);
    console.log("[Chat API] RepoId:", project.repoId);

    // Create MCP clients for this specific project
    const { mcpClient: freestyleMcp, devServerInfo } =
      await createFreestyleMcpClient(project.repoId);
    const neonMcp = createNeonMcpClient(project.neonProjectId);

    console.log("[Chat API] Dev server info:", devServerInfo);

    // Get toolsets from MCP clients (dynamic tools pattern)
    const toolsets = await getProjectToolsets(freestyleMcp, neonMcp);
    console.log("[Chat API] Toolsets loaded");

    // Create RuntimeContext with project data
    const runtimeContext = new RuntimeContext();
    const projectContext: ProjectContext = {
      projectId: project.id,
      projectName: project.name,
      neonProjectId: project.neonProjectId,
      repoId: project.repoId,
      userId: user.id,
    };
    runtimeContext.set("project", projectContext);

    console.log("[Chat API] Streaming with agent...");

    // Get the registered agent from Mastra instance
    const agent = mastra.getAgent("codegenAgent");

    // Call agent with dynamic toolsets and runtime context
    const result = await agent.stream(messages, {
      toolsets: toolsets as any, // Dynamic tools for this project
      runtimeContext, // Project-specific context
      format: "aisdk", // Use AI SDK v5 format for compatibility
    });

    // Return stream response
    return result.toUIMessageStreamResponse();
  } catch (error) {
    console.error("[Chat API] Error:", error);
    return new Response(
      JSON.stringify({
        error: "Failed to process chat request",
        details: error instanceof Error ? error.message : String(error),
      }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }
}
