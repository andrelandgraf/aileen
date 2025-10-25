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
