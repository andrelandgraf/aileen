import { MCPClient } from "@mastra/mcp";
import { FreestyleSandboxes } from "freestyle-sandboxes";

const freestyle = new FreestyleSandboxes({
  apiKey: process.env.FREESTYLE_API_KEY!,
});

/**
 * Request Freestyle dev server and create MCP client
 * Returns the client and dev server info for use with toolsets
 */
export async function createFreestyleMcpClient(
  repoId: string,
): Promise<{ mcpClient: MCPClient; devServerInfo: any }> {
  console.log("[MCP Client] Requesting Freestyle dev server...");
  console.log("[MCP Client] This may take 20-30 seconds on cold start...");

  let devServerResponse;
  try {
    // Add timeout wrapper (45 seconds)
    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(
        () => reject(new Error("Dev server request timed out after 45s")),
        45000,
      ),
    );

    devServerResponse = await Promise.race([
      freestyle.requestDevServer({ repoId }),
      timeoutPromise,
    ]);

    console.log("[MCP Client] Dev server request completed successfully");
  } catch (error) {
    console.error("[MCP Client] Dev server request failed:", error);
    throw error;
  }

  const { ephemeralUrl, mcpEphemeralUrl, codeServerUrl } =
    devServerResponse as any;

  console.log("[MCP Client] Dev server URLs:", {
    ephemeralUrl,
    mcpEphemeralUrl,
    codeServerUrl,
  });

  // Create MCP client connected to the Freestyle dev server
  console.log("[MCP Client] Creating Freestyle MCP client...");
  const mcpClient = new MCPClient({
    id: `freestyle-dev-${repoId}`,
    timeout: 300000, // 5 minutes global timeout
    servers: {
      freestyleDevServer: {
        url: new URL(mcpEphemeralUrl),
        timeout: 300000, // 5 minutes timeout for dev server operations
      },
    },
  });

  return {
    mcpClient,
    devServerInfo: {
      ephemeralUrl,
      mcpEphemeralUrl,
      codeServerUrl,
    },
  };
}

/**
 * Create Neon MCP client for database operations
 */
export function createNeonMcpClient(neonProjectId: string): MCPClient {
  console.log("[MCP Client] Creating Neon MCP client...");

  if (!process.env.NEON_API_KEY) {
    throw new Error("NEON_API_KEY not set");
  }

  return new MCPClient({
    id: `neon-${neonProjectId}`,
    timeout: 300000, // 5 minutes global timeout
    servers: {
      neon: {
        url: new URL("https://mcp.neon.tech/mcp"),
        timeout: 300000, // 5 minutes timeout for Neon operations
        requestInit: {
          headers: {
            Authorization: `Bearer ${process.env.NEON_API_KEY}`,
          },
        },
      },
    },
  });
}

/**
 * Get toolsets from MCP clients for dynamic agent configuration
 * This follows the Mastra pattern for multi-tenant applications where
 * tool configuration varies by user/request
 * 
 * Returns an array of toolset objects that can be passed to agent.stream()
 */
export async function getProjectToolsets(
  freestyleMcp: MCPClient,
  neonMcp: MCPClient,
): Promise<any[]> {
  console.log("[MCP Client] Getting toolsets from MCP servers...");
  
  // Get toolsets from both MCP clients
  const freestyleToolsets = await freestyleMcp.getToolsets();
  const neonToolsets = await neonMcp.getToolsets();
  
  console.log("[MCP Client] Freestyle toolsets loaded");
  console.log("[MCP Client] Neon toolsets loaded");
  
  // Combine toolsets into an array
  // getToolsets() returns a Record, so we need to wrap them
  return [freestyleToolsets, neonToolsets];
}
