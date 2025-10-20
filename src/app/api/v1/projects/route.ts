import { NextResponse } from "next/server";
import { stackServerApp } from "@/lib/stack/server";
import { db } from "@/lib/db/db";
import {
  projectsTable,
  projectVersionsTable,
  projectSecretsTable,
} from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { freestyleService } from "@/lib/freestyle";
import { createAssistantThread } from "@/lib/assistant-ui";
import { neonService } from "@/lib/neon";
import { revalidatePath } from "next/cache";

export async function POST(request: Request) {
  try {
    const user = await stackServerApp.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { name } = body;

    console.log("[API] Create project request from user:", user.id);
    console.log("[API] Project name:", name);

    if (!name) {
      return NextResponse.json(
        { error: "Missing required field: name" },
        { status: 400 },
      );
    }

    // Create repo in Freestyle
    console.log("[API] Calling Freestyle API to create repo...");
    const { repoId } = await freestyleService.createRepo({ name });
    console.log("[API] Freestyle repo created with ID:", repoId);

    // Create Neon project
    console.log("[API] Calling Neon API to create project...");
    const { neonProjectId, databaseUrl } =
      await neonService.createProject(name);
    console.log("[API] Neon project created with ID:", neonProjectId);
    console.log("[API] Database URL:", databaseUrl);

    // Get production branch for Neon Auth initialization
    console.log("[API] Getting production branch...");
    const prodBranch = await neonService.getProductionBranch(neonProjectId);
    if (!prodBranch?.id) {
      throw new Error("Production branch not found");
    }
    console.log("[API] Production branch ID:", prodBranch.id);

    // Initialize Neon Auth
    console.log("[API] Initializing Neon Auth...");
    const neonAuth = await neonService.initNeonAuth(
      neonProjectId,
      prodBranch.id,
    );
    console.log("[API] Neon Auth initialized:", {
      projectId: neonAuth.auth_provider_project_id,
    });

    // Create AssistantCloud thread
    console.log("[API] Creating AssistantCloud thread...");
    const threadId = await createAssistantThread(user.id, name);
    console.log("[API] Thread created with ID:", threadId);

    // Create project in database with Freestyle repoId, Neon project ID, and thread ID
    console.log("[API] Inserting project into database...");
    console.log("[API] Insert values:", {
      name,
      repoId,
      neonProjectId,
      threadId,
      userId: user.id,
    });

    const [project] = await db
      .insert(projectsTable)
      .values({
        name,
        repoId,
        neonProjectId,
        threadId,
        userId: user.id,
      })
      .returning();

    console.log("[API] Project created successfully:", project);

    // Create initial snapshot (version 0)
    console.log("[API] Creating initial snapshot...");
    const initialSnapshotId = await neonService.createSnapshot(neonProjectId, {
      name: "initial",
    });
    console.log("[API] Initial snapshot created:", initialSnapshotId);

    // Create initial version 0
    console.log("[API] Creating initial version 0...");
    const [initialVersion] = await db
      .insert(projectVersionsTable)
      .values({
        projectId: project.id,
        gitCommitHash: "initial",
        neonSnapshotId: initialSnapshotId,
        assistantMessageId: null,
        summary: "Initial project setup",
      })
      .returning();
    console.log("[API] Initial version created:", initialVersion);

    // Create initial secrets with Neon Auth environment variables
    console.log("[API] Creating initial secrets...");
    const initialSecrets = {
      NEXT_PUBLIC_STACK_PROJECT_ID: neonAuth.auth_provider_project_id,
      NEXT_PUBLIC_STACK_PUBLISHABLE_CLIENT_KEY: neonAuth.pub_client_key,
      STACK_SECRET_SERVER_KEY: neonAuth.secret_server_key,
      DATABASE_URL: databaseUrl,
    };
    await db.insert(projectSecretsTable).values({
      projectVersionId: initialVersion.id,
      secrets: initialSecrets,
    });
    console.log("[API] Initial secrets created");

    // Set the current dev version to the initial version
    console.log("[API] Setting current dev version to initial version...");
    await db
      .update(projectsTable)
      .set({ currentDevVersionId: initialVersion.id })
      .where(eq(projectsTable.id, project.id));
    console.log("[API] Current dev version set");

    revalidatePath("/projects");

    return NextResponse.json(project, { status: 201 });
  } catch (error) {
    console.error("Error creating project:", error);
    return NextResponse.json(
      { error: "Failed to create project" },
      { status: 500 },
    );
  }
}
