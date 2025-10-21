import { FreestyleSandboxes } from "freestyle-sandboxes";
import type { FreestyleDevServer } from "freestyle-sandboxes";

interface CreateRepoParams {
  name: string;
  sourceUrl?: string;
}

interface CreateRepoResponse {
  repoId: string;
}

interface RequestDevServerParams {
  repoId: string;
  environmentVariables: Record<string, string>;
}

export class FreestyleService {
  private freestyle: FreestyleSandboxes;

  constructor(apiKey: string) {
    this.freestyle = new FreestyleSandboxes({
      apiKey,
    });
  }

  async createRepo({
    name,
    sourceUrl = "https://github.com/andrelandgraf/neon-freestyle-template",
  }: CreateRepoParams): Promise<CreateRepoResponse> {
    console.log("[Freestyle] Creating repo with params:", { name, sourceUrl });

    const requestParams = {
      name,
      public: true,
      source: {
        url: sourceUrl,
        type: "git" as const,
      },
      devServers: {
        preset: "nextJs" as const,
      },
    };

    console.log(
      "[Freestyle] Request params:",
      JSON.stringify(requestParams, null, 2),
    );

    try {
      const { repoId } =
        await this.freestyle.createGitRepository(requestParams);

      console.log("[Freestyle] Success! Repository created");
      console.log("[Freestyle] Extracted repoId:", repoId);

      return { repoId };
    } catch (error) {
      console.error("[Freestyle] Error creating repository:", error);
      throw new Error(
        `Failed to create Freestyle repo: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  async initializeRawDevServer(repoId: string): Promise<void> {
    try {
      this.freestyle.requestDevServer({
        repoId,
      });
    } catch (_) {}
  }

  async requestDevServer({
    repoId,
    environmentVariables,
  }: RequestDevServerParams): Promise<FreestyleDevServer> {
    console.log("[Freestyle] Requesting dev server for repo:", repoId);

    try {
      const devServerResponse = await this.freestyle.requestDevServer({
        repoId,
      });

      console.log("[Freestyle] Dev server response:", {
        ephemeralUrl: devServerResponse.ephemeralUrl,
        mcpEphemeralUrl: devServerResponse.mcpEphemeralUrl,
        codeServerUrl: devServerResponse.codeServerUrl,
        isNew: devServerResponse.isNew,
      });

      // Update .env file with the latest environment variables
      console.log(
        "[Freestyle] Checking .env file for environment variables...",
      );
      const envContent = Object.entries(environmentVariables)
        .map(([key, value]) => `${key}=${value}`)
        .join("\n");

      // Read existing .env file to check if content has changed
      let existingContent = "";
      try {
        existingContent = await devServerResponse.fs.readFile(
          "/template/.env",
          "utf-8",
        );
      } catch (error) {
        console.log("[Freestyle] .env file does not exist yet, will create it");
      }

      // Only write if content has changed to avoid triggering unnecessary reloads
      if (existingContent !== envContent) {
        console.log(
          "[Freestyle] Environment variables changed, updating .env file...",
        );
        await devServerResponse.fs.writeFile(
          "/template/.env",
          envContent,
          "utf-8",
        );
        console.log(
          `[Freestyle] Successfully wrote ${Object.keys(environmentVariables).length} environment variables to .env`,
        );
      } else {
        console.log(
          "[Freestyle] Environment variables unchanged, skipping .env update to avoid reload",
        );
      }

      return devServerResponse;
    } catch (error) {
      console.error("[Freestyle] Error requesting dev server:", error);
      throw new Error(
        `Failed to request Freestyle dev server: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
}

export const freestyleService = new FreestyleService(
  process.env.FREESTYLE_API_KEY!,
);

/**
 * Gets the latest commit hash from a Freestyle repository
 * @param process - The process object from FreestyleDevServer
 */
export async function getLatestCommit(
  process: FreestyleDevServer["process"],
): Promise<string> {
  console.log("[Freestyle] Getting latest commit hash");

  try {
    const result = await process.exec("git rev-parse HEAD");

    if (result.stderr && result.stderr.length > 0) {
      console.warn(
        `[Freestyle] git rev-parse stderr: ${result.stderr.join("\n")}`,
      );
    }

    const commitHash = result.stdout?.join("\n").trim() || "";
    console.log("[Freestyle] Latest commit hash:", commitHash);

    return commitHash;
  } catch (error) {
    console.error("[Freestyle] Error getting latest commit:", error);
    throw new Error(
      `Failed to get latest commit: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

/**
 * Sets the main branch to a specific commit
 * @param process - The process object from FreestyleDevServer
 * @param commitHash - The commit hash to reset to
 */
export async function setMainBranchToCommit(
  process: FreestyleDevServer["process"],
  commitHash: string,
): Promise<void> {
  console.log("[Freestyle] Setting main branch to commit:", commitHash);

  try {
    // Reset main branch to the specified commit
    console.log("[Freestyle] Resetting main branch to commit:", commitHash);
    const resetResult = await process.exec(`git reset --hard ${commitHash}`);

    if (resetResult.stderr && resetResult.stderr.length > 0) {
      console.warn(
        `[Freestyle] git reset stderr: ${resetResult.stderr.join("\n")}`,
      );
    }

    // Force push the changes
    console.log("[Freestyle] Force pushing changes...");
    const pushResult = await process.exec("git push --force origin main");

    if (pushResult.stderr && pushResult.stderr.length > 0) {
      console.warn(
        `[Freestyle] git push stderr: ${pushResult.stderr.join("\n")}`,
      );
    }

    console.log(
      "[Freestyle] Successfully set main branch to commit:",
      commitHash,
    );
  } catch (error) {
    console.error("[Freestyle] Error setting main branch to commit:", error);
    throw new Error(
      `Failed to set main branch to commit: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

/**
 * Sanitizes a string for use in a domain name
 * @param str - The string to sanitize
 * @returns A sanitized string safe for domain names
 */
function sanitizeDomain(str: string): string {
  return str
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

/**
 * Generates a deployment URL for a project
 * @param projectName - The name of the project
 * @param userIdentifier - The user's display name or ID
 * @returns An object containing the domain and full URL
 */
export function generateDeploymentUrl(
  projectName: string,
  userIdentifier: string,
): { domain: string; url: string } {
  const projectSlug = sanitizeDomain(projectName);
  const userSlug = sanitizeDomain(userIdentifier);
  const domain = `${projectSlug}-${userSlug}.style.dev`;
  const url = `https://${domain}`;

  return { domain, url };
}
