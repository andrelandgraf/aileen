import { stackServerApp } from "@/lib/stack/server";
import { AssistantCloud } from "@assistant-ui/react";

export const POST = async () => {
  const user = await stackServerApp.getUser({ or: "throw" });
  const assistantCloud = new AssistantCloud({
    apiKey: process.env.ASSISTANT_API_KEY!,
    userId: user.id,
    workspaceId: user.id,
  });
  const { token } = await assistantCloud.auth.tokens.create();
  return new Response(JSON.stringify({ token }), { status: 200 });
};
