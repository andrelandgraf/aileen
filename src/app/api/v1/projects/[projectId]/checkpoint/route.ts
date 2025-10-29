import { NextResponse } from "next/server";
import { stackServerApp } from "@/lib/stack/server";
import { db } from "@/lib/db/db";
import { projectsTable, projectSecretsTable } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { createManualCheckpoint } from "@/lib/workflows";

interface RouteParams {
  params: Promise<{
    projectId: string;
  }>;
}

// POST to create a manual checkpoint
export async function POST(req: Request, { params }: RouteParams) {
  try {
    const { projectId } = await params;
    const body = await req.json();
    const { assistantMessageId } = body;

    console.log("[POST Checkpoint] Request for projectId:", projectId);
    console.log("[POST Checkpoint] Assistant message ID:", assistantMessageId);

    // Verify user authentication
    const user = await stackServerApp.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Verify project ownership
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

    // Validate that the project has a current dev version
    if (!project.currentDevVersionId) {
      return NextResponse.json(
        { error: "No current dev version found for project" },
        { status: 400 },
      );
    }

    console.log(
      "[POST Checkpoint] Current dev version ID:",
      project.currentDevVersionId,
    );

    // Fetch secrets for the current dev version
    console.log("[POST Checkpoint] Fetching secrets for current version...");
    const [currentSecrets] = await db
      .select()
      .from(projectSecretsTable)
      .where(
        eq(projectSecretsTable.projectVersionId, project.currentDevVersionId),
      )
      .limit(1);

    if (!currentSecrets) {
      return NextResponse.json(
        { error: "No secrets found for current version" },
        { status: 404 },
      );
    }

    console.log("[POST Checkpoint] Triggering checkpoint workflow...");

    await createManualCheckpoint(
      projectId,
      project.repoId,
      project.neonProjectId,
      project.currentDevVersionId,
      currentSecrets.secrets,
      assistantMessageId || null,
    ).catch((error) => {
      console.error("[POST Checkpoint] Workflow error:", error);
    });

    console.log("[POST Checkpoint] Checkpoint workflow triggered");

    return NextResponse.json(
      {
        message: "Checkpoint creation started",
      },
      { status: 202 },
    );
  } catch (error) {
    console.error("[POST Checkpoint] Error:", error);
    return NextResponse.json(
      {
        error: "Failed to create checkpoint",
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 },
    );
  }
}
