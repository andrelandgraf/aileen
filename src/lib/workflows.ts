import {
  getProductionBranch,
  initNeonAuth,
  getDatabaseConnectionUri,
  requestDevServer,
  createInitialSnapshot,
  createInitialVersion,
  saveProjectSecrets,
  setCurrentDevVersion,
  buildSecretsFromNeonAuth,
  getCurrentCommitHash,
  createCheckpointSnapshot,
  createCheckpointVersion,
  copyProjectSecrets,
} from "@/lib/projects";

export async function initalizeFirstProjectVersion(
  projectId: string,
  repoId: string,
  neonProjectId: string,
) {
  "use workflow";
  const prodBranch = await getProductionBranch(neonProjectId);

  const [neonAuth, databaseUrl] = await Promise.all([
    initNeonAuth(neonProjectId, prodBranch.id),
    getDatabaseConnectionUri(neonProjectId),
  ]);

  const secrets = buildSecretsFromNeonAuth(neonAuth, databaseUrl);
  const [initialCommitHash, initialSnapshotId] = await Promise.all([
    requestDevServer(repoId, secrets),
    createInitialSnapshot(neonProjectId),
  ]);

  const initialVersion = await createInitialVersion(
    projectId,
    initialCommitHash,
    initialSnapshotId,
  );

  await Promise.all([
    saveProjectSecrets(initialVersion.id, secrets),
    setCurrentDevVersion(projectId, initialVersion.id),
  ]);

  return { success: true, versionId: initialVersion.id };
}

export async function createManualCheckpoint(
  projectId: string,
  repoId: string,
  neonProjectId: string,
  currentDevVersionId: string,
  secrets: Record<string, string>,
  assistantMessageId: string | null,
) {
  "use workflow";
  const [currentCommitHash, snapshotId] = await Promise.all([
    getCurrentCommitHash(repoId, secrets),
    createCheckpointSnapshot(neonProjectId),
  ]);

  const checkpointVersion = await createCheckpointVersion(
    projectId,
    currentCommitHash,
    snapshotId,
    assistantMessageId,
  );

  await Promise.all([
    copyProjectSecrets(currentDevVersionId, checkpointVersion.id),
    setCurrentDevVersion(projectId, checkpointVersion.id),
  ]);

  return { success: true, versionId: checkpointVersion.id };
}
