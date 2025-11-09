# Enhanced BYOK (Multi-Provider Support) - Implementation Plan

**Date:** 25-11-08  
**Feature:** Enhance BYOK with OpenAI and Google Gemini support, models.dev integration, and improved UX

> **📝 Note on Dependencies:** This plan builds upon the Model Selection Cookie Persistence implementation (25-11-08-persist-model-selection-cookie-plan.md), which created the `lib/model-selection/` and `lib/cookies/` folder structure. We'll be updating the model selection types and hooks to support the new multi-provider functionality while maintaining cookie persistence.

## Problem Statement

The current BYOK implementation (from 25-11-04-byok-anthropic-api-keys-plan.md) only supports:

- Single provider (Anthropic only)
- Single model selection UI (Haiku only)
- Shared loading states across all API key operations
- No visual provider branding
- No dynamic model discovery

We need to enhance this to:

1. Support multiple providers (Anthropic, OpenAI, Google Gemini)
2. Provide separate loading states for each provider's save/delete operations
3. Add links to provider consoles for easy API key management
4. Integrate with models.dev API to dynamically discover available models
5. Filter models to only show those that support tool calling
6. Display provider logos alongside models
7. Group models by "System" (platform keys) and "BYOK" (user keys)
8. Dynamically select AI SDK adapters based on provider

## Solution Overview

1. **Database Schema Updates**: Add "google" to AI provider enum
2. **Models.dev Service**: Create server-side service to fetch and cache model data
3. **Per-Provider Loading States**: Separate loading states for each provider's operations
4. **Provider Console Links**: Add clickable links to each provider's API key management console
5. **Enhanced Model Selection UI**: Redesign with provider logos, grouped models, and detailed info
6. **Server-Side Model Filtering**: Filter models by tool calling support on the server
7. **Dynamic AI SDK Integration**: Use correct adapter (anthropic/openai/google) based on selection
8. **Logo Display**: Fetch and display provider logos from models.dev

## Implementation Decisions

### Multi-Provider Architecture

- **Detail:** Support three providers: Anthropic, OpenAI, Google Gemini
- **Rationale:**
  - These are the most popular AI providers with strong tool calling support
  - Covers different use cases (Claude for reasoning, GPT for general purpose, Gemini for Google integration)
  - All three have excellent AI SDK support

### Models.dev Integration

- **Detail:** Fetch model data from https://models.dev/api.json and cache server-side
- **Rationale:**
  - Single source of truth for model specs, pricing, and features
  - Community-maintained and up-to-date
  - Includes provider logos at https://models.dev/logos/{provider}.svg
  - No need to manually maintain model lists
  - Includes critical metadata (tool calling support, context windows, pricing)

### Tool Calling Filter

- **Detail:** Only show models where `tool_call: true` in models.dev data
- **Rationale:**
  - Our agents rely heavily on tool calling for Freestyle and Neon operations
  - Models without tool calling cannot function in our system
  - Prevents user confusion and errors

### System vs BYOK Model Grouping

- **Detail:** Two model groups:
  - **System Models**: `claude-3-5-haiku-20241022` and `claude-3-5-sonnet-20241022` (always available)
  - **BYOK Models**: All other Anthropic/OpenAI/Google models with tool calling (conditional on saved keys)
- **Rationale:**
  - Clear distinction between platform-provided and user-provided models
  - System models always work (good default experience)
  - BYOK models unlock more options and user-owned quota
  - Sonnet added to system models for users needing more capable default

### Per-Provider Loading States

- **Detail:** Each provider has independent loading states for save/delete operations
- **Rationale:**
  - Better UX - user can interact with one provider while another is loading
  - Clearer feedback - user knows exactly which operation is in progress
  - Prevents accidental concurrent operations on same provider

### Provider Console Links

- **Detail:** Small "View API keys" links next to each provider input
- **Rationale:**
  - Reduces friction - users can easily navigate to get API keys
  - Educational - new users learn where to find their keys
  - Professional - shows we care about UX details

### Dynamic AI SDK Adapter Selection

- **Detail:** Use different AI SDK adapters based on provider:
  - Anthropic: `@ai-sdk/anthropic`
  - OpenAI: `@ai-sdk/openai`
  - Google: `@ai-sdk/google`
- **Rationale:**
  - Each provider requires its own adapter
  - AI SDK provides consistent interface across adapters
  - Allows seamless switching between providers

## Files to Create

### Model Selection Module (Building on existing `lib/model-selection/`)

> **Note:** The `lib/model-selection/` folder and its base files (types.ts, cookie.ts, hooks.ts, index.ts) were created in the model selection cookie persistence implementation. We'll be updating these files to support the new multi-provider model selection.

### 1. `src/lib/models-dev.ts` (NEW FILE)

**Purpose:** Server-side service to fetch, cache, and filter model data from models.dev

**Implementation Structure:**

```typescript
/**
 * Models.dev Service
 *
 * Provides access to model data from models.dev API:
 * - Fetches all models from https://models.dev/api.json
 * - Caches data in memory with TTL (24 hours)
 * - Filters by provider and tool calling support
 * - Returns normalized model data with provider logos
 */

import { cache } from "react";

// Models.dev API types
interface ModelData {
  id: string; // e.g., "anthropic/claude-3-5-sonnet-20241022"
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

interface ModelsDevResponse {
  [key: string]: ModelData;
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
  for (const [modelId, modelData] of Object.entries(data)) {
    const normalized = normalizeModel(modelId, modelData);

    // Only include models with tool calling support
    if (normalized && normalized.toolCallSupport) {
      models.push(normalized);
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
```

**Dependencies:**

```typescript
// Built-in Node.js - no external dependencies needed
// Uses Next.js fetch with caching via next.revalidate
```

**Key Features:**

- Fetches from models.dev API once per 24 hours
- Filters to only tool-calling-capable models
- Provides helper functions for system vs BYOK models
- Includes cost and context window formatting utilities
- Type-safe with full TypeScript support

### 2. `src/app/api/v1/models/route.ts` (NEW FILE)

**Purpose:** API endpoint to expose filtered models to the frontend

**Handler Signature:**

```typescript
// GET - Get available models based on user's saved API keys
export async function GET(request: Request): Promise<Response>;
```

**Implementation Structure:**

