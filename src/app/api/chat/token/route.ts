import { stackServerApp } from "@/lib/stack/server";
import { AssistantCloud } from "@assistant-ui/react";
import { mainConfig } from "@/lib/config";

export const POST = async () => {
  const user = await stackServerApp.getUser({ or: "throw" });
  const assistantCloud = new AssistantCloud({
    apiKey: mainConfig.assistantUI.apiKey,
    userId: user.id,
    workspaceId: user.id,
  });
  const { token } = await assistantCloud.auth.tokens.create();
  return new Response(JSON.stringify({ token }), { status: 200 });
};
