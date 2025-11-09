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
import type { ModelSelection } from "@/lib/model-selection/types";

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

  const renderModelOption = (
    model: NormalizedModel,
    type: "platform" | "personal",
  ) => {
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
              className={
                isDisabled ? "opacity-50" : "cursor-pointer font-medium"
              }
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
                          <h3 className="font-semibold text-sm">
                            System Models
                          </h3>
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
                            <h3 className="font-semibold text-sm">
                              Your Models
                            </h3>
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