```typescript
import { stackServerApp } from "@/lib/stack/server";
import { db } from "@/lib/db/db";
import { userAiApiKeysTable } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import {
  getAllModels,
  getSystemModels,
  getBYOKModels,
  type NormalizedModel,
} from "@/lib/models-dev";

interface ModelsResponse {
  systemModels: NormalizedModel[];
  byokModels: NormalizedModel[];
  userProviders: Array<"anthropic" | "openai" | "google">;
}

export async function GET(request: Request): Promise<Response> {
  try {
    // Get authenticated user
    const user = await stackServerApp.getUser();
    if (!user) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Get user's saved API keys to determine which BYOK models to show
    const userKeys = await db.query.userAiApiKeysTable.findMany({
      where: eq(userAiApiKeysTable.userId, user.id),
    });

    const savedProviders = userKeys.map((key) => key.provider) as Array<
      "anthropic" | "openai" | "google"
    >;

    // Fetch system models (always available)
    const systemModels = await getSystemModels();

    // Fetch BYOK models based on saved keys
    const byokModels = await getBYOKModels(savedProviders);

    const response: ModelsResponse = {
      systemModels,
      byokModels,
      userProviders: savedProviders,
    };

    return Response.json(response);
  } catch (error) {
    console.error("Failed to fetch models:", error);
    return Response.json({ error: "Failed to fetch models" }, { status: 500 });
  }
}
```

**Dependencies:**

```typescript
import { stackServerApp } from "@/lib/stack/server";
import { db } from "@/lib/db/db";
import { userAiApiKeysTable } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import {
  getAllModels,
  getSystemModels,
  getBYOKModels,
  type NormalizedModel,
} from "@/lib/models-dev";
```

## Files to Modify

### 3. `src/lib/model-selection/types.ts`

**Changes:**

- **Modify:** Update `ModelSelection` type to use full model IDs from models.dev

```typescript
export type ModelSelection = {
  provider: "platform" | "personal";
  modelId: string; // Full model ID from models.dev (e.g., "anthropic/claude-3-5-haiku-20241022")
};

export const DEFAULT_MODEL_SELECTION: ModelSelection = {
  provider: "platform",
  modelId: "anthropic/claude-3-5-haiku-20241022",
};
```

**Rationale:**

- Support dynamic model selection from models.dev
- Allow any model from any provider (not limited to Haiku)
- Keep type definition centralized in model-selection module
- Cookie persistence will automatically save the full modelId

**Keep:**

- Existing cookie persistence logic works with new structure
- Validation logic in hooks.ts compatible with new type

### 4. `src/lib/model-selection/hooks.ts`

**Changes:**

- **Update:** Validation logic to check provider based on modelId prefix

```typescript
// In useModelSelection hook, update validation effect:

useEffect(() => {
  if (!validatePersonalProvider || !accessToken) return;
  if (modelSelection.provider !== "personal") return;

  const validateKey = async () => {
    try {
      const response = await fetch(`/api/v1/user/ai-keys`, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });

      if (!response.ok) {
        throw new Error("Failed to fetch API keys");
      }

      const data = await response.json();

      // Extract provider from modelId (e.g., "anthropic/claude-3-5-haiku" -> "anthropic")
      const modelProvider = modelSelection.modelId.split("/")[0] as
        | "anthropic"
        | "openai"
        | "google";

      // Check if user has key for this provider
      const hasProviderKey = data.keys.some(
        (key: KeyStatus) => key.provider === modelProvider && key.hasKey,
      );

      // If no key found, fall back to platform
      if (!hasProviderKey) {
        console.warn(
          `Personal provider selected for ${modelProvider} but no API key found, falling back to platform`,
        );
        updateModelSelection(DEFAULT_MODEL_SELECTION);
      }
    } catch (error) {
      console.error("Failed to validate personal provider:", error);
      // On error, fall back to platform for safety
      updateModelSelection(DEFAULT_MODEL_SELECTION);
    }
  };

  validateKey();
}, []); // Only run on mount
```

**Rationale:**

- Dynamic provider detection from modelId
- Works with any provider (not just Anthropic)
- Maintains same safety guarantees as before

**Keep:**

- All existing hook structure
- Cookie save/load functionality
- Return value and API

### 5. `src/lib/db/schema.ts`

**Changes:**

- **Add:** "google" to the AI provider enum

```typescript
export const aiProviderEnum = pgEnum("ai_provider", [
  "anthropic",
  "openai",
  "openrouter",
  "google", // NEW
]);
```

**Keep:**

- All existing table definitions
- All existing type exports
- All existing imports

### 6. `migrations/0011_add_google_provider.sql` (NEW FILE)

**Purpose:** Database migration to add "google" to ai_provider enum

**Migration SQL:**

```sql
-- Add 'google' to the ai_provider enum
ALTER TYPE "ai_provider" ADD VALUE IF NOT EXISTS 'google';
```

**Note:** Postgres doesn't support adding enum values in a transaction, so this migration should be run separately from other changes if needed.

### 7. `src/components/model-selector-modal.tsx`

**Changes:**

- **Update:** Import `ModelSelection` type from `@/lib/model-selection` instead of defining locally
- **Modify:** Provider type to include "google"
- **Add:** Per-provider loading states
- **Add:** Provider console links
- **Redesign:** Model selection UI to show grouped models with logos
- **Add:** Fetch models from `/api/v1/models` endpoint
- **Add:** Display model details (cost, context window)

