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
      return NextResponse.json(
        { error: "Invalid request body" },
        { status: 400 },
      );
    }

    const { projectId, lines, gitRef } = body as {
      projectId?: unknown;
      lines?: unknown;
      gitRef?: unknown;
    };

    if (typeof projectId !== "string" || projectId.length === 0) {
      return NextResponse.json(
        { error: "Missing or invalid projectId" },
        { status: 400 },
      );
    }

    let resolvedLines: number | null = null;
    if (typeof lines === "number") {
      if (!Number.isInteger(lines) || lines <= 0) {
        return NextResponse.json(
          { error: "lines must be a positive integer" },
          { status: 400 },
        );
      }
      resolvedLines = lines;
    } else if (lines !== null && lines !== undefined) {
      return NextResponse.json(
        { error: "lines must be a positive integer, null, or undefined" },
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
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }

    const { logs } = await freestyleService.getDevServerLogs({
      repoId: project.repoId,
      gitRef: resolvedGitRef,
      lines: resolvedLines,
    });

    return NextResponse.json({ logs });
  } catch (error) {
    console.error("[API] Error fetching dev server logs:", error);
    return NextResponse.json(
      { error: "Failed to fetch dev server logs" },
      { status: 500 },
    );
  }
}
