export type ModelSelection = {
  provider: "platform" | "personal";
  modelId: string; // Full model ID from models.dev (e.g., "anthropic/claude-3-5-haiku-20241022")
};

export const DEFAULT_MODEL_SELECTION: ModelSelection = {
  provider: "platform",
  modelId: "anthropic/claude-3-5-haiku-20241022",
};
