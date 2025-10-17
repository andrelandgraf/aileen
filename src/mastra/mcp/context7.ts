import { MCPClient } from "@mastra/mcp";

export const context7McpClient = new MCPClient({
  id: "context7-mcp-client",
  servers: {
    context7: {
      url: new URL("https://mcp.context7.com/mcp"),
    },
  },
});
