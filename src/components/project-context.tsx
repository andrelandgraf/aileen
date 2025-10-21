"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  ReactNode,
} from "react";
import { ProjectVersion } from "@/lib/db/schema";

interface ProjectData {
  versions: ProjectVersion[];
  currentVersionId: string | null;
  isLoading: boolean;
}

interface ProjectContextValue extends ProjectData {
  refreshVersions: () => Promise<void>;
}

const ProjectContext = createContext<ProjectContextValue | null>(null);

interface ProjectContextProviderProps {
  projectId: string;
  accessToken: string;
  children: ReactNode;
}

export function ProjectContextProvider({
  projectId,
  accessToken,
  children,
}: ProjectContextProviderProps) {
  const [versions, setVersions] = useState<ProjectVersion[]>([]);
  const [currentVersionId, setCurrentVersionId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const fetchVersions = useCallback(async () => {
    try {
      if (isLoading) {
        // Only show loading state on initial fetch
        setIsLoading(true);
      }

      const response = await fetch(`/api/v1/projects/${projectId}/versions`, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });

      if (!response.ok) {
        throw new Error("Failed to fetch versions");
      }

      const data = await response.json();
      setVersions(data.versions || []);
      setCurrentVersionId(data.currentDevVersionId || null);
    } catch (error) {
      console.error("[ProjectContext] Error fetching versions:", error);
    } finally {
      setIsLoading(false);
    }
  }, [projectId, accessToken, isLoading]);

  // Initial fetch and polling every 5 seconds
  useEffect(() => {
    fetchVersions();

    const interval = setInterval(() => {
      fetchVersions();
    }, 5000);

    return () => clearInterval(interval);
  }, [fetchVersions]);

  const value: ProjectContextValue = {
    versions,
    currentVersionId,
    isLoading,
    refreshVersions: fetchVersions,
  };

  return (
    <ProjectContext.Provider value={value}>{children}</ProjectContext.Provider>
  );
}

export function useProjectData(): ProjectContextValue {
  const context = useContext(ProjectContext);
  if (!context) {
    throw new Error(
      "useProjectData must be used within a ProjectContextProvider",
    );
  }
  return context;
}
