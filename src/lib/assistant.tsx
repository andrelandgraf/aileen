"use client";

import { AssistantRuntimeProvider } from "@assistant-ui/react";
import {
  AssistantChatTransport,
  useChatRuntime,
} from "@assistant-ui/react-ai-sdk";
import { Thread } from "@/components/assistant-ui/thread";
import { ThreadList } from "@/components/assistant-ui/thread-list";
import { AssistantCloud } from "@assistant-ui/react";
import { ProfileButton } from "@/components/profile-button";

export const Assistant = () => {
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
      api: "/my-custom-api/chat", // Custom API URL with forwarding
    }),
  });

  return (
    <AssistantRuntimeProvider runtime={runtime}>
      <div className="flex h-dvh flex-col">
        <header className="flex items-center justify-end px-4 py-2 border-b">
          <ProfileButton />
        </header>
        <div className="grid flex-1 grid-cols-[200px_1fr] gap-x-2 px-4 py-4 overflow-hidden">
          <ThreadList />
          <Thread />
        </div>
      </div>
    </AssistantRuntimeProvider>
  );
};
