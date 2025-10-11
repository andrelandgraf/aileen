"use client";

import { AssistantRuntimeProvider } from "@assistant-ui/react";
import {
  useChatRuntime,
  AssistantChatTransport,
} from "@assistant-ui/react-ai-sdk";
import { Thread } from "@/components/assistant-ui/thread";
import { AssistantCloud } from "@assistant-ui/react";
import { ProfileButton } from "@/components/profile-button";

interface ProjectChatProps {
  projectId: string;
  projectName: string;
  repoId: string;
  previewUrl: string;
}

export const ProjectChat = ({
  projectId,
  projectName,
  repoId,
  previewUrl,
}: ProjectChatProps) => {
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
      api: `/api/projects/${projectId}/chat`,
    }),
  });

  return (
    <AssistantRuntimeProvider runtime={runtime}>
      <div className="flex h-dvh flex-col">
        <header className="flex items-center justify-between px-4 py-2 border-b">
          <div className="flex items-center gap-4">
            <h1 className="text-lg font-semibold">{projectName}</h1>
          </div>
          <ProfileButton />
        </header>
        <div className="flex flex-1 overflow-hidden">
          {/* Chat side */}
          <div className="flex-1 overflow-hidden border-r">
            <Thread />
          </div>
          {/* Preview iframe side */}
          <div className="flex-1 overflow-hidden bg-muted">
            <iframe
              src={previewUrl}
              className="h-full w-full border-0"
              title="Preview"
              sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-modals"
            />
          </div>
        </div>
      </div>
    </AssistantRuntimeProvider>
  );
};
