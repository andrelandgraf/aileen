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
import { Trash2 } from "lucide-react";

export type ModelSelection =
  | { provider: "platform"; model: "claude-3-5-haiku-20241022" }
  | { provider: "personal"; model: "claude-3-5-haiku-20241022" };

type AIProvider = "anthropic" | "openai" | "openrouter";

interface KeyStatus {
  provider: AIProvider;
  hasKey: boolean;
}

interface ModelSelectorModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  accessToken: string;
  selectedModel: ModelSelection;
  onModelSelect: (model: ModelSelection) => void;
}

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
  const [selectedModelOption, setSelectedModelOption] = useState<string>(
    `${selectedModel.provider}-haiku`,
  );
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [justSavedKey, setJustSavedKey] = useState<AIProvider | null>(null);

  // Fetch key status on mount and reset state when modal opens
  useEffect(() => {
    if (open) {
      // Reset state when modal opens
      setJustSavedKey(null);
      setError(null);
      setApiKeyInputs(new Map());
      checkKeyStatus();
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

  const handleSaveKey = async (provider: AIProvider) => {
    const apiKey = apiKeyInputs.get(provider);
    if (!apiKey?.trim()) {
      setError("Please enter an API key");
      return;
    }

    setIsLoading(true);
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
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save API key");
    } finally {
      setIsLoading(false);
    }
  };

  const handleDeleteKey = async (provider: AIProvider) => {
    setIsLoading(true);
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

      // If currently using personal key for this provider, switch to platform key
      if (
        selectedModel.provider === "personal" &&
        provider === "anthropic" // Only Anthropic for now
      ) {
        const newSelection: ModelSelection = {
          provider: "platform",
          model: "claude-3-5-haiku-20241022",
        };
        onModelSelect(newSelection);
        setSelectedModelOption("platform-haiku");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete API key");
    } finally {
      setIsLoading(false);
    }
  };

  const handleApplyModelSelection = () => {
    const [provider, model] = selectedModelOption.split("-");

    const newSelection: ModelSelection = {
      provider: provider as "platform" | "personal",
      model: "claude-3-5-haiku-20241022",
    };

    onModelSelect(newSelection);

    // Close modal
    onOpenChange(false);
  };

  const renderKeyInput = (
    provider: AIProvider,
    label: string,
    placeholder: string,
  ) => {
    const hasKey = keyStatuses.get(provider) || false;
    const inputValue = apiKeyInputs.get(provider) || "";
    const showSavedMessage = justSavedKey === provider;

    return (
      <div key={provider} className="space-y-2">
        <Label htmlFor={`${provider}-key`}>{label}</Label>
        <div className="flex gap-2">
          <div className="flex-1">
            <Input
              id={`${provider}-key`}
              type="password"
              placeholder={placeholder}
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
              <Trash2 className="h-4 w-4" />
            </Button>
          )}
        </div>
        {!hasKey && inputValue && (
          <Button
            onClick={() => handleSaveKey(provider)}
            disabled={isLoading}
            size="sm"
          >
            {isLoading ? "Saving..." : "Save Key"}
          </Button>
        )}
      </div>
    );
  };

  const hasPersonalKey = keyStatuses.get("anthropic") || false;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Model Settings</DialogTitle>
        </DialogHeader>

        <Tabs defaultValue="api-keys" className="w-full">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="api-keys">API Keys</TabsTrigger>
            <TabsTrigger value="model-selection">Model Selection</TabsTrigger>
          </TabsList>

          <TabsContent value="api-keys" className="space-y-4">
            <div className="space-y-4">
              {renderKeyInput("anthropic", "Anthropic API Key", "sk-ant-...")}

              {error && (
                <Alert variant="destructive">
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}
            </div>
          </TabsContent>

          <TabsContent value="model-selection" className="space-y-4">
            <div className="space-y-4">
              <Label>Select Model:</Label>

              <RadioGroup
                value={selectedModelOption}
                onValueChange={setSelectedModelOption}
              >
                <div className="flex items-start space-x-2">
                  <RadioGroupItem value="platform-haiku" id="platform-haiku" />
                  <div className="space-y-1">
                    <Label htmlFor="platform-haiku" className="cursor-pointer">
                      Haiku (platform key)
                    </Label>
                    <p className="text-sm text-muted-foreground">
                      Always available
                    </p>
                  </div>
                </div>

                <div className="flex items-start space-x-2">
                  <RadioGroupItem
                    value="personal-haiku"
                    id="personal-haiku"
                    disabled={!hasPersonalKey}
                  />
                  <div className="space-y-1">
                    <Label
                      htmlFor="personal-haiku"
                      className={
                        hasPersonalKey ? "cursor-pointer" : "opacity-50"
                      }
                    >
                      Haiku (personal key)
                    </Label>
                    <p className="text-sm text-muted-foreground">
                      {hasPersonalKey
                        ? "Using your Anthropic API key"
                        : "Requires your Anthropic API key"}
                    </p>
                  </div>
                </div>
              </RadioGroup>

              <div className="flex gap-2 pt-4">
                <Button onClick={handleApplyModelSelection}>Apply</Button>
                <Button variant="outline" onClick={() => onOpenChange(false)}>
                  Cancel
                </Button>
              </div>
            </div>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
