import { inngest } from "./client";
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

export const initalizeFirstProjectVersion = inngest.createFunction(
  { id: "initalize-first-project-version" },
  { event: "projects/initialize-first-version" },
  async ({ event, step }) => {
    const { projectId, repoId, neonProjectId } = event.data;

    console.log("[Inngest] Initializing first version for project:", projectId);

    // Step 1: Get production branch (must be first)
    const prodBranch = await step.run("get-production-branch", async () => {
      return getProductionBranch(neonProjectId);
    });

    // Step 2: Initialize Neon Auth and get database URI in parallel
    const initNeonAuthStep = step.run("init-neon-auth", async () => {
      return initNeonAuth(neonProjectId, prodBranch.id);
    });

    const getDatabaseUriStep = step.run("get-database-uri", async () => {
      return getDatabaseConnectionUri(neonProjectId);
    });

    const [neonAuth, databaseUrl] = await Promise.all([
      initNeonAuthStep,
      getDatabaseUriStep,
    ]);

    // Build secrets from the Neon Auth response
    const secrets = buildSecretsFromNeonAuth(neonAuth, databaseUrl);

    // Step 3: Request dev server and create snapshot in parallel
    const requestDevServerStep = step.run("request-dev-server", async () => {
      return requestDevServer(repoId, secrets);
    });

    const createSnapshotStep = step.run("create-initial-snapshot", async () => {
      return createInitialSnapshot(neonProjectId);
    });

    const [initialCommitHash, initialSnapshotId] = await Promise.all([
      requestDevServerStep,
      createSnapshotStep,
    ]);

    // Step 4: Create initial version record
    const initialVersion = await step.run(
      "create-initial-version",
      async () => {
        return createInitialVersion(
          projectId,
          initialCommitHash,
          initialSnapshotId,
        );
      },
    );

    // Step 5: Save secrets and set current version in parallel
    const saveSecretsStep = step.run("save-project-secrets", async () => {
      return saveProjectSecrets(initialVersion.id, secrets);
    });

    const setVersionStep = step.run("set-current-dev-version", async () => {
      return setCurrentDevVersion(projectId, initialVersion.id);
    });

    await Promise.all([saveSecretsStep, setVersionStep]);

    console.log("[Inngest] First version initialization complete");
    return { success: true, versionId: initialVersion.id };
  },
);
