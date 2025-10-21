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
import { ExternalLink, Rocket, Code2, ArrowLeft } from "lucide-react";
import { useEffect, useState } from "react";
import { FreestyleDevServer } from "freestyle-sandboxes/react/dev-server";
import { requestDevServer } from "@/actions/preview-actions";
import Link from "next/link";

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
      // Show success message (you could add a toast here)
      console.log("Deployment triggered successfully");
    } catch (error) {
      console.error("Failed to deploy:", error);
      // Show error message (you could add a toast here)
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

  const runtime = useChatRuntime({
    cloud,
    transport: new AssistantChatTransport({
      api: `${process.env.NEXT_PUBLIC_MASTRA_API_URL}?projectId=${projectId}`,
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    }),
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

  return (
    <AssistantRuntimeProvider runtime={runtime}>
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
            {codeServerUrl && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => window.open(codeServerUrl, "_blank")}
              >
                <Code2 className="h-4 w-4 mr-2" />
                View Code
              </Button>
            )}
            {devServerUrl && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => window.open(devServerUrl, "_blank")}
              >
                <ExternalLink className="h-4 w-4 mr-2" />
                Open Dev Preview
              </Button>
            )}
            <Button
              variant="outline"
              size="sm"
              onClick={() => window.open(deploymentUrl, "_blank")}
            >
              <ExternalLink className="h-4 w-4 mr-2" />
              View Live Site
            </Button>
            <Button
              size="sm"
              onClick={handleDeploy}
              disabled={isDeploying || !isVersionReady}
            >
              <Rocket className="h-4 w-4 mr-2" />
              {isDeploying ? "Deploying..." : "Deploy"}
            </Button>
            <ProfileButton />
          </div>
        </header>
        <div className="flex flex-1 overflow-hidden">
          {/* Chat side */}
          <div className="flex-1 overflow-hidden border-r">
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
          {/* Preview side */}
          <div className="flex-1 overflow-hidden bg-muted">
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
        </div>
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
