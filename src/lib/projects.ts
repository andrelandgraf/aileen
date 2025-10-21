import { db } from "@/lib/db/db";
import {
  projectsTable,
  projectVersionsTable,
  projectSecretsTable,
} from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { freestyleService, getLatestCommit } from "@/lib/freestyle";
import { neonService } from "@/lib/neon";

/**
 * Initialize the first version of a project after creation.
 *
 * This includes:
 * 1. Retrieving Neon Auth credentials
 * 2. Creating initial secrets
 * 3. Requesting dev server and creating initial snapshot
 * 4. Getting initial commit hash
 * 5. Creating initial version 0
 * 6. Saving secrets and setting current dev version
 *
 * @param project - The project object to initialize
 * @throws If initialization fails
 */
export async function initFirstVersionAfterProjectCreation(
  project: typeof projectsTable.$inferSelect,
): Promise<void> {
  console.log("[Projects] Initializing first version for project:", project.id);
  console.log("[Projects] Project found:", {
    repoId: project.repoId,
    neonProjectId: project.neonProjectId,
  });

  // Retrieve Neon Auth credentials and connection URI in parallel
  console.log(
    "[Projects] Retrieving Neon Auth credentials and connection URI in parallel...",
  );
  const [neonAuth, databaseUrl] = await Promise.all([
    neonService.getNeonAuthKeys(project.neonProjectId),
    neonService.getConnectionUri({
      projectId: project.neonProjectId,
    }),
  ]);
  console.log("[Projects] Neon Auth credentials and database URL retrieved");

  // Create initial secrets with Neon Auth environment variables
  console.log("[Projects] Creating initial secrets object...");
  const initialSecrets = {
    NEXT_PUBLIC_STACK_PROJECT_ID: neonAuth.auth_provider_project_id,
    NEXT_PUBLIC_STACK_PUBLISHABLE_CLIENT_KEY: neonAuth.pub_client_key,
    STACK_SECRET_SERVER_KEY: neonAuth.secret_server_key,
    DATABASE_URL: databaseUrl,
  };

  // Request dev server and create initial snapshot in parallel
  console.log(
    "[Projects] Requesting dev server and creating initial snapshot in parallel...",
  );
  const [initialCommitHash, initialSnapshotId] = await Promise.all([
    freestyleService
      .requestDevServer({
        repoId: project.repoId,
        environmentVariables: initialSecrets,
      })
      .then((devServerResponse) => getLatestCommit(devServerResponse.process)),
    neonService.createSnapshot(project.neonProjectId, {
      name: "initial",
    }),
  ]);
  console.log(
    "[Projects] Dev server ready, initial snapshot created, and initial commit hash retrieved:",
    initialCommitHash,
  );

  // Create initial version 0 with the actual commit hash
  console.log("[Projects] Creating initial version 0...");
  const [initialVersion] = await db
    .insert(projectVersionsTable)
    .values({
      projectId: project.id,
      gitCommitHash: initialCommitHash,
      neonSnapshotId: initialSnapshotId,
      assistantMessageId: null,
      summary: "Initial project setup",
    })
    .returning();
  console.log("[Projects] Initial version created:", initialVersion);

  // Save initial secrets and set current dev version in parallel
  console.log(
    "[Projects] Saving initial secrets and setting current dev version in parallel...",
  );
  await Promise.all([
    db.insert(projectSecretsTable).values({
      projectVersionId: initialVersion.id,
      secrets: initialSecrets,
    }),
    db
      .update(projectsTable)
      .set({ currentDevVersionId: initialVersion.id })
      .where(eq(projectsTable.id, project.id)),
  ]);
  console.log("[Projects] Initial secrets saved and current dev version set");
  console.log("[Projects] First version initialization complete");
}
