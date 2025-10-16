import { MCPClient } from "@mastra/mcp";
import { FreestyleSandboxes } from "freestyle-sandboxes";

const freestyle = new FreestyleSandboxes({
  apiKey: process.env.FREESTYLE_API_KEY!,
});

export async function createFreestyleMcpClient(repoId: string) {
  const devServerResponse = await freestyle.requestDevServer({ repoId });
  const { mcpEphemeralUrl } = devServerResponse;

  const mcpClient = new MCPClient({
    id: `freestyle-dev-${repoId}`,
    servers: {
      freestyleDevServer: {
        url: new URL(mcpEphemeralUrl),
      },
    },
  });

  return mcpClient;
}
