/**
 * Models.dev Service
 *
 * Provides access to model data from models.dev API:
 * - Fetches all models from https://models.dev/api.json
 * - Caches data in memory with TTL (24 hours)
 * - Filters by provider and tool calling support
 * - Returns normalized model data with provider logos
 */

// Models.dev API types (new nested structure)
interface ModelData {
  id: string; // e.g., "claude-3-5-sonnet-20241022"
  name: string; // e.g., "Claude 3.5 Sonnet"
  attachment: boolean;
  reasoning: boolean;
  temperature: boolean;
  tool_call: boolean;
  knowledge?: string;
  release_date: string;
  last_updated: string;
  modalities: {
    input: string[];
    output: string[];
  };
  open_weights: boolean;
  cost: {
    input: number; // per million tokens
    output: number; // per million tokens
    cache_read?: number;
  };
  limit: {
    context: number; // max context window
    output: number; // max output tokens
  };
}

interface ProviderData {
  id: string; // e.g., "anthropic"
  env: string[];
  npm: string;
  name: string; // e.g., "Anthropic"
  doc: string;
  models: {
    [modelId: string]: ModelData;
  };
}

interface ModelsDevResponse {
  [providerId: string]: ProviderData;
}

// Normalized model for our UI
export interface NormalizedModel {
  id: string; // Full ID from models.dev (e.g., "anthropic/claude-3-5-sonnet-20241022")
  provider: "anthropic" | "openai" | "google";
  name: string;
  displayName: string; // Formatted for UI
  toolCallSupport: boolean;
  contextWindow: number;
  maxOutput: number;
  inputCostPerMillion: number;
  outputCostPerMillion: number;
  logoUrl: string; // e.g., "https://models.dev/logos/anthropic.svg"
  supportsImages: boolean;
  releaseDate: string;
}

// In-memory cache
let modelsCacheData: NormalizedModel[] | null = null;
let modelsCacheTimestamp: number | null = null;
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

/**
 * Fetch all models from models.dev API
 * Cached for 24 hours to reduce API calls
 */
