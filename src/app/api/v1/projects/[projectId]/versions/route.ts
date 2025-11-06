import { NextResponse } from "next/server";
import { stackServerApp } from "@/lib/stack/server";
import { db } from "@/lib/db/db";
import {
  projectsTable,
  projectVersionsTable,
  projectSecretsTable,
} from "@/lib/db/schema";
import { eq, and, desc } from "drizzle-orm";
import { setMainBranchToCommit } from "@/lib/freestyle";
import { neonService } from "@/lib/neon";
import { requestDevServer } from "@/lib/dev-server";
import { decrypt } from "@/lib/encryption";

interface RouteParams {
  params: Promise<{
    projectId: string;
  }>;
}

// GET all versions for a project
export async function GET(req: Request, { params }: RouteParams) {
  try {
    const { projectId } = await params;

    console.log("[GET Versions] Request for projectId:", projectId);

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

    // Fetch all versions for this project, ordered by creation date (newest first)
    const versions = await db
      .select()
      .from(projectVersionsTable)
      .where(eq(projectVersionsTable.projectId, projectId))
      .orderBy(desc(projectVersionsTable.createdAt));

    console.log("[GET Versions] Found", versions.length, "versions");
    console.log(
      "[GET Versions] Current dev version ID:",
      project.currentDevVersionId,
    );

    return NextResponse.json(
      { versions, currentDevVersionId: project.currentDevVersionId },
      { status: 200 },
    );
  } catch (error) {
    console.error("[GET Versions] Error:", error);
    return NextResponse.json(
      {
        error: "Failed to fetch versions",
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 },
    );
  }
}

// POST to restore a version
export async function POST(req: Request, { params }: RouteParams) {
  try {
    const { projectId } = await params;
    const body = await req.json();
    const { versionId } = body;

    console.log("[POST Restore Version] Request for projectId:", projectId);
    console.log("[POST Restore Version] Version ID:", versionId);

    if (!versionId) {
      return NextResponse.json(
        { error: "Version ID is required" },
        { status: 400 },
      );
    }

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

    // Fetch the version to restore
    const [version] = await db
      .select()
      .from(projectVersionsTable)
      .where(
        and(
          eq(projectVersionsTable.id, versionId),
          eq(projectVersionsTable.projectId, projectId),
        ),
      )
      .limit(1);

    if (!version) {
      return NextResponse.json({ error: "Version not found" }, { status: 404 });
    }

    console.log("[POST Restore Version] Restoring version:", {
      gitCommitHash: version.gitCommitHash,
      neonSnapshotId: version.neonSnapshotId,
      summary: version.summary,
    });

    // Step 1: Fetch secrets for the version being restored
    console.log("[POST Restore Version] Fetching secrets for version...");
    const [versionSecrets] = await db
      .select()
      .from(projectSecretsTable)
      .where(eq(projectSecretsTable.projectVersionId, versionId))
      .limit(1);
    if (!versionSecrets) {
      return NextResponse.json(
        { error: "Version secrets not found" },
        { status: 404 },
      );
    }

    // Decrypt secrets
    console.log("[POST Restore Version] Decrypting secrets...");
    const decryptedJson = decrypt(versionSecrets.secrets);
    const secretsData: Record<string, string> = JSON.parse(decryptedJson);

    // Step 2: Request dev server to get process access (also allowlists domain in Neon Auth)
    console.log("[POST Restore Version] Requesting dev server...");
    const devServerResponse = await requestDevServer(
      project,
      secretsData,
    );

    console.log("[POST Restore Version] Dev server ready");

    // Step 3: Reset Git to the commit hash
    console.log(
      "[POST Restore Version] Resetting Git to commit:",
      version.gitCommitHash,
    );
    await setMainBranchToCommit(
      devServerResponse.process,
      version.gitCommitHash,
    );
    console.log("[POST Restore Version] Git reset successful");

    // Step 4: Get the main branch ID for Neon
    console.log("[POST Restore Version] Getting main branch ID...");
    const branches = await neonService.getAllBranches(project.neonProjectId);
    const mainBranch = branches.find(
      (b) => b.name === "main" || b.name === "master" || !b.parent_id,
    );

    if (!mainBranch || !mainBranch.id) {
      throw new Error("Could not find main branch");
    }

    console.log("[POST Restore Version] Main branch ID:", mainBranch.id);

    // Step 5: Apply the snapshot to restore the database
    console.log(
      "[POST Restore Version] Applying snapshot:",
      version.neonSnapshotId,
    );
    await neonService.applySnapshot(
      project.neonProjectId,
      version.neonSnapshotId,
      mainBranch.id,
    );
    console.log("[POST Restore Version] Snapshot applied successfully");

    // Step 6: Update the project's current dev version
    console.log(
      "[POST Restore Version] Updating project's current dev version...",
    );
    await db
      .update(projectsTable)
      .set({ currentDevVersionId: version.id })
      .where(eq(projectsTable.id, projectId));
    console.log(
      "[POST Restore Version] Updated current dev version to",
      version.id,
    );

    console.log("[POST Restore Version] Version restored successfully");

    return NextResponse.json(
      {
        message: "Version restored successfully",
        version: {
          id: version.id,
          summary: version.summary,
          createdAt: version.createdAt,
        },
      },
      { status: 200 },
    );
  } catch (error) {
    console.error("[POST Restore Version] Error:", error);
    return NextResponse.json(
      {
        error: "Failed to restore version",
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 },
    );
  }
}