```typescript
"use client";

import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Trash2, ExternalLink } from "lucide-react";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import type { NormalizedModel } from "@/lib/models-dev";
import type { ModelSelection } from "@/lib/model-selection"; // Import from centralized location

type AIProvider = "anthropic" | "openai" | "google";

interface KeyStatus {
  provider: AIProvider;
  hasKey: boolean;
}

interface ProviderLoadingState {
  saving: boolean;
  deleting: boolean;
}

interface ModelsResponse {
  systemModels: NormalizedModel[];
  byokModels: NormalizedModel[];
  userProviders: AIProvider[];
}

interface ModelSelectorModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  accessToken: string;
  selectedModel: ModelSelection;
  onModelSelect: (model: ModelSelection) => void;
}

const PROVIDER_CONFIG = {
  anthropic: {
    label: "Anthropic API Key",
    placeholder: "sk-ant-...",
    consoleUrl: "https://console.anthropic.com/settings/keys",
    consoleLabel: "View Claude console",
  },
  openai: {
    label: "OpenAI API Key",
    placeholder: "sk-...",
    consoleUrl: "https://platform.openai.com/api-keys",
    consoleLabel: "View OpenAI console",
  },
  google: {
    label: "Google AI API Key",
    placeholder: "...",
    consoleUrl: "https://aistudio.google.com/apikey",
    consoleLabel: "View Google AI Studio",
  },
} as const;

export function ModelSelectorModal({
  open,
  onOpenChange,
  accessToken,
  selectedModel,
  onModelSelect,
}: ModelSelectorModalProps) {
  const [keyStatuses, setKeyStatuses] = useState<Map<AIProvider, boolean>>(
    new Map(),
  );
  const [apiKeyInputs, setApiKeyInputs] = useState<Map<AIProvider, string>>(
    new Map(),
  );
  const [loadingStates, setLoadingStates] = useState<
    Map<AIProvider, ProviderLoadingState>
  >(new Map());
  const [selectedModelOption, setSelectedModelOption] = useState<string>(
    `${selectedModel.provider}:${selectedModel.modelId}`,
  );
  const [error, setError] = useState<string | null>(null);
  const [justSavedKey, setJustSavedKey] = useState<AIProvider | null>(null);
  const [models, setModels] = useState<ModelsResponse | null>(null);
  const [modelsLoading, setModelsLoading] = useState(false);

  // Fetch key status and models on mount and when modal opens
  useEffect(() => {
    if (open) {
      setJustSavedKey(null);
      setError(null);
      setApiKeyInputs(new Map());
      checkKeyStatus();
      fetchModels();
    }
  }, [open]);

  const checkKeyStatus = async () => {
    try {
      const response = await fetch(`/api/v1/user/ai-keys`, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });

      if (response.ok) {
        const data = await response.json();
        const statusMap = new Map<AIProvider, boolean>();
        data.keys.forEach((key: KeyStatus) => {
          statusMap.set(key.provider, key.hasKey);
        });
        setKeyStatuses(statusMap);
      }
    } catch (err) {
      console.error("Failed to check key status:", err);
    }
  };

  const fetchModels = async () => {
    setModelsLoading(true);
    try {
      const response = await fetch(`/api/v1/models`, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });

      if (response.ok) {
        const data: ModelsResponse = await response.json();
        setModels(data);
      }
    } catch (err) {
      console.error("Failed to fetch models:", err);
    } finally {
      setModelsLoading(false);
    }
  };

  const getProviderLoadingState = (
    provider: AIProvider,
  ): ProviderLoadingState => {
    return (
      loadingStates.get(provider) || {
        saving: false,
        deleting: false,
      }
    );
  };

  const setProviderLoadingState = (
    provider: AIProvider,
    state: Partial<ProviderLoadingState>,
  ) => {
    const current = getProviderLoadingState(provider);
    const newStates = new Map(loadingStates);
    newStates.set(provider, { ...current, ...state });
    setLoadingStates(newStates);
  };

  const handleSaveKey = async (provider: AIProvider) => {
    const apiKey = apiKeyInputs.get(provider);
    if (!apiKey?.trim()) {
      setError("Please enter an API key");
      return;
    }

    setProviderLoadingState(provider, { saving: true });
    setError(null);

    try {
      const response = await fetch(`/api/v1/user/ai-keys`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          provider,
          apiKey,
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Failed to save API key");
      }

      // Update status and clear input
      setKeyStatuses(new Map(keyStatuses).set(provider, true));
      setApiKeyInputs(new Map(apiKeyInputs).set(provider, ""));
      setJustSavedKey(provider);

      // Refresh models to include new provider's models
      fetchModels();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save API key");
    } finally {
      setProviderLoadingState(provider, { saving: false });
    }
  };

  const handleDeleteKey = async (provider: AIProvider) => {
    setProviderLoadingState(provider, { deleting: true });
    setError(null);

    try {
      const response = await fetch(
        `/api/v1/user/ai-keys?provider=${provider}`,
        {
          method: "DELETE",
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        },
      );

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Failed to delete API key");
      }

      // Update status
      setKeyStatuses(new Map(keyStatuses).set(provider, false));
      setJustSavedKey(null);

      // If currently using personal key from this provider, switch to first system model
      if (selectedModel.provider === "personal") {
        const currentModelProvider = selectedModel.modelId.split("/")[0];
        if (currentModelProvider === provider) {
          // Switch to first system model
          const firstSystemModel = models?.systemModels[0];
          if (firstSystemModel) {
            const newSelection: ModelSelection = {
              provider: "platform",
              modelId: firstSystemModel.id,
            };
            onModelSelect(newSelection);
            setSelectedModelOption(`platform:${firstSystemModel.id}`);
          }
        }
      }

      // Refresh models to remove this provider's models
      fetchModels();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete API key");
    } finally {
      setProviderLoadingState(provider, { deleting: false });
    }
  };

  const handleApplyModelSelection = () => {
    const [provider, modelId] = selectedModelOption.split(":");

    const newSelection: ModelSelection = {
      provider: provider as "platform" | "personal",
      modelId,
    };

    onModelSelect(newSelection);
    onOpenChange(false);
  };

  const renderKeyInput = (provider: AIProvider) => {
    const config = PROVIDER_CONFIG[provider];
    const hasKey = keyStatuses.get(provider) || false;
    const inputValue = apiKeyInputs.get(provider) || "";
    const showSavedMessage = justSavedKey === provider;
    const loadingState = getProviderLoadingState(provider);
    const isLoading = loadingState.saving || loadingState.deleting;

    return (
      <div key={provider} className="space-y-2 p-4 border rounded-lg">
        <div className="flex items-center justify-between">
          <Label htmlFor={`${provider}-key`}>{config.label}</Label>
          <a
            href={config.consoleUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1"
          >
            {config.consoleLabel}
            <ExternalLink className="h-3 w-3" />
          </a>
        </div>
        <div className="flex gap-2">
          <div className="flex-1">
            <Input
              id={`${provider}-key`}
              type="password"
              placeholder={config.placeholder}
              value={hasKey && !inputValue ? "••••••••••••••••" : inputValue}
              onChange={(e) => {
                const newInputs = new Map(apiKeyInputs);
                newInputs.set(provider, e.target.value);
                setApiKeyInputs(newInputs);
              }}
              disabled={isLoading || (hasKey && !inputValue)}
              className={hasKey && !inputValue ? "bg-muted" : ""}
            />
            {showSavedMessage && (
              <p className="text-sm text-green-600 mt-1">✓ Key saved</p>
            )}
          </div>
          {hasKey && (
            <Button
              variant="destructive"
              size="icon"
              onClick={() => handleDeleteKey(provider)}
              disabled={isLoading}
              title="Delete key"
            >
              {loadingState.deleting ? (
                <div className="h-4 w-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
              ) : (
                <Trash2 className="h-4 w-4" />
              )}
            </Button>
          )}
        </div>
        {!hasKey && inputValue && (
          <Button
            onClick={() => handleSaveKey(provider)}
            disabled={isLoading}
            size="sm"
          >
            {loadingState.saving ? "Saving..." : "Save Key"}
          </Button>
        )}
      </div>
    );
  };

  const renderModelOption = (model: NormalizedModel, type: "platform" | "personal") => {
    const optionValue = `${type}:${model.id}`;
    const isDisabled = type === "personal" && !keyStatuses.get(model.provider);

    return (
      <div
        key={optionValue}
        className={`flex items-start space-x-3 p-3 rounded-lg border ${
          isDisabled ? "opacity-50" : "hover:bg-accent cursor-pointer"
        }`}
      >
        <RadioGroupItem
          value={optionValue}
          id={optionValue}
          disabled={isDisabled}
          className="mt-1"
        />
        <div className="flex-1 space-y-1">
          <div className="flex items-center gap-2">
            <img
              src={model.logoUrl}
              alt={model.provider}
              className="h-4 w-4"
              onError={(e) => {
                // Fallback if logo fails to load
                e.currentTarget.style.display = "none";
              }}
            />
            <Label
              htmlFor={optionValue}
              className={isDisabled ? "opacity-50" : "cursor-pointer font-medium"}
            >
              {model.displayName}
            </Label>
          </div>
          <div className="text-xs text-muted-foreground space-y-0.5">
            <div>
              Context: {formatContextWindow(model.contextWindow)} • Output:{" "}
              {formatContextWindow(model.maxOutput)}
            </div>
            <div>
              Cost: {formatCost(model.inputCostPerMillion)}/M input •{" "}
              {formatCost(model.outputCostPerMillion)}/M output
            </div>
            {isDisabled && (
              <div className="text-orange-600 dark:text-orange-400">
                Requires {model.provider} API key
              </div>
            )}
          </div>
        </div>
      </div>
    );
  };

  const formatCost = (costPerMillion: number): string => {
    return `$${costPerMillion.toFixed(2)}`;
  };

  const formatContextWindow = (tokens: number): string => {
    if (tokens >= 1000000) {
      return `${(tokens / 1000000).toFixed(1)}M`;
    }
    if (tokens >= 1000) {
      return `${(tokens / 1000).toFixed(0)}K`;
    }
    return `${tokens}`;
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px] max-h-[80vh]">
        <DialogHeader>
          <DialogTitle>Model Settings</DialogTitle>
        </DialogHeader>

        <Tabs defaultValue="model-selection" className="w-full">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="model-selection">Model Selection</TabsTrigger>
            <TabsTrigger value="api-keys">API Keys</TabsTrigger>
          </TabsList>

          <TabsContent value="model-selection" className="space-y-4">
            {modelsLoading ? (
              <div className="flex items-center justify-center py-8">
                <div className="h-8 w-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
              </div>
            ) : models ? (
              <ScrollArea className="h-[400px] pr-4">
                <div className="space-y-4">
                  <RadioGroup
                    value={selectedModelOption}
                    onValueChange={setSelectedModelOption}
                  >
                    {/* System Models Section */}
                    {models.systemModels.length > 0 && (
                      <div className="space-y-2">
                        <div className="flex items-center gap-2">
                          <h3 className="font-semibold text-sm">System Models</h3>
                          <span className="text-xs text-muted-foreground">
                            (Always available)
                          </span>
                        </div>
                        {models.systemModels.map((model) =>
                          renderModelOption(model, "platform"),
                        )}
                      </div>
                    )}

                    {/* BYOK Models Section */}
                    {models.byokModels.length > 0 && (
                      <>
                        <Separator className="my-4" />
                        <div className="space-y-2">
                          <div className="flex items-center gap-2">
                            <h3 className="font-semibold text-sm">Your Models</h3>
                            <span className="text-xs text-muted-foreground">
                              (Using your API keys)
                            </span>
                          </div>
                          {models.byokModels.map((model) =>
                            renderModelOption(model, "personal"),
                          )}
                        </div>
                      </>
                    )}

                    {/* No BYOK Models Available */}
                    {models.byokModels.length === 0 && (
                      <>
                        <Separator className="my-4" />
                        <div className="text-sm text-muted-foreground p-4 border rounded-lg">
                          <p className="mb-2">
                            Add your API keys to unlock more models:
                          </p>
                          <ul className="list-disc list-inside space-y-1 ml-2">
                            {!keyStatuses.get("anthropic") && (
                              <li>Anthropic: Claude Opus, Sonnet variants</li>
                            )}
                            {!keyStatuses.get("openai") && (
                              <li>OpenAI: GPT-4, GPT-4o, o1, o3, and more</li>
                            )}
                            {!keyStatuses.get("google") && (
                              <li>Google: Gemini Pro, Flash, and more</li>
                            )}
                          </ul>
                        </div>
                      </>
                    )}
                  </RadioGroup>
                </div>
              </ScrollArea>
            ) : (
              <div className="text-sm text-muted-foreground p-4">
                Failed to load models. Please try again.
              </div>
            )}

            <div className="flex gap-2 pt-4 border-t">
              <Button onClick={handleApplyModelSelection}>Apply</Button>
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
            </div>
          </TabsContent>

          <TabsContent value="api-keys" className="space-y-4">
            <ScrollArea className="h-[400px] pr-4">
              <div className="space-y-4">
                {renderKeyInput("anthropic")}
                {renderKeyInput("openai")}
                {renderKeyInput("google")}
              </div>
            </ScrollArea>

            {error && (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
```

