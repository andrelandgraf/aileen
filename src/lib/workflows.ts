import {
  getNeonProductionBranch,
  initNeonAuth,
  getDatabaseConnectionUri,
  getLatestCommitHash,
  createInitialVersion,
  saveProjectSecrets,
  setCurrentDevVersion,
  buildSecretsFromNeonAuth,
  createNeonSnapshot,
  createCheckpointVersion,
  copyProjectSecrets,
  warmUpDevServer,
  deleteFreestyleRepository,
  deleteNeonProject,
  deleteAssistantUIThread,
  getProjectVersionIds,
  clearCurrentDevVersion,
  deleteProjectSecrets,
  deleteProjectVersions,
  deleteProjectRecord,
} from "@/lib/steps";
import { Project } from "@/lib/db/schema";

export async function initalizeFirstProjectVersion(project: Project) {
  "use workflow";
  const prodBranch = await getNeonProductionBranch(project.neonProjectId);

  const [neonAuth, databaseUrl, initialCommitHash, initialSnapshotId] =
    await Promise.all([
      initNeonAuth(project.neonProjectId, prodBranch.id),
      getDatabaseConnectionUri(project.neonProjectId),
      getLatestCommitHash(project.repoId),
      createNeonSnapshot(project.neonProjectId),
    ]);

  const initialVersion = await createInitialVersion(
    project.id,
    initialCommitHash,
    initialSnapshotId,
  );

  const secrets = buildSecretsFromNeonAuth(neonAuth, databaseUrl);
  await Promise.all([
    saveProjectSecrets(initialVersion.id, secrets),
    setCurrentDevVersion(project.id, initialVersion.id),
    warmUpDevServer(project, secrets), // Warm up Freestyle Dev Server in parallel
  ]);

  return { success: true, versionId: initialVersion.id };
}

export async function createManualCheckpoint(
  projectId: string,
  repoId: string,
  neonProjectId: string,
  currentDevVersionId: string,
  assistantMessageId: string | null,
) {
  "use workflow";
  const [currentCommitHash, snapshotId] = await Promise.all([
    getLatestCommitHash(repoId),
    createNeonSnapshot(neonProjectId),
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

export async function deleteProject(project: Project) {
  "use workflow";

  // Get version IDs to delete secrets
  const versionIds = await getProjectVersionIds(project.id);

  // Clear FK reference before deleting versions
  await clearCurrentDevVersion(project.id);

  // Delete secrets and versions
  if (versionIds.length > 0) {
    await deleteProjectSecrets(versionIds);
  }

  await deleteProjectVersions(project.id);

  await deleteProjectRecord(project.id);

  // Delete external resources in parallel
  await Promise.all([
    deleteFreestyleRepository(project.repoId),
    deleteNeonProject(project.neonProjectId),
    deleteAssistantUIThread(project.userId, project.threadId),
  ]);

  return { success: true };
}
