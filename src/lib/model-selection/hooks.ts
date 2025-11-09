import { useState, useEffect, useCallback } from "react";
import type { ModelSelection } from "./types";
import { DEFAULT_MODEL_SELECTION } from "./types";
import {
  getModelSelectionOrDefault,
  saveModelSelectionToCookie,
} from "./cookie";

interface UseModelSelectionOptions {
  /**
   * Access token for validating personal API keys
   */
  accessToken?: string;
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
 * Hook for managing model selection with cookie persistence
 *
 * Features:
 * - Loads initial selection from cookie
 * - Automatically saves changes to cookie
 * - Validates personal provider has API key (optional)
 * - Falls back to platform provider if personal key missing
 */
export function useModelSelection(options: UseModelSelectionOptions = {}) {
  const { accessToken, validatePersonalProvider = true } = options;

  // Initialize with default, then load from cookie on client
  const [modelSelection, setModelSelection] = useState<ModelSelection>(
    DEFAULT_MODEL_SELECTION,
  );

  // Load from cookie on client mount
  useEffect(() => {
    setModelSelection(getModelSelectionOrDefault());
  }, []);

  // Validate personal provider after cookie is loaded
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
  }, [modelSelection, validatePersonalProvider, accessToken]); // Run when modelSelection changes (including after cookie load)

  // Update selection and save to cookie
  const updateModelSelection = useCallback((selection: ModelSelection) => {
    setModelSelection(selection);
    saveModelSelectionToCookie(selection);
  }, []);

  return {
    modelSelection,
    updateModelSelection,
    setModelSelection: updateModelSelection, // Alias for compatibility
  };
}
