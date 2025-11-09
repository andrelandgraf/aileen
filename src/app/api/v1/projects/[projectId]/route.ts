import { NextResponse } from "next/server";
import { stackServerApp } from "@/lib/stack/server";
import { db } from "@/lib/db/db";
import { projectsTable } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { start } from "workflow/api";
import { deleteProject } from "@/lib/workflows";

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

    console.log("[DELETE Project] Triggering workflow for project deletion...");
    await start(deleteProject, [project]);

    return NextResponse.json(
      { message: "Project deletion started" },
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
