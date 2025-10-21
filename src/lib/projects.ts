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
 * Atomic step: Get production branch from Neon
 */
export async function getProductionBranch(neonProjectId: string) {
  console.log("[Projects] Getting production branch for Neon Auth...");
  const prodBranch = await neonService.getProductionBranch(neonProjectId);
  if (!prodBranch?.id) {
    throw new Error("Production branch not found");
  }
  console.log("[Projects] Production branch ID:", prodBranch.id);
  return prodBranch;
}

/**
 * Atomic step: Initialize Neon Auth
 */
export async function initNeonAuth(neonProjectId: string, branchId: string) {
  console.log("[Projects] Initializing Neon Auth...");
  const neonAuth = await neonService.initNeonAuth(neonProjectId, branchId);
  console.log("[Projects] Neon Auth initialized:", {
    projectId: neonAuth.auth_provider_project_id,
  });
  return neonAuth;
}

/**
 * Atomic step: Get database connection URI from Neon
 */
export async function getDatabaseConnectionUri(neonProjectId: string) {
  console.log("[Projects] Getting database connection URI...");
  const databaseUrl = await neonService.getConnectionUri({
    projectId: neonProjectId,
  });
  console.log("[Projects] Database URL retrieved");
  return databaseUrl;
}

/**
 * Atomic step: Request dev server and get initial commit hash
 */
export async function requestDevServer(
  repoId: string,
  secrets: Record<string, string>,
) {
  console.log("[Projects] Requesting dev server...");
  const devServerResponse = await freestyleService.requestDevServer({
    repoId,
    environmentVariables: secrets,
  });
  const initialCommitHash = await getLatestCommit(devServerResponse.process);
  console.log("[Projects] Dev server ready, commit hash:", initialCommitHash);
  return initialCommitHash;
}

/**
 * Atomic step: Create initial Neon snapshot
 */
export async function createInitialSnapshot(neonProjectId: string) {
  console.log("[Projects] Creating initial snapshot...");
  const snapshotId = await neonService.createSnapshot(neonProjectId, {
    name: "initial",
  });
  console.log("[Projects] Initial snapshot created:", snapshotId);
  return snapshotId;
}

/**
 * Atomic step: Create initial project version record
 */
export async function createInitialVersion(
  projectId: string,
  gitCommitHash: string,
  neonSnapshotId: string,
) {
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

/**
 * Atomic step: Save project secrets
 */
export async function saveProjectSecrets(
  versionId: string,
  secrets: Record<string, string>,
) {
  console.log("[Projects] Saving project secrets...");
  await db.insert(projectSecretsTable).values({
    projectVersionId: versionId,
    secrets,
  });
  console.log("[Projects] Project secrets saved");
}

/**
 * Atomic step: Set current dev version
 */
export async function setCurrentDevVersion(
  projectId: string,
  versionId: string,
) {
  console.log("[Projects] Setting current dev version...");
  await db
    .update(projectsTable)
    .set({ currentDevVersionId: versionId })
    .where(eq(projectsTable.id, projectId));
  console.log("[Projects] Current dev version set");
}

/**
 * Helper: Build secrets object from Neon Auth response
 */
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