**Key Changes:**

- Added per-provider loading states (separate for save/delete)
- Added provider console links with ExternalLink icon
- Redesigned model selection with grouped sections
- Added model logos from models.dev
- Added model details (context, cost)
- Fetches models from `/api/v1/models` endpoint
- Shows "System Models" and "Your Models" sections

### 8. `src/components/project-chat.tsx`

**Changes:**

> **Note:** This component already uses `useModelSelection` hook from the cookie persistence implementation. The hook will automatically work with the updated `ModelSelection` type.

- **No changes needed to hook usage** - It already uses `useModelSelection` from `@/lib/model-selection`
- **Update only:** Model display name helper to handle full model IDs

```typescript
// The component already uses useModelSelection hook:
const { modelSelection, updateModelSelection } = useModelSelection({
  accessToken,
  validatePersonalProvider: true,
});

// Update transport API URL to use modelId instead of model
transport: new AssistantChatTransport({
  api: `${process.env.NEXT_PUBLIC_MASTRA_API_URL}?projectId=${projectId}&modelId=${encodeURIComponent(modelSelection.modelId)}&keyProvider=${modelSelection.provider}`,
  headers: {
    Authorization: `Bearer ${accessToken}`,
  },
}),

// Add helper to get model display name from full model ID
const getModelDisplayName = () => {
  // Extract just the model name from ID
  // e.g., "anthropic/claude-3-5-haiku-20241022" -> "Claude 3.5 Haiku"
  const parts = modelSelection.modelId.split("/");
  if (parts.length > 1) {
    const modelPart = parts[1];
    // Convert to display name (simplified)
    return modelPart
      .replace(/-/g, " ")
      .replace(/\d{8}$/, "")
      .split(" ")
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(" ")
      .trim();
  }
  return modelSelection.modelId;
};

// In the button (update to show formatted name)
<Button
  variant="outline"
  size="sm"
  onClick={() => setIsModelSelectorOpen(true)}
>
  <span className="mr-2">{getModelDisplayName()}</span>
  <ChevronDown className="h-4 w-4" />
</Button>
```

