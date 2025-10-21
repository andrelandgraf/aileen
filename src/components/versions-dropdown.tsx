"use client";

import { useState } from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { History, Loader2 } from "lucide-react";
import { useProjectData } from "@/components/project-context";

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
        disabled={isRestoring}
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
              <div className="flex flex-col gap-1">
                <span className="font-medium text-sm">
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
    </div>
  );
}
