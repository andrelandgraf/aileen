import { NextResponse } from "next/server";
import { stackServerApp } from "@/lib/stack/server";
import { db } from "@/lib/db/db";
import { projectsTable } from "@/lib/db/schema";
import { and, eq } from "drizzle-orm";
import { freestyleService } from "@/lib/freestyle";

export async function POST(request: Request) {
  try {
    const user = await stackServerApp.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    if (!body || typeof body !== "object") {
      return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
    }

    const { projectId, gitRef } = body as {
      projectId?: unknown;
      gitRef?: unknown;
    };

    if (typeof projectId !== "string" || projectId.length === 0) {
      return NextResponse.json(
        { error: "Missing or invalid projectId" },
        { status: 400 },
      );
    }

    const resolvedGitRef =
      typeof gitRef === "string" && gitRef.trim().length > 0 ? gitRef : null;

    const [project] = await db
      .select({
        id: projectsTable.id,
        repoId: projectsTable.repoId,
      })
      .from(projectsTable)
      .where(
        and(eq(projectsTable.id, projectId), eq(projectsTable.userId, user.id)),
      )
      .limit(1);

    if (!project) {
      return NextResponse.json(
        { error: "Project not found" },
        { status: 404 },
      );
    }

    const { restarted } = await freestyleService.restartDevServer({
      repoId: project.repoId,
      gitRef: resolvedGitRef,
    });

    return NextResponse.json({ restarted });
  } catch (error) {
    console.error("[API] Error restarting dev server:", error);
    return NextResponse.json(
      { error: "Failed to restart dev server" },
      { status: 500 },
    );
  }
}