**Keep:**

- Existing `useModelSelection` hook usage
- All existing props and other state
- All existing functionality
- All existing imports (no new imports needed)

### 9. `src/mastra/routes/codegen.ts`

**Changes:**

- **Modify:** Query param parsing to use full modelId instead of just model name

```typescript
export async function POST(c: ContextWithMastra): Promise<Response> {
  const mastra = c.get("mastra");
  const runtimeContext = c.get("runtimeContext");
  const { messages } = await c.req.json();

  // Parse query params for model selection
  const url = new URL(c.req.url);
  const modelId =
    url.searchParams.get("modelId") || "anthropic/claude-3-5-haiku-20241022";
  const keyProvider = url.searchParams.get("keyProvider") || "platform";

  // Get user info from runtime context
  const user = runtimeContext.get("user") as UserContext;

  // Parse provider from modelId (e.g., "anthropic/claude-3-5-haiku" -> "anthropic")
  const provider = modelId.split("/")[0] as "anthropic" | "openai" | "google";

  // If using personal key, fetch and decrypt it from database
  let apiKey: string | undefined;
  if (keyProvider === "personal" && user) {
    const decryptedKey = await getDecryptedApiKey(user.userId, provider);
    if (!decryptedKey) {
      return Response.json(
        {
          error: `Personal API key not found for ${provider}. Please add your ${provider} API key in settings.`,
        },
        { status: 400 },
      );
    }
    apiKey = decryptedKey;
  }

  // Add to runtime context
  runtimeContext.set("modelSelection", {
    modelId,
    provider,
    keyProvider,
    apiKey, // Only set if using personal key
  });

  console.log(
    `[Codegen] Processing request with ${messages.length} messages, model: ${modelId}, keyProvider: ${keyProvider}`,
  );

  // ... rest of existing code
}
```

**Keep:**

- All existing error handling
- All existing stream processing
- All existing logging

### 10. `src/mastra/agents/codegenAgent.ts`

**Changes:**

- **Replace:** Model selection logic to support multiple providers

```typescript
import { anthropic, createAnthropic } from "@ai-sdk/anthropic";
import { openai, createOpenAI } from "@ai-sdk/openai";
import { google, createGoogleGenerativeAI } from "@ai-sdk/google";
import { Agent } from "@mastra/core/agent";
import { RuntimeContext } from "@mastra/core/runtime-context";
import type { CodegenRuntimeContext, UserContext } from "../lib/context";
import type { Project } from "@/lib/db/schema";
import { getCodegenTools } from "../lib/tools";

export const codegenAgent = new Agent({
  name: "codegen-agent",
  description:
    "Expert Next.js code generation assistant specializing in modern full-stack applications with database management capabilities",

  tools: ({
    runtimeContext,
  }: {
    runtimeContext: RuntimeContext<CodegenRuntimeContext>;
  }) => getCodegenTools(runtimeContext),

  instructions: ({ runtimeContext }) => {
    // ... existing instructions ...
  },

  model: ({
    runtimeContext,
  }: {
    runtimeContext: RuntimeContext<CodegenRuntimeContext>;
  }) => {
    const modelSelection = runtimeContext.get("modelSelection") as
      | {
          modelId: string;
          provider: "anthropic" | "openai" | "google";
          keyProvider: "platform" | "personal";
          apiKey?: string;
        }
      | undefined;

    // Default to Claude Haiku if no selection
    const modelId =
      modelSelection?.modelId || "anthropic/claude-3-5-haiku-20241022";
    const provider = modelSelection?.provider || "anthropic";
    const apiKey = modelSelection?.apiKey;

    // Extract model name from ID (remove provider prefix)
    // e.g., "anthropic/claude-3-5-haiku-20241022" -> "claude-3-5-haiku-20241022"
    const modelName = modelId.includes("/") ? modelId.split("/")[1] : modelId;

    console.log(
      `[codegenAgent] Using model: ${modelId}, provider: ${provider}, keyProvider: ${modelSelection?.keyProvider || "platform"}`,
    );

    // Select appropriate AI SDK adapter based on provider
    switch (provider) {
      case "anthropic": {
        if (apiKey) {
          const customAnthropic = createAnthropic({ apiKey });
          return customAnthropic(modelName);
        }
        return anthropic(modelName);
      }

      case "openai": {
        if (apiKey) {
          const customOpenAI = createOpenAI({ apiKey });
          return customOpenAI(modelName);
        }
        return openai(modelName);
      }

      case "google": {
        if (apiKey) {
          const customGoogle = createGoogleGenerativeAI({ apiKey });
          return customGoogle(modelName);
        }
        return google(modelName);
      }

      default: {
        console.warn(
          `[codegenAgent] Unknown provider: ${provider}, falling back to Claude Haiku`,
        );
        return anthropic("claude-3-5-haiku-20241022");
      }
    }
  },

  maxRetries: 1,
  defaultStreamOptions: {
    maxSteps: 50,
  },
});
```

