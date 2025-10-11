import { MCPClient } from "@mastra/mcp";
import { Mastra } from "@mastra/core";
import { Agent } from "@mastra/core/agent";
import { openai } from "@ai-sdk/openai";
import { FreestyleSandboxes } from "freestyle-sandboxes";
import { stackServerApp } from "@/lib/stack/server";
import { db } from "@/lib/db/db";
import { projectsTable } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";

// Allow streaming responses up to 60 seconds (dev server cold start can take time)
export const maxDuration = 60;

const freestyle = new FreestyleSandboxes({
  apiKey: process.env.FREESTYLE_API_KEY!,
});

interface RouteParams {
  params: Promise<{
    projectId: string;
  }>;
}

export async function POST(req: Request, { params }: RouteParams) {
  try {
    // Get projectId from URL params
    const { projectId } = await params;
    const { messages } = await req.json();

    console.log("[Chat API] Request for projectId:", projectId);
    
    // Verify Freestyle API key is set
    if (!process.env.FREESTYLE_API_KEY) {
      console.error("[Chat API] FREESTYLE_API_KEY not set!");
      return new Response("Server configuration error: FREESTYLE_API_KEY not set", { status: 500 });
    }
    console.log("[Chat API] Freestyle API key verified");

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

    // Request dev server to get MCP URL
    console.log("[Chat API] Requesting dev server...");
    console.log("[Chat API] This may take 20-30 seconds on cold start...");
    
    let devServerResponse;
    try {
      // Add timeout wrapper (45 seconds)
      const timeoutPromise = new Promise((_, reject) => 
        setTimeout(() => reject(new Error("Dev server request timed out after 45s")), 45000)
      );
      
      devServerResponse = await Promise.race([
        freestyle.requestDevServer({
          repoId: project.repoId,
        }),
        timeoutPromise
      ]);
      
      console.log("[Chat API] Dev server request completed successfully");
    } catch (error) {
      console.error("[Chat API] Dev server request failed:", error);
      throw error;
    }
    
    const { ephemeralUrl, mcpEphemeralUrl, codeServerUrl } = devServerResponse as any;

    console.log("[Chat API] Dev server URLs:", {
      ephemeralUrl,
      mcpEphemeralUrl,
      codeServerUrl,
    });

    // Create MCP client connected to the Freestyle dev server
    console.log("[Chat API] Creating Freestyle MCP client...");
    const freestyleMcp = new MCPClient({
      id: `freestyle-dev-${project.repoId}`,
      servers: {
        freestyleDevServer: {
          url: new URL(mcpEphemeralUrl),
        },
      },
    });

    // Create MCP client connected to Neon
    console.log("[Chat API] Creating Neon MCP client...");
    const neonMcp = new MCPClient({
      id: `neon-${project.neonProjectId}`,
      servers: {
        neon: {
          url: new URL("https://mcp.neon.tech/mcp"),
          requestInit: {
            headers: {
              Authorization: `Bearer ${process.env.NEON_API_KEY}`,
            },
          },
        },
      },
    });

    // Get tools from both MCP servers
    console.log("[Chat API] Getting tools from Freestyle MCP server...");
    const freestyleTools = await freestyleMcp.getTools();
    console.log(
      "[Chat API] Freestyle MCP tools available:",
      Object.keys(freestyleTools).length,
    );
    console.log("[Chat API] Freestyle tool names:", Object.keys(freestyleTools));

    console.log("[Chat API] Getting tools from Neon MCP server...");
    const neonTools = await neonMcp.getTools();
    console.log(
      "[Chat API] Neon MCP tools available:",
      Object.keys(neonTools).length,
    );
    console.log("[Chat API] Neon tool names:", Object.keys(neonTools));

    // Combine tools from both MCP servers
    const tools = { ...freestyleTools, ...neonTools };
    console.log(
      "[Chat API] Total MCP tools available:",
      Object.keys(tools).length,
    );
    console.log("[Chat API] All tool names:", Object.keys(tools));

    // Create a dynamic codegen agent with MCP tools
    const codegenAgent = new Agent({
      name: "codegen-agent-mcp",
      instructions:
        "You are Aileen, an expert Next.js code generation assistant.\n\n" +
        `**Project Context:**\n` +
        `- Project Name: ${project.name}\n` +
        `- Neon Project ID: ${project.neonProjectId}\n` +
        `- Repository ID: ${project.repoId}\n\n` +
        "**Your Mission:**\n" +
        "You are building a Next.js application. The existing app is in the /template directory. " +
        "Edit the app incrementally according to the user's requirements.\n\n" +
        "**Tech Stack:**\n" +
        "- Next.js (App Router with React Server Components)\n" +
        "- TypeScript\n" +
        "- Tailwind CSS for styling\n" +
        "- shadcn/ui for UI components\n" +
        "- Drizzle ORM for database operations\n" +
        "- Neon (PostgreSQL) for database hosting\n\n" +
        "**Database Management:**\n" +
        `You have access to the Neon MCP server. When working with the database:\n` +
        `- ONLY use and connect to Neon Project ID: ${project.neonProjectId}\n` +
        `- Use Neon MCP tools to manage databases, branches, and queries\n` +
        `- Create database branches for testing new features\n` +
        `- Use Drizzle ORM in your code for type-safe queries\n` +
        `- Never hardcode database credentials - use environment variables\n\n` +
        "**Best Practices:**\n" +
        "- Use React Server Components for data fetching\n" +
        "- Keep client components minimal and only for interactivity\n" +
        "- Use shadcn/ui components for consistent, accessible UI\n" +
        "- Write type-safe database queries with Drizzle ORM\n" +
        "- Follow Next.js App Router conventions\n" +
        "- Use Tailwind CSS utility classes\n" +
        "- Implement proper error handling and loading states\n\n" +
        "**IMPORTANT - Committing Changes:**\n" +
        "After you make changes and are happy with them, you MUST commit them to git using the MCP tools:\n" +
        "1. Stage your changes (git add)\n" +
        "2. Commit with a descriptive message (git commit)\n" +
        "This is CRITICAL - always commit changes as your final step after each task completion.\n" +
        "The deployment will be triggered automatically after commits.\n\n" +
        "**Workflow:**\n" +
        "1. Understand the user's requirements\n" +
        "2. Use Neon MCP tools if database changes are needed (schemas, branches, etc.)\n" +
        "3. Make focused, incremental changes to files\n" +
        "4. Explain what you're doing as you work\n" +
        "5. Once satisfied with the changes, COMMIT them using git tools\n" +
        "6. Confirm the commit was successful\n\n" +
        "Remember: NO CHANGE IS COMPLETE WITHOUT A COMMIT. Always end your work with a git commit.",
      model: openai("gpt-4o"),
      tools,
    });

    // Create Mastra instance with the agent
    const mastra = new Mastra({
      agents: { codegenAgent },
    });

    console.log("[Chat API] Streaming with Mastra agent and MCP tools...");

    // Get agent and stream response
    const agent = mastra.getAgent("codegenAgent");
    const result = await agent.stream(messages);

    // Trigger deployment after chat completes (async, don't wait)
    console.log("[Chat API] Triggering deployment after chat response...");
    fetch(
      `${process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"}/api/projects/${projectId}/deploy`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
      },
    ).catch((error) => {
      console.error("[Chat API] Failed to trigger deployment:", error);
    });

    return result.aisdk.v5.toUIMessageStreamResponse;
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
