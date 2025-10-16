import { RuntimeContext } from "@mastra/core/runtime-context";
import { stackServerApp } from "@/lib/stack/server";
import { db } from "@/lib/db/db";
import { projectsTable } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { mastra } from "@/mastra";
import { getCodegenTools } from "@/mastra/lib/tools";
import type {
  ProjectContext,
  CodegenRuntimeContext,
} from "@/mastra/lib/context";

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
 * 2. Creates Freestyle MCP client (project-specific)
 * 3. Gets toolsets from Freestyle MCP client for dynamic tool configuration
 * 4. Creates RuntimeContext with project data (includes Neon project ID for agent context)
 * 5. Calls the registered agent with toolsets and runtime context
 * 6. Streams the response back to the client
 *
 * Note: Neon MCP tools are shared across all projects (org-scoped).
 * The agent uses the project ID from RuntimeContext to focus on the right project.
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
      return new Response("Server configuration error: NEON_API_KEY not set", {
        status: 500,
      });
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

    // Create RuntimeContext with project data
    // Tools will be composed automatically from this context
    const runtimeContext = new RuntimeContext<CodegenRuntimeContext>();
    runtimeContext.set("project", {
      projectId: project.id,
      projectName: project.name,
      neonProjectId: project.neonProjectId,
      repoId: project.repoId,
      userId: user.id,
    });

    // Get the registered agent from Mastra instance
    const agent = mastra.getAgent("codegenAgent");

    // Call agent with runtime context
    // Tools are composed dynamically from the context
    const result = await agent.stream(messages, {
      runtimeContext,
      format: "aisdk",
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
