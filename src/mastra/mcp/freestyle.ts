// import { MCPClient } from "@mastra/mcp"; -> currently not working
import { experimental_createMCPClient } from "ai";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
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

  //   const mcpClient = new MCPClient({
  //     id: `freestyle-dev-${repoId}`,
  //     servers: {
  //       freestyleDevServer: {
  //         url: new URL(mcpEphemeralUrl),
  //       },
  //     },
  //   });

  const mcpClient = await experimental_createMCPClient({
    transport: new StreamableHTTPClientTransport(new URL(mcpEphemeralUrl)),
  });

  return mcpClient;
}
