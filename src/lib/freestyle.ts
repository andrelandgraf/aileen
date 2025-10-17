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
  envVars?: Record<string, string>;
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

  async requestDevServer({
    repoId,
    envVars,
  }: RequestDevServerParams): Promise<FreestyleDevServer> {
    console.log("[Freestyle] Requesting dev server for repo:", repoId);

    try {
      const devServerResponse = await this.freestyle.requestDevServer({
        repoId,
        envVars,
      });

      console.log("[Freestyle] Dev server response:", {
        ephemeralUrl: devServerResponse.ephemeralUrl,
        mcpEphemeralUrl: devServerResponse.mcpEphemeralUrl,
        codeServerUrl: devServerResponse.codeServerUrl,
        isNew: devServerResponse.isNew,
      });

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
