"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useDevServerData } from "@/components/dev-server-context";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@/components/ui/empty";
import { Spinner } from "@/components/ui/spinner";
import { RotateCcw } from "lucide-react";

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
    const logElement = logContainerRef.current;
    if (!logElement) {
      return;
    }

    const scrollParent = logElement.parentElement;
    if (scrollParent) {
      scrollParent.scrollTop = scrollParent.scrollHeight;
    }
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

  const isFetching = isLoading || isRefreshing;

  return (
    <Card className="flex h-full flex-col gap-0">
      <CardHeader className="flex flex-row items-start justify-between gap-3 pb-0">
        <div className="flex-1 space-y-1">
          <CardTitle className="text-base font-medium">Latest logs</CardTitle>
          {statusMessage && <CardDescription>{statusMessage}</CardDescription>}
        </div>
        <CardAction className="mt-0">
          <Button
            variant="outline"
            size="sm"
            className="gap-2"
            onClick={fetchLogs}
            disabled={isFetching}
          >
            {isFetching ? (
              <Spinner className="size-4" />
            ) : (
              <RotateCcw className="size-4" />
            )}
            <span>{isFetching ? "Refreshing" : "Refresh"}</span>
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent className="flex flex-1 flex-col px-6 pb-6 pt-4">
        {isLoading && !hasFetchedRef.current ? (
          <div className="flex flex-1 items-center justify-center gap-2 text-sm text-muted-foreground">
            <Spinner className="size-4" />
            <span>Loading logs…</span>
          </div>
        ) : error ? (
          <div className="flex flex-1 flex-col justify-center">
            <Alert variant="destructive">
              <AlertTitle>Failed to load dev server logs</AlertTitle>
              <AlertDescription className="flex flex-col gap-3">
                <p>{error}</p>
                <Button size="sm" variant="outline" onClick={fetchLogs}>
                  Try again
                </Button>
              </AlertDescription>
            </Alert>
          </div>
        ) : logs.trim().length === 0 ? (
          <Empty className="min-h-0 flex-1 border border-dashed border-border/60 bg-muted/30">
            <EmptyHeader>
              <EmptyTitle>No logs yet</EmptyTitle>
              <EmptyDescription>
                We’ll show output from the dev server as soon as it’s available.
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <ScrollArea className="h-full rounded-lg border bg-background">
            <div
              ref={logContainerRef}
              className="whitespace-pre-wrap break-words px-4 py-3 font-mono text-sm leading-relaxed text-foreground"
            >
              {logs}
            </div>
          </ScrollArea>
        )}
      </CardContent>
    </Card>
  );
}