**Dependencies to Add:**

```typescript
import { openai, createOpenAI } from "@ai-sdk/openai";
import { google, createGoogleGenerativeAI } from "@ai-sdk/google";
```

**Keep:**

- All existing tool configuration
- All existing instructions
- All existing agent configuration

### 11. `src/mastra/lib/context.ts`

**Changes:**

- **Modify:** Model selection type in CodegenRuntimeContext

```typescript
export type CodegenRuntimeContext = {
  project: Project;
  user: UserContext;
  modelSelection?: {
    modelId: string; // Full model ID from models.dev (e.g., "anthropic/claude-3-5-haiku-20241022")
    provider: "anthropic" | "openai" | "google";
    keyProvider: "platform" | "personal";
    apiKey?: string;
  };
};
```

**Keep:**

- All existing context types
- All existing exports

### 12. `package.json`

**Changes:**

- **Add:** AI SDK packages for OpenAI and Google

```json
{
  "dependencies": {
    "@ai-sdk/anthropic": "latest",
    "@ai-sdk/openai": "latest", // NEW
    "@ai-sdk/google": "latest" // NEW
    // ... existing dependencies
  }
}
```

## Directory Structure

```
src/
├── app/
│   └── api/
│       └── v1/
│           ├── models/
│           │   └── route.ts                 (NEW FILE - models endpoint)
│           └── user/
│               └── ai-keys/
│                   └── route.ts             (EXISTING - no changes needed)
├── components/
│   ├── model-selector-modal.tsx            (MODIFY - multi-provider + logos + import types)
│   └── project-chat.tsx                    (MODIFY - use modelId in URL)
├── lib/
│   ├── models-dev.ts                       (NEW FILE - models.dev service)
│   ├── cookies/
│   │   └── index.ts                        (EXISTING - from cookie persistence)
│   ├── model-selection/
│   │   ├── index.ts                        (EXISTING - from cookie persistence)
│   │   ├── types.ts                        (MODIFY - update to use modelId)
│   │   ├── cookie.ts                       (EXISTING - from cookie persistence)
│   │   └── hooks.ts                        (MODIFY - update validation logic)
│   ├── encryption.ts                       (EXISTING - no changes)
│   └── db/
│       └── schema.ts                       (MODIFY - add google to enum)
├── mastra/
│   ├── agents/
│   │   └── codegenAgent.ts                 (MODIFY - multi-provider support)
│   ├── lib/
│   │   └── context.ts                      (MODIFY - update modelSelection type)
│   └── routes/
│       └── codegen.ts                      (MODIFY - parse modelId)
migrations/
└── 0011_add_google_provider.sql            (NEW FILE - add google to enum)
```

**Legend:**

- **(NEW FILE)** - File to be created in this implementation
- **(MODIFY)** - Existing file to be updated
- **(EXISTING)** - File created in cookie persistence implementation, no changes needed

## Implementation Flow

```
1. Update Model Selection Types (Building on cookie persistence)
   a. Update src/lib/model-selection/types.ts to use modelId instead of model
   b. Update DEFAULT_MODEL_SELECTION to use modelId
   c. Verify existing cookie.ts still works with new type
   d. Update src/lib/model-selection/hooks.ts validation logic
   e. Test that existing cookie persistence still works

2. Database Schema Updates
   a. Add "google" to ai_provider enum in schema.ts
   b. Create migration 0011_add_google_provider.sql
   c. Run migration: bun run db:generate && bun run db:migrate
   d. Verify enum updated in database

3. Models.dev Service
   a. Create src/lib/models-dev.ts with all helper functions
   b. Test fetching from models.dev API
   c. Verify filtering by tool_call support works
   d. Test caching mechanism
   e. Verify provider logo URLs work

4. Models API Endpoint
   a. Create src/app/api/v1/models/route.ts
   b. Implement GET handler with user key filtering
   c. Test with different user key combinations
   d. Verify system vs BYOK model segregation

5. Install AI SDK Packages
   a. Add @ai-sdk/openai to package.json
   b. Add @ai-sdk/google to package.json
   c. Run: bun install
   d. Verify packages installed correctly

6. Update Model Selector Modal
   a. Update import to use ModelSelection from @/lib/model-selection
   b. Add per-provider loading states
   c. Add provider console links
   d. Implement models fetching from /api/v1/models
   e. Add model rendering with logos and details
   f. Update all references from .model to .modelId
   g. Test all three providers independently
   h. Verify loading states work correctly
   i. Test console links open correctly

7. Update Project Chat
   a. Update transport URL to use modelId param (instead of model)
   b. Add model display name helper for full model IDs
   c. Update button to show formatted name
   d. Test that useModelSelection hook works with new type
   e. Test model selection persists in cookie correctly

8. Backend Integration
   a. Update codegen.ts to parse modelId param (instead of model)
   b. Extract provider from modelId
   c. Fetch appropriate API key based on provider
   d. Update runtime context with new structure
   e. Test with all three providers

9. Agent Configuration
   a. Import OpenAI and Google AI SDK packages
   b. Update model selection logic with switch statement
   c. Add provider-specific adapter creation
   d. Add fallback handling
   e. Test with all three providers and both key types
   f. Verify custom API keys work for each provider

10. End-to-End Testing
    a. Test saving keys for all three providers
    b. Test deleting keys for all three providers
    c. Test model selection with platform keys
    d. Test model selection with personal keys
    e. Test switching providers mid-conversation
    f. Test error handling for missing keys
    g. Test UI shows correct provider logos
    h. Test cost and context info displays correctly
    i. Test console links work
    j. Verify system vs BYOK grouping
    k. Verify cookie persistence works with new modelId structure
    l. Test page refresh maintains selected model
```

## Model Selection UI Design (Enhanced UX)

### Recommended: Single Unified View with Collapsible Sections

Instead of tabs, use a single scrollable view with collapsible provider sections:

