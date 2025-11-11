import { useState, useEffect, useCallback } from "react";
import type { ModelSelection } from "./types";
import { DEFAULT_MODEL_SELECTION } from "./types";
import { saveModelSelectionToCookie } from "./cookie";

interface UseModelSelectionOptions {
  /**
   * Initial model selection from server-side cookie
   */
  initialSelection: ModelSelection;
  /**
   * Access token for API calls
   */
  accessToken: string;
  /**
   * Whether to validate personal provider on mount
   */
  validatePersonalProvider?: boolean;
}

interface KeyStatus {
  provider: string;
  hasKey: boolean;
}

/**
 * Hook for managing model selection with server-side cookie persistence
 *
 * Features:
 * - Receives initial selection from server (no client-side cookie reading)
 * - Saves changes via API endpoint (server sets cookie)
 * - Validates personal provider has API key (optional)
 * - Falls back to platform provider if personal key missing
 */
export function useModelSelection(options: UseModelSelectionOptions) {
  const {
    initialSelection,
    accessToken,
    validatePersonalProvider = true,
  } = options;

  // Initialize with value from server (no hydration mismatch)
  const [modelSelection, setModelSelection] =
    useState<ModelSelection>(initialSelection);

  // Validate personal provider on mount
  useEffect(() => {
    if (!validatePersonalProvider) return;
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
          await updateModelSelection(DEFAULT_MODEL_SELECTION);
        }
      } catch (error) {
        console.error("Failed to validate personal provider:", error);
        // On error, fall back to platform for safety
        await updateModelSelection(DEFAULT_MODEL_SELECTION);
      }
    };

    validateKey();
    // Only run on mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Update selection and save to cookie via API
  const updateModelSelection = useCallback(
    async (selection: ModelSelection) => {
      try {
        // Optimistically update UI
        setModelSelection(selection);

        // Persist to server (auth handled by Stack Auth cookie)
        await saveModelSelectionToCookie(selection);
      } catch (error) {
        console.error("Failed to save model selection:", error);
        // Revert on error
        setModelSelection(modelSelection);
        throw error;
      }
    },
    [modelSelection],
  );

  return {
    modelSelection,
    updateModelSelection,
    setModelSelection: updateModelSelection, // Alias for compatibility
  };
}
