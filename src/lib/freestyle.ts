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

interface GetDevServerLogsParams {
  repoId: string;
  gitRef?: string | null;
  lines?: number | null;
}

interface GetDevServerLogsResponse {
  logs: string;
}

interface CommitResponse {
  commits: Array<{
    sha: string;
    message: string;
    author: {
      date: string;
      name: string;
      email: string;
    };
    committer: {
      date: string;
      name: string;
      email: string;
    };
    tree: {
      sha: string;
    };
    parents: Array<{
      sha: string;
    }>;
  }>;
  count: number;
  offset: number;
  limit: number;
  total: number;
}

interface GetCommitsParams {
  repoId: string;
  branch?: string;
  limit?: number;
  offset?: number;
}

export class FreestyleService {
  private freestyle: FreestyleSandboxes;
  private apiKey: string;
  private readonly apiBaseUrl = "https://api.freestyle.sh";

  constructor(apiKey: string) {
    this.apiKey = apiKey;
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

  /**
   * Fetches commits from a Freestyle repository using the Git API
   * @param params - Parameters for fetching commits
   * @returns Promise resolving to commit response with commits array
   */
  async getCommits({
    repoId,
    branch,
    limit = 1,
    offset = 0,
  }: GetCommitsParams): Promise<CommitResponse> {
    console.log("[Freestyle] Fetching commits for repo:", repoId, {
      branch,
      limit,
      offset,
    });

    try {
      const queryParams = new URLSearchParams();
      if (branch) {
        queryParams.append("branch", branch);
      }
      if (limit) {
        queryParams.append("limit", limit.toString());
      }
      if (offset) {
        queryParams.append("offset", offset.toString());
      }

      const url = `${this.apiBaseUrl}/git/v1/repo/${repoId}/git/commits?${queryParams.toString()}`;

      const response = await fetch(url, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          "Content-Type": "application/json",
        },
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(
          `Failed to fetch commits: ${response.status} ${response.statusText} - ${errorText}`,
        );
      }

      const data = (await response.json()) as CommitResponse;
      console.log("[Freestyle] Successfully fetched commits:", {
        count: data.count,
        total: data.total,
      });

      return data;
    } catch (error) {
      console.error("[Freestyle] Error fetching commits:", error);
      throw new Error(
        `Failed to fetch commits: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
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

  async getDevServerLogs({
    repoId,
    gitRef = null,
    lines = null,
  }: GetDevServerLogsParams): Promise<GetDevServerLogsResponse> {
    console.log("[Freestyle] Fetching dev server logs for repo:", repoId, {
      gitRef,
      lines,
    });

    try {
      const response = await fetch(
        `${this.apiBaseUrl}/ephemeral/v1/dev-servers/logs`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${this.apiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            devServer: {
              repoId,
              gitRef,
            },
            lines,
          }),
        },
      );

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(
          `Failed to fetch dev server logs: ${response.status} ${response.statusText} - ${errorText}`,
        );
      }

      const data = (await response.json()) as GetDevServerLogsResponse;

      if (typeof data.logs !== "string") {
        throw new Error("Malformed response from Freestyle logs API");
      }

      return data;
    } catch (error) {
      console.error("[Freestyle] Error fetching dev server logs:", error);
      throw new Error(
        `Failed to fetch dev server logs: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
}

export const freestyleService = new FreestyleService(
  process.env.FREESTYLE_API_KEY!,
);

/**
 * Gets the latest commit hash from a Freestyle repository using the Git API
 * @param repoId - The repository ID
 * @param branch - Optional branch name (defaults to HEAD/default branch)
 * @returns Promise resolving to the latest commit hash (SHA)
 */
export async function getLatestCommit(
  repoId: string,
  branch?: string,
): Promise<string> {
  console.log("[Freestyle] Getting latest commit hash via API", {
    repoId,
    branch,
  });

  try {
    const response = await freestyleService.getCommits({
      repoId,
      branch,
      limit: 1,
      offset: 0,
    });

    if (!response.commits || response.commits.length === 0) {
      throw new Error("No commits found in repository");
    }

    const commitHash = response.commits[0].sha;
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
