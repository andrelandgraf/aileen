"use client";

import { AssistantRuntimeProvider } from "@assistant-ui/react";
import {
  useChatRuntime,
  AssistantChatTransport,
} from "@assistant-ui/react-ai-sdk";
import { Thread } from "@/components/assistant-ui/thread";
import { AssistantCloud } from "@assistant-ui/react";
import { ProfileButton } from "@/components/profile-button";
import { VersionsDropdown } from "@/components/versions-dropdown";
import {
  ProjectContextProvider,
  useProjectData,
} from "@/components/project-context";
import { useDevServerData } from "@/components/dev-server-context";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  ExternalLink,
  Rocket,
  Code2,
  ArrowLeft,
  MoreVertical,
  ChevronDown,
} from "lucide-react";
import { ModelSelectorModal } from "@/components/model-selector-modal";
import { useModelSelection } from "@/lib/model-selection/hooks";
import { useEffect, useState } from "react";
import { FreestyleDevServer } from "freestyle-sandboxes/react/dev-server";
import { requestDevServer } from "@/actions/preview-actions";
import Link from "next/link";
import {
  PanelGroup,
  Panel,
  PanelResizeHandle,
} from "react-resizable-panels";

interface ProjectChatProps {
  projectId: string;
  projectName: string;
  repoId: string;
  threadId: string;
  accessToken: string;
}

