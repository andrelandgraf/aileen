import type { Project } from "@/lib/db/schema";

/**
 * User context passed through RuntimeContext
 */
export type UserContext = {
  userId: string;
  displayName: string | null;
};

/**
 * Model selection context for AI model configuration
 */
export type ModelSelectionContext = {
  modelId: string; // Full model ID from models.dev (e.g., "anthropic/claude-3-5-haiku-20241022")
  provider: "anthropic" | "openai" | "google";
  keyProvider: "platform" | "personal";
  apiKey?: string;
};

/**
 * Runtime context type for the codegen agent
 */
export type CodegenRuntimeContext = {
  project: Project;
  user: UserContext;
  assistantMessageId: string;
  environmentVariables: Record<string, string>;
  modelSelection?: ModelSelectionContext;
};
