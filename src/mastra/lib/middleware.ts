import { getUser } from "./stackauth";
import { db } from "@/lib/db/db";
import { projectsTable } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";

export interface AuthContext {
  user: any;
  projectId: string;
  project: any;
}

/**
 * Middleware to authenticate requests and verify project access
 * Returns null if authentication fails or user doesn't have access to the project
 */
export async function authenticateAndAuthorize(
  request: Request,
): Promise<AuthContext | null> {
  try {
    // Extract authorization header
    const authHeader = request.headers.get("authorization");
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      console.error("[Mastra Auth] No authorization header found");
      return null;
    }

    const accessToken = authHeader.split(" ")[1];
    if (!accessToken) {
      console.error("[Mastra Auth] No access token found");
      return null;
    }

    // Verify user authentication
    const user = await getUser(accessToken);
    if (!user) {
      console.error("[Mastra Auth] Failed to authenticate user");
      return null;
    }

    console.log("[Mastra Auth] User authenticated:", user.id);

    // Extract projectId from query params
    const url = new URL(request.url);
    const projectId = url.searchParams.get("projectId");
    if (!projectId) {
      console.error("[Mastra Auth] No projectId provided");
      return null;
    }

    console.log("[Mastra Auth] Checking project access:", projectId);

    // Verify project access
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
      return null;
    }

    console.log("[Mastra Auth] Project access verified:", project.name);

    return {
      user,
      projectId,
      project,
    };
  } catch (error) {
    console.error("[Mastra Auth] Authentication error:", error);
    return null;
  }
}