```
┌─────────────────────────────────────────────────────────┐
│ Select Model                                        [×] │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  🟢 System Models (Always available)                    │
│                                                         │
│  ┌─────────────────────────────────────────────────┐   │
│  │ ● [🔷] Claude 3.5 Haiku            FASTEST      │   │
│  │    200K context • $1.00/$5.00 per M             │   │
│  └─────────────────────────────────────────────────┘   │
│                                                         │
│  ┌─────────────────────────────────────────────────┐   │
│  │ ○ [🔷] Claude 3.5 Sonnet          RECOMMENDED   │   │
│  │    200K context • $3.00/$15.00 per M            │   │
│  └─────────────────────────────────────────────────┘   │
│                                                         │
│  ─────────────────────────────────────────────────────  │
│                                                         │
│  ▼ [🔷] Anthropic (4 more models) ────────── [✓ Key]  │
│     Claude 3 Opus, Claude 3.5 Sonnet, ...              │
│                                                         │
│  ▶ [⚪] OpenAI (8 models available) ──────── [+ Add]   │
│     Unlock: GPT-4o, GPT-4 Turbo, o1, o3, ...           │
│                                                         │
│  ▶ [🔵] Google (3 models available) ─────── [+ Add]    │
│     Unlock: Gemini Pro, Gemini Flash, ...              │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

**When Anthropic section is expanded:**

```
┌─────────────────────────────────────────────────────────┐
│  ▼ [🔷] Anthropic (4 more models) ────────── [✓ Key]  │
│                                                         │
│  ┌─────────────────────────────────────────────────┐   │
│  │ ○ [🔷] Claude 3 Opus              MOST CAPABLE  │   │
│  │    200K context • $15.00/$75.00 per M           │   │
│  └─────────────────────────────────────────────────┘   │
│                                                         │
│  ┌─────────────────────────────────────────────────┐   │
│  │ ○ [🔷] Claude 3 Sonnet                          │   │
│  │    200K context • $3.00/$15.00 per M            │   │
│  └─────────────────────────────────────────────────┘   │
│                                                         │
│  ... (2 more)                                          │
│                                                         │
│  🔑 Using your API key                                 │
│     [Manage Key ↗]  [Remove Key]                       │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

**When OpenAI section is clicked (no key):**

```
┌─────────────────────────────────────────────────────────┐
│  ▼ [⚪] OpenAI (8 models available) ──────── [+ Add]   │
│                                                         │
│  💡 Add your OpenAI API key to unlock these models     │
│                                                         │
│  ┌─────────────────────────────────────────────────┐   │
│  │ OpenAI API Key                                  │   │
│  │ ┌─────────────────────────────────────────────┐ │   │
│  │ │ sk-...                              [Save]   │ │   │
│  │ └─────────────────────────────────────────────┘ │   │
│  │ Get your key from OpenAI console ↗              │   │
│  └─────────────────────────────────────────────────┘   │
│                                                         │
│  Models you'll unlock:                                 │
│  • GPT-4o • GPT-4 Turbo • GPT-4o mini                 │
│  • o1 • o3 • o4-mini • and 2 more                     │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

### Alternative: Improved Tabbed Design

If keeping tabs, make them more action-oriented:

```
┌─────────────────────────────────────────────────────────┐
│ ┌───────────────┬─────────────────┬──────────────────┐ │
│ │ Choose Model  │  🔷 Anthropic   │  ⚪ OpenAI       │ │
│ │  (Selected)   │  🔑 Configured  │  ⊕ Add Key      │ │
│ └───────────────┴─────────────────┴──────────────────┘ │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  Quick Select                                           │
│                                                         │
│  ┌──────────────┐ ┌──────────────┐ ┌──────────────┐  │
│  │    FAST      │ │  BALANCED    │ │  POWERFUL    │  │
│  │              │ │              │ │              │  │
│  │ Claude 3.5   │ │ Claude 3.5   │ │  Claude 3    │  │
│  │   Haiku      │ │   Sonnet     │ │    Opus      │  │
│  │              │ │              │ │              │  │
│  │   $1/$5      │ │  $3/$15      │ │  $15/$75     │  │
│  │   per M      │ │  per M       │ │  per M       │  │
│  │              │ │              │ │              │  │
│  │  [Select] ✓  │ │  [Select]    │ │  [Select]    │  │
│  └──────────────┘ └──────────────┘ └──────────────┘  │
│                                                         │
│  ─────────────────────────────────────────────────────  │
│                                                         │
│  ▼ All Models (12 available)                           │
│                                                         │
│  System Models • Anthropic Models • OpenAI (Locked)    │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

### Key UX Improvements:

1. **Collapsible Provider Sections**
   - Reduces visual clutter
   - Shows model count at a glance
   - Clear key status (✓ Key, + Add)

2. **Inline Key Management**
   - Add key directly when expanding locked provider
   - No tab switching needed
   - Immediate feedback on what unlocks

3. **Visual Hierarchy**
   - System models always at top (always available)
   - Provider sections grouped logically
   - Clear status indicators

4. **Quick Actions**
   - "Get key" link opens provider console in new tab
   - One-click expand to see all provider models
   - Manage/Remove key right in the section

5. **Better Information Architecture**
   - Model count preview ("8 models available")
   - What you'll unlock list before adding key
   - Badges: FASTEST, RECOMMENDED, MOST CAPABLE

6. **Simplified Flow**

   ```
   User wants GPT-4o
   → Clicks OpenAI section
   → Sees "Add API key to unlock"
   → Pastes key, clicks Save
   → Section expands showing all OpenAI models
   → Selects GPT-4o
   → Clicks Apply
   → Done!
   ```

7. **Card-Based Quick Select** (Alternative design)
   - Preset recommendations for common use cases
   - Reduces decision paralysis
   - Fast/Balanced/Powerful presets

### Visual Design Enhancements:

```typescript
// Color-coded provider badges
Anthropic: Blue (#1E90FF)
OpenAI: Green (#10B981)
Google: Multi-color (#4285F4, #EA4335, #FBBC04, #34A853)

// Status indicators
✓ Key Saved: Green badge
+ Add Key: Dashed border, muted
🔒 Locked: Gray overlay on models

// Cost display formatting
Input/Output per M tokens
$1.00/$5.00 instead of verbose text

// Context window badges
<100K: Small badge
100K-500K: Medium badge
500K+: Large badge with ⚡ icon
```

## Testing Checklist

### Database

- [ ] Migration adds "google" to enum successfully
- [ ] Can save Google API key to database
- [ ] Unique constraint works for user+provider combo

### Models.dev Service

- [ ] Fetches data from models.dev API
- [ ] Caching works (24-hour TTL)
- [ ] Filters out models without tool_call support
- [ ] Returns only anthropic, openai, google models
- [ ] System models function returns correct models
- [ ] BYOK models function respects saved keys
- [ ] Logo URLs are correctly formatted
- [ ] Cost and context formatters work

