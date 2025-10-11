import { FreestyleSandboxes } from "freestyle-sandboxes";

interface CreateRepoParams {
  name: string;
  sourceUrl?: string;
}

interface CreateRepoResponse {
  repoId: string;
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
}

export const freestyleService = new FreestyleService(
  process.env.FREESTYLE_API_KEY!,
);
