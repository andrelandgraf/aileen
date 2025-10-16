import { MCPClient } from "@mastra/mcp";
import { getNeonConnectionUri } from "@/lib/neon/connection-uri";
import { freestyleService } from "@/lib/freestyle";

export async function createFreestyleMcpClient(
  repoId: string,
  neonProjectId: string,
) {
  // Get the database connection URI
  const databaseUrl = await getNeonConnectionUri({
    projectId: neonProjectId,
  });

  // Request dev server using the freestyle service
  const devServerResponse = await freestyleService.requestDevServer({
    repoId,
    envVars: {
      DATABASE_URL: databaseUrl,
    },
  });

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
