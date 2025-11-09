"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useDevServerData } from "@/components/dev-server-context";
import { Button } from "@/components/ui/button";
import { Loader2, RotateCcw } from "lucide-react";

interface DevServerLogsProps {
  projectId: string;
  isActive: boolean;
  pollIntervalMs?: number;
}

const DEFAULT_POLL_INTERVAL_MS = 10_000;

export function DevServerLogs({
  projectId,
  isActive,
  pollIntervalMs = DEFAULT_POLL_INTERVAL_MS,
}: DevServerLogsProps) {
  const {
    devServerUrl,
    devCommandRunning,
    installCommandRunning,
    isLoading: isDevServerStatusesLoading,
  } = useDevServerData();

  const [logs, setLogs] = useState<string>("");
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const hasFetchedRef = useRef(false);
  const abortControllerRef = useRef<AbortController | null>(null);
  const logContainerRef = useRef<HTMLDivElement | null>(null);

  const fetchLogs = useCallback(async () => {
    if (!projectId) {
      return;
    }

    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    const controller = new AbortController();
    abortControllerRef.current = controller;

    if (!hasFetchedRef.current) {
      setIsLoading(true);
    } else {
      setIsRefreshing(true);
    }

    try {
      setError(null);

      const response = await fetch("/api/v1/dev-servers/logs", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ projectId }),
        cache: "no-store",
        signal: controller.signal,
      });

      if (!response.ok) {
        const message = await response.text();
        throw new Error(message || "Request failed");
      }

      const data: unknown = await response.json();
      if (
        !data ||
        typeof data !== "object" ||
        typeof (data as { logs?: unknown }).logs !== "string"
      ) {
        throw new Error("Unexpected response from server");
      }

      setLogs((data as { logs: string }).logs);
      hasFetchedRef.current = true;
    } catch (fetchError) {
      if (controller.signal.aborted) {
        return;
      }

      console.error("[DevServerLogs] Failed to fetch logs:", fetchError);
      setError("Unable to load dev server logs right now.");
    } finally {
      if (!controller.signal.aborted) {
        setIsLoading(false);
        setIsRefreshing(false);
      }
    }
  }, [projectId]);

  useEffect(() => {
    if (!isActive) {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }

      setIsRefreshing(false);
      return;
    }

    fetchLogs();

    const interval = window.setInterval(() => {
      fetchLogs();
    }, pollIntervalMs);

    return () => {
      window.clearInterval(interval);
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, [fetchLogs, isActive, pollIntervalMs]);

  useEffect(() => {
    if (!logContainerRef.current) {
      return;
    }

    logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
  }, [logs]);

  useEffect(() => {
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, []);

  const statusMessage = (() => {
    if (isDevServerStatusesLoading) {
      return "Checking dev server status…";
    }

    if (!devServerUrl && !devCommandRunning && !installCommandRunning) {
      return "Dev server is not running yet. Start it to see logs.";
    }

    if (devCommandRunning || installCommandRunning) {
      return "Dev server is starting. Logs update automatically.";
    }

    return null;
  })();

  return (
    <div className="flex h-full flex-col gap-3">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium text-foreground">Latest logs</p>
          {statusMessage && (
            <p className="text-xs text-muted-foreground">{statusMessage}</p>
          )}
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={fetchLogs}
          disabled={isLoading || isRefreshing}
        >
          {isRefreshing ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <RotateCcw className="size-4" />
          )}
          <span className="sr-only">Refresh logs</span>
        </Button>
      </div>

      <div className="flex-1 overflow-hidden rounded-lg border bg-background">
        {isLoading && !hasFetchedRef.current ? (
          <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
            Loading logs…
          </div>
        ) : error ? (
          <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center">
            <p className="text-sm text-muted-foreground">{error}</p>
            <Button size="sm" onClick={fetchLogs}>
              Try again
            </Button>
          </div>
        ) : (
          <div
            ref={logContainerRef}
            className="h-full overflow-auto p-4 font-mono text-sm leading-relaxed"
          >
            {logs.trim().length > 0 ? (
              <pre className="whitespace-pre-wrap break-words text-foreground">
                {logs}
              </pre>
            ) : (
              <div className="h-full w-full text-sm text-muted-foreground">
                No logs available yet.
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
