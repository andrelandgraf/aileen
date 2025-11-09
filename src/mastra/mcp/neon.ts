import { mainConfig } from "@/lib/config";
import { MCPClient } from "@mastra/mcp";

export const neonMcpClient = new MCPClient({
  id: "neon-mcp-client",
  servers: {
    neon: {
      url: new URL("https://mcp.neon.tech/mcp"),
      requestInit: {
        headers: {
          Authorization: `Bearer ${mainConfig.neon.apiKey}`,
        },
      },
    },
  },
});