### API Endpoints

- [ ] `/api/v1/models` requires authentication
- [ ] Returns system models correctly
- [ ] Returns BYOK models based on saved keys
- [ ] Handles no saved keys gracefully
- [ ] Handles models.dev API failures

### Model Selector Modal

- [ ] Fetches and displays models correctly
- [ ] Groups models into System vs BYOK sections
- [ ] Provider logos display correctly
- [ ] Model details (cost, context) show correctly
- [ ] Per-provider loading states work independently
- [ ] Can save Anthropic key with loading state
- [ ] Can save OpenAI key with loading state
- [ ] Can save Google key with loading state
- [ ] Can delete keys with separate loading states
- [ ] Console links open correct URLs
- [ ] Disabled models show appropriate message
- [ ] Model selection persists on Apply

### Project Chat Integration

- [ ] Model selector button shows current model
- [ ] Model name displays correctly
- [ ] Selection persists across sessions
- [ ] Switching models updates transport URL
- [ ] Full model ID passed to backend

### Backend Integration

- [ ] Anthropic models work with platform keys
- [ ] Anthropic models work with personal keys
- [ ] OpenAI models work with personal keys
- [ ] Google models work with personal keys
- [ ] Error handling for missing personal keys
- [ ] Error handling for invalid API keys
- [ ] Runtime context includes model selection
- [ ] Logs show correct model and provider

### Agent Configuration

- [ ] Anthropic adapter selected for Claude models
- [ ] OpenAI adapter selected for GPT models
- [ ] Google adapter selected for Gemini models
- [ ] Custom API keys passed correctly
- [ ] Platform keys work as fallback
- [ ] Fallback to default model on error

### Error Handling

- [ ] Invalid API key format rejected
- [ ] Missing required API key shows clear error
- [ ] Models.dev API failure handled gracefully
- [ ] Unknown provider handled with fallback
- [ ] Network errors show user-friendly messages

### UX

- [ ] Loading states provide clear feedback
- [ ] Can interact with one provider while another loads
- [ ] Console links have hover states
- [ ] Disabled models clearly show why
- [ ] Model details are readable and well-formatted
- [ ] Logos enhance provider recognition
- [ ] Grouping makes it clear what's always available

## Future Enhancements

### Models.dev Features

- **Real-time Updates:** Subscribe to models.dev changes for instant updates
- **Custom Filtering:** Allow users to filter by cost, context window, capabilities
- **Model Comparison:** Side-by-side comparison of models with recommendations
- **Cost Estimator:** Show estimated costs based on typical usage patterns
- **Model Changelog:** Track when new models are added or updated

### Provider Support

- **More Providers:** Add Cohere, Mistral, Together AI, Replicate
- **Provider Health:** Show API status and latency for each provider
- **Auto-Failover:** Automatically switch to backup provider on errors
- **Provider Preferences:** Let users set preferred provider order

### Advanced Features

- **Model Benchmarking:** Show performance metrics for different tasks
- **A/B Testing:** Compare responses from different models
- **Cost Optimization:** Automatically suggest cheaper alternatives
- **Usage Analytics:** Track which models users prefer and why
- **Smart Recommendations:** Suggest best model for current task

### Enterprise Features

- **Team Model Sharing:** Share model configurations across team
- **Cost Allocation:** Track costs per team member or project
- **Budget Limits:** Set spending limits per provider
- **Compliance:** Ensure certain models/providers for regulated data

## Summary

### Files Overview

**New Files (3):**

1. `src/lib/models-dev.ts` - Models.dev integration service
2. `src/app/api/v1/models/route.ts` - Models API endpoint
3. `migrations/0011_add_google_provider.sql` - Database migration

**Modified Files (10):**

1. `src/lib/model-selection/types.ts` - Update to use modelId
2. `src/lib/model-selection/hooks.ts` - Update validation logic
3. `src/lib/db/schema.ts` - Add google to enum
4. `src/components/model-selector-modal.tsx` - Multi-provider UI
5. `src/components/project-chat.tsx` - Use modelId in URL
6. `src/mastra/routes/codegen.ts` - Parse modelId param
7. `src/mastra/agents/codegenAgent.ts` - Multi-provider adapters
8. `src/mastra/lib/context.ts` - Update modelSelection type
9. `package.json` - Add OpenAI and Google AI SDK packages

**Existing Files (No Changes - From Cookie Persistence):**

1. `src/lib/cookies/index.ts`
2. `src/lib/model-selection/index.ts`
3. `src/lib/model-selection/cookie.ts`

### Key Integration Points

This plan seamlessly extends the cookie persistence implementation:

- **Types updated** in `lib/model-selection/types.ts` from `model: string` to `modelId: string`
- **Cookie persistence** automatically works with new structure (no changes needed)
- **Validation logic** in hooks updated to support multi-provider
- **Components** already using `useModelSelection` hook, just need to reference `.modelId` instead of `.model`

## Notes

### Implementation Priorities

1. **Phase 1 (MVP):** Update types, database updates, models.dev service, multi-provider UI
2. **Phase 2:** Per-provider loading states, console links, logos
3. **Phase 3:** Agent integration, testing, polish

### Security Considerations

- API keys remain encrypted at rest (existing encryption utilities)
- Keys never transmitted to client
- Server-side decryption only when needed
- Each provider's keys isolated (unique constraint)

### Performance

- Models.dev data cached for 24 hours
- Logos loaded with error handling/fallback
- API endpoints use database indexes
- Modal lazy-loads models on open

### User Experience

- Clear visual distinction between system and BYOK models
- Provider branding (logos) aids recognition
- Cost information helps informed decisions
- Console links reduce friction in getting API keys
- Per-provider loading states feel responsive

### Testing Strategy

- Unit tests for models.dev service
- Integration tests for API endpoints
- E2E tests for UI workflows
- Manual testing with real API keys from all three providers

### Documentation

- Update README with BYOK setup instructions
- Document supported models and providers
- Create troubleshooting guide for API key issues
- Add examples for each provider

### Deployment Considerations

- Ensure ENCRYPTION_KEY is set in production
- models.dev API should be reliable (has no rate limits mentioned)
- Monitor cache hit rates
- Log provider usage for analytics
- Add Sentry for error tracking across providers
