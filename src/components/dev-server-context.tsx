"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  ReactNode,
} from "react";
import { getDevServerUrls } from "@/actions/preview-actions";

interface DevServerData {
  devServerUrl: string | null;
  codeServerUrl: string | null;
  deploymentUrl: string;
  devCommandRunning: boolean;
  installCommandRunning: boolean;
  isLoading: boolean;
}

interface DevServerContextValue extends DevServerData {
  refreshUrls: () => Promise<void>;
}

const DevServerContext = createContext<DevServerContextValue | null>(null);

interface DevServerContextProviderProps {
  projectId: string;
  shouldFetch: boolean;
  children: ReactNode;
}

export function DevServerContextProvider({
  projectId,
  shouldFetch,
  children,
}: DevServerContextProviderProps) {
  const [devServerUrl, setDevServerUrl] = useState<string | null>(null);
  const [codeServerUrl, setCodeServerUrl] = useState<string | null>(null);
  const [deploymentUrl, setDeploymentUrl] = useState<string>("");
  const [devCommandRunning, setDevCommandRunning] = useState(false);
  const [installCommandRunning, setInstallCommandRunning] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  const fetchUrls = useCallback(async () => {
    // Don't fetch if shouldFetch is false
    if (!shouldFetch) {
      return;
    }

    try {
      const wasInitialLoad = isLoading;
      if (wasInitialLoad) {
        // Only show loading state on initial fetch
        setIsLoading(true);
      }

      const data = await getDevServerUrls({ projectId });

      setDevServerUrl(data.devServerUrl);
      setCodeServerUrl(data.codeServerUrl);
      setDeploymentUrl(data.deploymentUrl);
      setDevCommandRunning(data.devCommandRunning);
      setInstallCommandRunning(data.installCommandRunning);
    } catch (error) {
      console.error("[DevServerContext] Error fetching URLs:", error);
    } finally {
      setIsLoading(false);
    }
  }, [projectId, shouldFetch, isLoading]);

  // Initial fetch and polling every 30 seconds
  useEffect(() => {
    // Only start fetching if shouldFetch is true
    if (!shouldFetch) {
      return;
    }

    fetchUrls();

    const interval = setInterval(() => {
      fetchUrls();
    }, 30000); // 30 seconds

    return () => clearInterval(interval);
  }, [fetchUrls, shouldFetch]);

  const value: DevServerContextValue = {
    devServerUrl,
    codeServerUrl,
    deploymentUrl,
    devCommandRunning,
    installCommandRunning,
    isLoading,
    refreshUrls: fetchUrls,
  };

  return (
    <DevServerContext.Provider value={value}>
      {children}
    </DevServerContext.Provider>
  );
}

export function useDevServerData(): DevServerContextValue {
  const context = useContext(DevServerContext);
  if (!context) {
    throw new Error(
      "useDevServerData must be used within a DevServerContextProvider",
    );
  }
  return context;
}
