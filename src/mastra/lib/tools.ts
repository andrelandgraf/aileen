import { RuntimeContext } from "@mastra/core/runtime-context";
import { createFreestyleMcpClient } from "../mcp/freestyle";
import { neonMcpClient } from "../mcp/neon";
import type { CodegenRuntimeContext } from "./context";

/**
 * Get composed tools for the codegen agent
 * Combines Freestyle (project-specific) and Neon (shared) tools
 */
export async function getCodegenTools(
  runtimeContext: RuntimeContext<CodegenRuntimeContext>,
) {
  const project = runtimeContext.get("project");

  if (!project) {
    throw new Error("Project context required to load tools");
  }

  // Create project-specific Freestyle MCP client
  const freestyleMcp = await createFreestyleMcpClient(project.repoId);

  // Fetch tools in parallel
  const [freestyleTools, neonTools] = await Promise.all([
    freestyleMcp.getTools(),
    neonMcpClient.getTools(),
  ]);

  // Combine tools into a single object
  return {
    ...freestyleTools,
    ...neonTools,
  };
}
