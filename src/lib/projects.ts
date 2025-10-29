import { db } from "@/lib/db/db";
import {
  projectsTable,
  projectVersionsTable,
  projectSecretsTable,
} from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { freestyleService, getLatestCommit } from "@/lib/freestyle";
import { neonService } from "@/lib/neon";

export async function getProductionBranch(neonProjectId: string) {
  "use step";
  console.log("[Projects] Getting production branch for Neon Auth...");
  const prodBranch = await neonService.getProductionBranch(neonProjectId);
  if (!prodBranch?.id) {
    throw new Error("Production branch not found");
  }
  console.log("[Projects] Production branch ID:", prodBranch.id);
  return prodBranch;
}

export async function initNeonAuth(neonProjectId: string, branchId: string) {
  "use step";
  console.log("[Projects] Initializing Neon Auth...");
  const neonAuth = await neonService.initNeonAuth(neonProjectId, branchId);
  console.log("[Projects] Neon Auth initialized:", {
    projectId: neonAuth.auth_provider_project_id,
  });
  return neonAuth;
}

export async function getDatabaseConnectionUri(neonProjectId: string) {
  "use step";
  console.log("[Projects] Getting database connection URI...");
  const databaseUrl = await neonService.getConnectionUri({
    projectId: neonProjectId,
  });
  console.log("[Projects] Database URL retrieved");
  return databaseUrl;
}

export async function requestDevServer(
  repoId: string,
  secrets: Record<string, string>,
) {
  "use step";
  console.log("[Projects] Requesting dev server...");
  const devServerResponse = await freestyleService.requestDevServer({
    repoId,
    environmentVariables: secrets,
  });
  const initialCommitHash = await getLatestCommit(devServerResponse.process);
  console.log("[Projects] Dev server ready, commit hash:", initialCommitHash);
  return initialCommitHash;
}

export async function createInitialSnapshot(neonProjectId: string) {
  "use step";
  console.log("[Projects] Creating initial snapshot...");
  const snapshotId = await neonService.createSnapshot(neonProjectId, {
    name: "initial",
  });
  console.log("[Projects] Initial snapshot created:", snapshotId);
  return snapshotId;
}

export async function createInitialVersion(
  projectId: string,
  gitCommitHash: string,
  neonSnapshotId: string,
) {
  "use step";
  console.log("[Projects] Creating initial version 0...");
  const [initialVersion] = await db
    .insert(projectVersionsTable)
    .values({
      projectId,
      gitCommitHash,
      neonSnapshotId,
      assistantMessageId: null,
      summary: "Initial project setup",
    })
    .returning();
  console.log("[Projects] Initial version created:", initialVersion);
  return initialVersion;
}

export async function saveProjectSecrets(
  versionId: string,
  secrets: Record<string, string>,
) {
  "use step";
  console.log("[Projects] Saving project secrets...");
  await db.insert(projectSecretsTable).values({
    projectVersionId: versionId,
    secrets,
  });
  console.log("[Projects] Project secrets saved");
}

export async function setCurrentDevVersion(
  projectId: string,
  versionId: string,
) {
  "use step";
  console.log("[Projects] Setting current dev version...");
  await db
    .update(projectsTable)
    .set({ currentDevVersionId: versionId })
    .where(eq(projectsTable.id, projectId));
  console.log("[Projects] Current dev version set");
}

export function buildSecretsFromNeonAuth(
  neonAuth: Awaited<ReturnType<typeof neonService.initNeonAuth>>,
  databaseUrl: string,
) {
  return {
    NEXT_PUBLIC_STACK_PROJECT_ID: neonAuth.auth_provider_project_id,
    NEXT_PUBLIC_STACK_PUBLISHABLE_CLIENT_KEY: neonAuth.pub_client_key,
    STACK_SECRET_SERVER_KEY: neonAuth.secret_server_key,
    DATABASE_URL: databaseUrl,
  };
}

export async function getCurrentCommitHash(
  repoId: string,
  secrets: Record<string, string>,
) {
  "use step";
  console.log("[Projects] Getting current commit hash...");
  const devServerResponse = await freestyleService.requestDevServer({
    repoId,
    environmentVariables: secrets,
  });
  const currentCommitHash = await getLatestCommit(devServerResponse.process);
  console.log("[Projects] Current commit hash:", currentCommitHash);
  return currentCommitHash;
}

export async function createCheckpointSnapshot(neonProjectId: string) {
  "use step";
  console.log("[Projects] Creating checkpoint snapshot...");
  const snapshotId = await neonService.createSnapshot(neonProjectId, {
    name: `checkpoint-${Date.now()}`,
  });
  console.log("[Projects] Checkpoint snapshot created:", snapshotId);
  return snapshotId;
}

export async function createCheckpointVersion(
  projectId: string,
  gitCommitHash: string,
  neonSnapshotId: string,
  assistantMessageId: string | null,
) {
  "use step";
  console.log("[Projects] Creating checkpoint version...");
  const [checkpointVersion] = await db
    .insert(projectVersionsTable)
    .values({
      projectId,
      gitCommitHash,
      neonSnapshotId,
      assistantMessageId,
      summary: "Manual checkpoint",
    })
    .returning();
  console.log("[Projects] Checkpoint version created:", checkpointVersion);
  return checkpointVersion;
}

export async function copyProjectSecrets(
  fromVersionId: string,
  toVersionId: string,
) {
  "use step";
  console.log("[Projects] Copying secrets from version:", fromVersionId);
  const [currentSecrets] = await db
    .select()
    .from(projectSecretsTable)
    .where(eq(projectSecretsTable.projectVersionId, fromVersionId))
    .limit(1);

  if (!currentSecrets) {
    console.warn("[Projects] No secrets found, skipping copy");
    return;
  }

  await db.insert(projectSecretsTable).values({
    projectVersionId: toVersionId,
    secrets: currentSecrets.secrets,
  });
  console.log("[Projects] Secrets copied successfully");
}
