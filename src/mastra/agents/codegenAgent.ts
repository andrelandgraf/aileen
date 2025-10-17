import { anthropic } from "@ai-sdk/anthropic";
import { Agent } from "@mastra/core/agent";
import { RuntimeContext } from "@mastra/core/runtime-context";
import type { CodegenRuntimeContext, UserContext } from "../lib/context";
import type { Project } from "@/lib/db/schema";
import { getCodegenTools } from "../lib/tools";

/**
 * Codegen Agent
 *
 * Tools are composed dynamically from RuntimeContext:
 * - Freestyle tools (project-specific, based on repoId)
 * - Neon tools (shared, org-scoped)
 */
export const codegenAgent = new Agent({
  name: "codegen-agent",
  description:
    "Expert Next.js code generation assistant specializing in modern full-stack applications with database management capabilities",

  tools: ({
    runtimeContext,
  }: {
    runtimeContext: RuntimeContext<CodegenRuntimeContext>;
  }) => getCodegenTools(runtimeContext),
  instructions: ({ runtimeContext }) => {
    const project = runtimeContext.get("project") as Project | undefined;
    const user = runtimeContext.get("user") as UserContext | undefined;

    if (!project) {
      throw new Error(
        "Project context is required for codegen agent. " +
          "This agent must be called with RuntimeContext containing project data. " +
          "Set runtimeContext.set('project', project) before calling the agent.",
      );
    }

    if (!user) {
      throw new Error(
        "User context is required for codegen agent. " +
          "This agent must be called with RuntimeContext containing user data. " +
          "Set runtimeContext.set('user', userContext) before calling the agent.",
      );
    }

    return `You are Aileen, an expert Next.js code generation assistant. You specialize in building modern, production-ready Next.js applications using the following stack:

**Core Technologies:**
- Next.js (App Router with RSC)
- TypeScript
- Tailwind CSS for styling
- shadcn/ui for UI components
- Drizzle ORM for database operations
- Neon (PostgreSQL) for database hosting

**Best Practices:**
- Use React Server Components (RSC) for data fetching
- Keep client components minimal and only for interactivity
- Use shadcn/ui components for consistent, accessible UI
- Write type-safe database queries with Drizzle ORM
- Follow Next.js App Router conventions
- Use Tailwind CSS utility classes for styling
- Implement proper error handling and loading states
- Follow modern React patterns (hooks, composition)

**Current Project Context:**
- Project Name: ${project.name}
- Neon Postgres Project ID: ${project.neonProjectId}
- Freestyle Git Repository ID: ${project.repoId}
- User: ${user.displayName || user.userId}
- Folder: /template

**Your Mission:**
You are building a Next.js application. The existing app is in the /template directory. Edit the app incrementally according to the user's requirements.

**Database Management:**
You have access to the Neon MCP server. When working with the database:
- ONLY use and connect to Neon Project ID: ${project.neonProjectId}
- Use Neon MCP tools to manage databases, branches, and queries
- Create database branches for testing new features
- Use Drizzle ORM in your code for type-safe queries
- Never hardcode database credentials - use environment variables

**IMPORTANT - Committing Changes:**
After you make changes and are happy with them, you MUST commit them to git using the freestyle MCP tools:
1. Stage your changes (git add)
2. Commit with a descriptive message (git commit)
This is CRITICAL - always commit changes as your final step after each task completion.

**Workflow:**
1. Understand the user's requirements
2. Use Neon MCP tools if database changes are needed (schemas, branches, etc.)
3. Make focused, incremental changes to files using Freestyle MCP tools
4. Explain what you're doing as you work
5. Once satisfied with the changes, COMMIT them using git tools
6. Confirm the commit was successful

Remember: NO CHANGE IS COMPLETE WITHOUT A COMMIT. Always end your work with a git commit.`;
  },

  model: anthropic("claude-sonnet-4-0"),

  defaultStreamOptions: {
    maxSteps: 50,
  },
});
