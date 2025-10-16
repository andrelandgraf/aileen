import { getUser } from "./stackauth";
import { db } from "@/lib/db/db";
import { projectsTable } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import type { Context, Next } from "hono";
import type { UserContext } from "./context";

export async function authenticateAndAuthorize(c: Context, next: Next) {
  try {
    const url = new URL(c.req.url);
    if (!url.pathname.includes("/api/agents/codegenAgent/stream")) {
      return await next();
    }

    // Get RuntimeContext and populate with project and user data
    const runtimeContext = c.get("runtimeContext");
    console.log("[Mastra Auth] RuntimeContext:", runtimeContext);
    if (runtimeContext.get("project") && runtimeContext.get("user")) {
      console.log("[Mastra Auth] RuntimeContext already populated");
      return await next();
    }

    const authHeader = c.req.header("authorization");
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      console.error("[Mastra Auth] No authorization header found");
      return c.json({ error: "Unauthorized" }, 401);
    }

    const accessToken = authHeader.split(" ")[1];
    if (!accessToken) {
      console.error("[Mastra Auth] No access token found");
      return c.json({ error: "Unauthorized" }, 401);
    }

    const user = await getUser(accessToken);
    if (!user) {
      console.error("[Mastra Auth] Failed to authenticate user");
      return c.json({ error: "Unauthorized" }, 401);
    }

    console.log("[Mastra Auth] User authenticated:", user.id);

    const projectId = c.req.query("projectId");
    if (!projectId) {
      console.error("[Mastra Auth] No projectId provided");
      return c.json({ error: "Missing projectId" }, 400);
    }

    console.log("[Mastra Auth] Checking project access:", projectId);

    const [project] = await db
      .select()
      .from(projectsTable)
      .where(
        and(eq(projectsTable.id, projectId), eq(projectsTable.userId, user.id)),
      )
      .limit(1);

    if (!project) {
      console.error(
        "[Mastra Auth] Project not found or user doesn't have access",
      );
      return c.json({ error: "Forbidden" }, 403);
    }

    console.log("[Mastra Auth] Project access verified:", project.name);

    // Set project (all fields from database)
    runtimeContext.set("project", project);

    // Set user context
    const userContext: UserContext = {
      userId: user.id,
      displayName: user.displayName || null,
    };
    runtimeContext.set("user", userContext);

    console.log(
      "[Mastra Auth] RuntimeContext populated with project and user data",
    );

    await next();
  } catch (error) {
    console.error("[Mastra Auth] Authentication error:", error);
    return c.json({ error: "Internal server error" }, 500);
  }
}