async function fetchModelsDevData(): Promise<ModelsDevResponse> {
  const response = await fetch("https://models.dev/api.json", {
    next: { revalidate: 86400 }, // Cache for 24 hours
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch models.dev data: ${response.statusText}`);
  }

  return response.json();
}

/**
 * Parse provider from model ID
 * Examples:
 * - "anthropic/claude-3-5-sonnet-20241022" -> "anthropic"
 * - "openai/gpt-4o" -> "openai"
 * - "google/gemini-2.0-flash-exp" -> "google"
 */
function getProviderFromModelId(modelId: string): string | null {
  const match = modelId.match(/^([^/]+)\//);
  return match ? match[1] : null;
}

/**
 * Check if provider is one of our supported providers
 */
function isSupportedProvider(
  provider: string | null,
): provider is "anthropic" | "openai" | "google" {
  return (
    provider === "anthropic" || provider === "openai" || provider === "google"
  );
}

/**
 * Format model name for display
 * Examples:
 * - "Claude 3.5 Sonnet" -> "Claude 3.5 Sonnet"
 * - "GPT-4o mini" -> "GPT-4o mini"
 * - "Gemini 2.0 Flash" -> "Gemini 2.0 Flash"
 */
function formatDisplayName(name: string, provider: string): string {
  return name; // Models.dev names are already well-formatted
}

/**
 * Normalize model data from models.dev format to our internal format
 */
function normalizeModel(
  modelId: string,
  data: ModelData,
): NormalizedModel | null {
  const provider = getProviderFromModelId(modelId);

  if (!isSupportedProvider(provider)) {
    return null;
  }

  return {
    id: modelId,
    provider,
    name: data.name,
    displayName: formatDisplayName(data.name, provider),
    toolCallSupport: data.tool_call,
    contextWindow: data.limit.context,
    maxOutput: data.limit.output,
    inputCostPerMillion: data.cost.input,
    outputCostPerMillion: data.cost.output,
    logoUrl: `https://models.dev/logos/${provider}.svg`,
    supportsImages: data.modalities.input.includes("image"),
    releaseDate: data.release_date,
  };
}

/**
 * Get all models from models.dev
 * - Filters to only supported providers (anthropic, openai, google)
 * - Filters to only models with tool calling support
 * - Normalizes data for our UI
 * - Cached for 24 hours
 */
export async function getAllModels(): Promise<NormalizedModel[]> {
  // Check cache
  const now = Date.now();
  if (
    modelsCacheData &&
    modelsCacheTimestamp &&
    now - modelsCacheTimestamp < CACHE_TTL_MS
  ) {
    return modelsCacheData;
  }

  // Fetch fresh data
  const data = await fetchModelsDevData();

  // Normalize and filter
  const models: NormalizedModel[] = [];

  // Iterate through each provider
  for (const [providerId, providerData] of Object.entries(data)) {
    // Skip if not a supported provider
    if (!isSupportedProvider(providerId)) {
      continue;
    }

    // Iterate through each model in this provider
    for (const [modelId, modelData] of Object.entries(providerData.models)) {
      // Build full model ID (e.g., "anthropic/claude-3-5-sonnet-20241022")
      const fullModelId = `${providerId}/${modelId}`;
      const normalized = normalizeModel(fullModelId, modelData);

      // Only include models with tool calling support
      if (normalized && normalized.toolCallSupport) {
        models.push(normalized);
      }
    }
  }

  // Sort by provider, then by name
  models.sort((a, b) => {
    if (a.provider !== b.provider) {
      return a.provider.localeCompare(b.provider);
    }
    return a.displayName.localeCompare(b.displayName);
  });

  // Update cache
  modelsCacheData = models;
  modelsCacheTimestamp = now;

  return models;
}

/**
 * Get models for a specific provider
 * Only returns models with tool calling support
 */
export async function getModelsByProvider(
  provider: "anthropic" | "openai" | "google",
): Promise<NormalizedModel[]> {
  const allModels = await getAllModels();
  return allModels.filter((model) => model.provider === provider);
}

/**
 * Get a specific model by ID
 */
export async function getModelById(
  modelId: string,
): Promise<NormalizedModel | null> {
  const allModels = await getAllModels();
  return allModels.find((model) => model.id === modelId) || null;
}

/**
 * Get system models (always available with platform keys)
 * Currently: Claude 3.5 Haiku and Claude 3.5 Sonnet
 */
export async function getSystemModels(): Promise<NormalizedModel[]> {
  const allModels = await getAllModels();
  return allModels.filter(
    (model) =>
      model.id === "anthropic/claude-3-5-haiku-20241022" ||
      model.id === "anthropic/claude-3-5-sonnet-20241022",
  );
}

/**
 * Get BYOK models based on user's saved API keys
 * @param savedProviders - Array of providers the user has API keys for
 */
export async function getBYOKModels(
  savedProviders: Array<"anthropic" | "openai" | "google">,
): Promise<NormalizedModel[]> {
  const allModels = await getAllModels();

  return allModels.filter((model) => {
    // Exclude system models from BYOK list
    if (
      model.id === "anthropic/claude-3-5-haiku-20241022" ||
      model.id === "anthropic/claude-3-5-sonnet-20241022"
    ) {
      return false;
    }

    // Only include models for providers user has keys for
    return savedProviders.includes(model.provider);
  });
}

/**
 * Get logo URL for a provider
 */
export function getProviderLogoUrl(
  provider: "anthropic" | "openai" | "google",
): string {
  return `https://models.dev/logos/${provider}.svg`;
}

/**
 * Format cost for display
 * @param costPerMillion - Cost per million tokens
 * @returns Formatted string like "$2.50" or "$0.15"
 */
export function formatCost(costPerMillion: number): string {
  return `$${costPerMillion.toFixed(2)}`;
}

/**
 * Format context window for display
 * @param tokens - Number of tokens
 * @returns Formatted string like "200K" or "1M"
 */
export function formatContextWindow(tokens: number): string {
  if (tokens >= 1000000) {
    return `${(tokens / 1000000).toFixed(1)}M`;
  }
  if (tokens >= 1000) {
    return `${(tokens / 1000).toFixed(0)}K`;
  }
  return `${tokens}`;
}
