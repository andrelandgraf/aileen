"use server";

import { AssistantCloud } from "@assistant-ui/react";
import invariant from "tiny-invariant";
import { mainConfig } from "./config";

export async function createAssistantThread(
  userId: string,
  projectName: string,
): Promise<string> {
  console.log("[AssistantCloud] Creating thread for project:", projectName);

  const assistantCloud = new AssistantCloud({
    apiKey: mainConfig.assistantUI.apiKey,
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

export async function deleteAssistantThread(
  userId: string,
  threadId: string,
): Promise<void> {
  console.log("[AssistantCloud] Deleting thread:", threadId);

  const assistantCloud = new AssistantCloud({
    apiKey: mainConfig.assistantUI.apiKey,
    userId: userId,
    workspaceId: userId,
  });

  invariant(assistantCloud, "AssistantCloud not initialized");

  await assistantCloud.threads.delete(threadId);

  console.log("[AssistantCloud] Thread deleted successfully");
}