const ProjectChatContent = ({
  projectId,
  projectName,
  repoId,
  threadId,
  accessToken,
}: ProjectChatProps) => {
  const { currentVersionId } = useProjectData();
  const { devServerUrl, codeServerUrl, deploymentUrl } = useDevServerData();
  const [isDeploying, setIsDeploying] = useState(false);
  const [runtimeError, setRuntimeError] = useState<string | null>(null);
  const { modelSelection, updateModelSelection } = useModelSelection({
    accessToken,
    validatePersonalProvider: true,
  });
  const [isModelSelectorOpen, setIsModelSelectorOpen] = useState(false);

  // Wrap the action to include projectId
  const wrappedRequestDevServer = async (args: { repoId: string }) => {
    return await requestDevServer({ projectId });
  };

  const handleDeploy = async () => {
    setIsDeploying(true);
    try {
      const response = await fetch(`/api/v1/projects/${projectId}/deploy`, {
        method: "POST",
      });
      if (!response.ok) {
        throw new Error("Deployment failed");
      }
      console.log("Deployment triggered successfully");
    } catch (error) {
      console.error("Failed to deploy:", error);
    } finally {
      setIsDeploying(false);
    }
  };

  const cloud = new AssistantCloud({
    baseUrl: process.env.NEXT_PUBLIC_ASSISTANT_BASE_URL!,
    authToken: () =>
      fetch("/api/chat/token", { method: "POST" }).then((r) =>
        r.json().then((data: any) => data.token),
      ),
  });

  console.log(modelSelection.modelId, modelSelection.provider);
  const runtime = useChatRuntime({
    cloud,
    transport: new AssistantChatTransport({
      api: process.env.NEXT_PUBLIC_MASTRA_API_URL!,
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
      body: {
        projectId: projectId,
        modelId: modelSelection.modelId,
        keyProvider: modelSelection.provider,
      },
    }),
    onError: (error) => {
      console.error("Chat runtime error:", error.message);
      setRuntimeError(error.message);
    },
  });

  useEffect(() => {
    let switched = false;
    return runtime.threads.subscribe(() => {
      if (runtime.threads.getState().isLoading || switched) return;
      switched = true;
      if (runtime.threads.getState().threads.length === 0) return;
      runtime.threads.switchToThread(threadId);
    });
  }, [runtime, threadId]);

  const isThreadReady = runtime.threads.getState().mainThreadId === threadId;
  const isVersionReady = currentVersionId !== null;

  const getModelDisplayName = () => {
    const parts = modelSelection.modelId.split("/");
    if (parts.length > 1) {
      const modelPart = parts[1];
      return modelPart
        .replace(/-/g, " ")
        .replace(/\d{8}$/, "")
        .split(" ")
        .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
        .join(" ")
        .trim();
    }
    return modelSelection.modelId;
  };

  return (
    <AssistantRuntimeProvider runtime={runtime}>
      <ModelSelectorModal
        open={isModelSelectorOpen}
        onOpenChange={setIsModelSelectorOpen}
        accessToken={accessToken}
        selectedModel={modelSelection}
        onModelSelect={updateModelSelection}
      />
      <div className="flex h-dvh flex-col">
        <header className="flex items-center justify-between px-4 py-2 border-b">
          <div className="flex items-center gap-4">
            <Link
              href="/projects"
              className="flex items-center text-muted-foreground hover:text-foreground transition-colors"
            >
              <ArrowLeft className="h-5 w-5" />
            </Link>
            <h1 className="text-lg font-semibold">{projectName}</h1>
            <VersionsDropdown projectId={projectId} accessToken={accessToken} />
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setIsModelSelectorOpen(true)}
            >
              <span className="mr-2">{getModelDisplayName()}</span>
              <ChevronDown className="h-4 w-4" />
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm">
                  <span className="mr-2">Project Options</span>
                  <MoreVertical className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuLabel>Development</DropdownMenuLabel>
                <DropdownMenuGroup>
                  {devServerUrl && (
                    <DropdownMenuItem
                      onClick={() => window.open(devServerUrl, "_blank")}
                    >
                      <ExternalLink className="h-4 w-4 mr-2" />
                      <span>Open Dev Preview</span>
                    </DropdownMenuItem>
                  )}
                  {codeServerUrl && (
                    <DropdownMenuItem
                      onClick={() => window.open(codeServerUrl, "_blank")}
                    >
                      <Code2 className="h-4 w-4 mr-2" />
                      <span>View in VS Code</span>
                    </DropdownMenuItem>
                  )}
                </DropdownMenuGroup>
                <DropdownMenuSeparator />
                <DropdownMenuLabel>Production</DropdownMenuLabel>
                <DropdownMenuGroup>
                  {isVersionReady && (
                    <DropdownMenuItem
                      onClick={handleDeploy}
                      disabled={isDeploying}
                    >
                      <Rocket className="h-4 w-4 mr-2" />
                      <span>{isDeploying ? "Deploying..." : "Deploy"}</span>
                    </DropdownMenuItem>
                  )}
                  {isVersionReady && (
                    <DropdownMenuItem
                      onClick={() => window.open(deploymentUrl, "_blank")}
                    >
                      <ExternalLink className="h-4 w-4 mr-2" />
                      <span>View Live Site</span>
                    </DropdownMenuItem>
                  )}
                </DropdownMenuGroup>
              </DropdownMenuContent>
            </DropdownMenu>
            <ProfileButton />
          </div>
        </header>
        {runtimeError && (
          <div className="bg-red-50 border-b-2 border-red-500 px-6 py-4 dark:bg-red-950/50 dark:border-red-400">
            <div className="flex items-start gap-3">
              <div className="flex-1">
                <p className="text-base font-semibold text-red-900 dark:text-red-100">
                  Error
                </p>
                <p className="text-base text-red-900 dark:text-red-100 whitespace-pre-wrap mt-1">
                  {runtimeError}
                </p>
              </div>
              <button
                onClick={() => setRuntimeError(null)}
                className="text-red-700 hover:text-red-900 dark:text-red-300 dark:hover:text-red-100 transition-colors"
                aria-label="Dismiss error"
              >
                <span className="sr-only">Dismiss</span>
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="20"
                  height="20"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <line x1="18" y1="6" x2="6" y2="18"></line>
                  <line x1="6" y1="6" x2="18" y2="18"></line>
                </svg>
              </button>
            </div>
          </div>
        )}
        <PanelGroup direction="horizontal" className="flex-1 overflow-hidden">
          {/* Chat side */}
          <Panel defaultSize={50} minSize={30}>
            <div className="h-full overflow-hidden border-r">
              {isThreadReady && isVersionReady ? (
                <Thread />
              ) : (
                <div className="flex flex-col h-full p-4 gap-4">
                  <Skeleton className="h-12 w-full" />
                  <Skeleton className="h-20 w-3/4" />
                  <Skeleton className="h-20 w-2/3 self-end" />
                  <Skeleton className="h-20 w-3/4" />
                  <Skeleton className="h-20 w-2/3 self-end" />
                  <div className="flex-1" />
                  <Skeleton className="h-12 w-full" />
                </div>
              )}
            </div>
          </Panel>

          <PanelResizeHandle className="w-1 bg-border hover:bg-primary/50 transition-colors cursor-col-resize" />

          {/* Preview side */}
          <Panel defaultSize={50} minSize={30}>
            <div className="h-full overflow-hidden bg-muted">
              {isVersionReady ? (
                <FreestyleDevServer
                  actions={{ requestDevServer: wrappedRequestDevServer }}
                  repoId={repoId}
                />
              ) : (
                <div className="flex items-center justify-center h-full">
                  <div className="text-center space-y-2">
                    <div className="text-muted-foreground">
                      Initializing project...
                    </div>
                    <Skeleton className="h-4 w-48 mx-auto" />
                  </div>
                </div>
              )}
            </div>
          </Panel>
        </PanelGroup>
      </div>
    </AssistantRuntimeProvider>
  );
};

export const ProjectChat = (props: ProjectChatProps) => {
  return (
    <ProjectContextProvider
      projectId={props.projectId}
      accessToken={props.accessToken}
    >
      <ProjectChatContent {...props} />
    </ProjectContextProvider>
  );
};
