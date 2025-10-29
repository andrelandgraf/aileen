"use client";

import { useState, useEffect } from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { History, Loader2 } from "lucide-react";
import { useProjectData } from "@/components/project-context";
import { useThreadRuntime } from "@assistant-ui/react";

interface VersionsDropdownProps {
  projectId: string;
  accessToken: string;
}

export function VersionsDropdown({
  projectId,
  accessToken,
}: VersionsDropdownProps) {
  const { versions, currentVersionId, refreshVersions } = useProjectData();
  const [isRestoring, setIsRestoring] = useState(false);
  const [isCreatingCheckpoint, setIsCreatingCheckpoint] = useState(false);
  const [latestVersionIdBeforeCheckpoint, setLatestVersionIdBeforeCheckpoint] =
    useState<string | null>(null);
  const threadRuntime = useThreadRuntime();

  const handleVersionChange = async (versionId: string) => {
    if (versionId === currentVersionId) return;

    try {
      setIsRestoring(true);
      console.log("[Versions] Restoring version:", versionId);

      const response = await fetch(`/api/v1/projects/${projectId}/versions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ versionId }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.details || "Failed to restore version");
      }

      const data = await response.json();
      console.log("[Versions] Version restored successfully:", data);

      // Refresh the page to load the restored version
      window.location.reload();
    } catch (error) {
      console.error("[Versions] Error restoring version:", error);
      alert(
        `Failed to restore version: ${error instanceof Error ? error.message : String(error)}`,
      );
    } finally {
      setIsRestoring(false);
    }
  };

  const handleCreateCheckpoint = async () => {
    try {
      // Remember the current latest version before creating checkpoint
      const currentLatestVersion = versions[0];
      if (currentLatestVersion) {
        setLatestVersionIdBeforeCheckpoint(currentLatestVersion.id);
      }
      setIsCreatingCheckpoint(true);
      console.log("[Versions] Creating checkpoint...");

      // Get the latest assistant message ID from the thread
      const messages = threadRuntime.getState().messages;
      const latestAssistantMessage = messages
        .slice()
        .reverse()
        .find((msg) => msg.role === "assistant");

      console.log(
        "[Versions] Latest assistant message ID:",
        latestAssistantMessage?.id,
      );

      const response = await fetch(`/api/v1/projects/${projectId}/checkpoint`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          assistantMessageId: latestAssistantMessage?.id || null,
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.details || "Failed to start checkpoint creation");
      }

      console.log("[Versions] Checkpoint creation started in background");
      // Note: Don't call setIsCreatingCheckpoint(false) here
      // We'll wait for the new version to appear through polling
    } catch (error) {
      console.error("[Versions] Error creating checkpoint:", error);
      alert(
        `Failed to create checkpoint: ${error instanceof Error ? error.message : String(error)}`,
      );
      setIsCreatingCheckpoint(false);
      setLatestVersionIdBeforeCheckpoint(null);
    }
  };

  // Effect to detect when a new version appears after checkpoint creation
  useEffect(() => {
    const latestVersion = versions[0];
    if (
      isCreatingCheckpoint &&
      latestVersionIdBeforeCheckpoint &&
      latestVersion &&
      latestVersion.id !== latestVersionIdBeforeCheckpoint
    ) {
      console.log(
        "[Versions] New checkpoint version detected:",
        latestVersion.id,
      );
      setIsCreatingCheckpoint(false);
      setLatestVersionIdBeforeCheckpoint(null);
    }
  }, [versions, isCreatingCheckpoint, latestVersionIdBeforeCheckpoint]);

  // Show "Initializing first version" if no current version exists yet
  if (currentVersionId === null) {
    return (
      <div className="flex items-center gap-2">
        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
        <span className="text-sm text-muted-foreground">
          Initializing first version...
        </span>
      </div>
    );
  }

  if (versions.length === 0) {
    return null;
  }

  const formatDate = (date: Date) => {
    const month = date.getMonth() + 1;
    const day = date.getDate();
    const hours = date.getHours();
    const minutes = date.getMinutes().toString().padStart(2, "0");
    return `${month}/${day} ${hours}:${minutes}`;
  };

  const truncateSummary = (summary: string, maxLength: number = 20) => {
    if (summary.length <= maxLength) return summary;
    return summary.substring(0, maxLength) + "...";
  };

  const selectedVersion = versions.find((v) => v.id === currentVersionId);

  return (
    <div className="flex items-center gap-2">
      <History className="h-4 w-4 text-muted-foreground" />
      <Select
        value={currentVersionId}
        onValueChange={handleVersionChange}
        disabled={isRestoring || isCreatingCheckpoint}
      >
        <SelectTrigger className="w-[180px]">
          {isRestoring ? (
            <div className="flex items-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin" />
              <span>Restoring...</span>
            </div>
          ) : selectedVersion ? (
            <div className="flex items-center gap-2 text-sm truncate">
              <span className="truncate">
                {truncateSummary(selectedVersion.summary, 15)}
              </span>
              <span className="text-xs text-muted-foreground whitespace-nowrap">
                {formatDate(new Date(selectedVersion.createdAt))}
              </span>
            </div>
          ) : (
            <SelectValue placeholder="Select version" />
          )}
        </SelectTrigger>
        <SelectContent>
          {versions.map((version, index) => (
            <SelectItem key={version.id} value={version.id}>
              <div className="flex flex-col gap-1 max-w-[300px]">
                <span
                  className="font-medium text-sm truncate"
                  title={`${index === 0 ? "Latest: " : ""}${version.summary}`}
                >
                  {index === 0 ? "Latest: " : ""}
                  {version.summary}
                </span>
                <span className="text-xs text-muted-foreground">
                  {formatDate(new Date(version.createdAt))}
                </span>
              </div>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Button
        variant="outline"
        size="sm"
        onClick={handleCreateCheckpoint}
        disabled={isRestoring || isCreatingCheckpoint}
        title="Create a manual checkpoint of the current state"
      >
        {isCreatingCheckpoint ? (
          <>
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            <span>Creating...</span>
          </>
        ) : (
          <span>Create checkpoint</span>
        )}
      </Button>
    </div>
  );
}
