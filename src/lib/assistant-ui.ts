"use server";

import { AssistantCloud } from "@assistant-ui/react";
import invariant from "tiny-invariant";

export async function createAssistantThread(
  userId: string,
  projectName: string,
): Promise<string> {
  console.log("[AssistantCloud] Creating thread for project:", projectName);

  const assistantCloud = new AssistantCloud({
    apiKey: process.env.ASSISTANT_API_KEY!,
    userId: userId,
    workspaceId: userId,
  });

  invariant(assistantCloud, "AssistantCloud not initialized");

  const { thread_id: threadId } = await assistantCloud.threads.create({
    last_message_at: new Date(),
    metadata: {
      projectName,
    },
  });

  console.log("[AssistantCloud] Thread created:", threadId);

  return threadId;
}
