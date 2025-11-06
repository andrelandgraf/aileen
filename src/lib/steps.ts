import { db } from "@/lib/db/db";
import {
  projectsTable,
  projectVersionsTable,
  projectSecretsTable,
  Project,
} from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { getLatestCommit } from "@/lib/freestyle";
import { neonService } from "@/lib/neon";
import { requestDevServer } from "@/lib/dev-server";
import { encrypt, decrypt } from "@/lib/encryption";

export async function getNeonProductionBranch(neonProjectId: string) {
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

export async function getLatestCommitHash(repoId: string) {
  "use step";
  console.log("[Projects] Getting latest commit hash...");
  const commitHash = await getLatestCommit(repoId);
  console.log("[Projects] Latest commit hash:", commitHash);
  return commitHash;
}

export async function warmUpDevServer(
  project: Project,
  secrets: Record<string, string>,
) {
  "use step";
  console.log("[Projects] Warming up dev server...");
  requestDevServer(project, secrets); // Warm up Freestyle Dev Server but don't wait for it
  console.log("[Projects] Dev server warmed up");
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

  // Serialize and encrypt secrets
  const secretsJson = JSON.stringify(secrets);
  const encryptedSecrets = encrypt(secretsJson);

  await db.insert(projectSecretsTable).values({
    projectVersionId: versionId,
    secrets: encryptedSecrets,
  });
  console.log("[Projects] Project secrets saved (encrypted)");
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

export async function createNeonSnapshot(neonProjectId: string) {
  "use step";
  console.log("[Projects] Creating Neon snapshot...");
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

  // Decrypt existing secrets
  const decryptedJson = decrypt(currentSecrets.secrets);
  const secretsData: Record<string, string> = JSON.parse(decryptedJson);

  // Re-encrypt for new version
  const secretsJson = JSON.stringify(secretsData);
  const encryptedSecrets = encrypt(secretsJson);

  await db.insert(projectSecretsTable).values({
    projectVersionId: toVersionId,
    secrets: encryptedSecrets,
  });
  console.log("[Projects] Secrets copied and encrypted successfully");
}
