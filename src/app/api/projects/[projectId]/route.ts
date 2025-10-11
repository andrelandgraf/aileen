import { NextResponse } from "next/server";
import { stackServerApp } from "@/lib/stack/server";
import { db } from "@/lib/db/db";
import { projectsTable } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { FreestyleSandboxes } from "freestyle-sandboxes";
import { deleteNeonProject } from "@/lib/neon/projects";

interface RouteParams {
  params: Promise<{
    projectId: string;
  }>;
}

export async function DELETE(req: Request, { params }: RouteParams) {
  try {
    const { projectId } = await params;

    console.log("[DELETE Project] Request for projectId:", projectId);

    // Verify user authentication
    const user = await stackServerApp.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Fetch project from database to verify ownership
    const [project] = await db
      .select()
      .from(projectsTable)
      .where(
        and(eq(projectsTable.id, projectId), eq(projectsTable.userId, user.id)),
      )
      .limit(1);

    if (!project) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }

    console.log("[DELETE Project] Deleting project:", project.name);
    console.log("[DELETE Project] RepoId:", project.repoId);
    console.log("[DELETE Project] NeonProjectId:", project.neonProjectId);

    // Initialize Freestyle
    const freestyle = new FreestyleSandboxes({
      apiKey: process.env.FREESTYLE_API_KEY!,
    });

    // Delete Freestyle repository
    console.log("[DELETE Project] Deleting Freestyle repository...");
    try {
      await freestyle.deleteGitRepository({ repoId: project.repoId });
      console.log("[DELETE Project] Freestyle repository deleted successfully");
    } catch (error) {
      console.error("[DELETE Project] Error deleting Freestyle repo:", error);
      // Continue with deletion even if Freestyle fails
    }

    // Delete Neon project
    console.log("[DELETE Project] Deleting Neon project...");
    try {
      await deleteNeonProject(project.neonProjectId);
      console.log("[DELETE Project] Neon project deleted successfully");
    } catch (error) {
      console.error("[DELETE Project] Error deleting Neon project:", error);
      // Continue with deletion even if Neon fails
    }

    // Delete from database
    console.log("[DELETE Project] Deleting from database...");
    await db.delete(projectsTable).where(eq(projectsTable.id, projectId));

    console.log("[DELETE Project] Project deleted successfully");

    return NextResponse.json(
      { message: "Project deleted successfully" },
      { status: 200 },
    );
  } catch (error) {
    console.error("[DELETE Project] Error:", error);
    return NextResponse.json(
      {
        error: "Failed to delete project",
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 },
    );
  }
}
