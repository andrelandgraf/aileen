import { getUser } from "./stackauth";
import { db } from "@/lib/db/db";
import { projectSecretsTable, projectsTable } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import type { Context, Next } from "hono";
import type { UserContext, ModelSelectionContext } from "./context";
import { getDecryptedApiKey } from "@/app/api/v1/user/ai-keys/route";
import { decrypt } from "@/lib/encryption";

export async function auth(c: Context, next: Next) {
  try {
    // Get RuntimeContext and populate with project and user data
    const runtimeContext = c.get("runtimeContext");
    if (runtimeContext.get("project") && runtimeContext.get("user")) {
      console.log("[Mastra Auth] RuntimeContext already populated");
      return await next();
    }

    const authHeader = c.req.header("authorization");
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      console.error("[Mastra Auth] No authorization header found");
      return c.json({ error: "Unauthorized" }, 401);
    }

    const accessToken = authHeader.split(" ")[1];
    if (!accessToken) {
      console.error("[Mastra Auth] No access token found");
      return c.json({ error: "Unauthorized" }, 401);
    }

    const user = await getUser(accessToken);
    if (!user) {
      console.error("[Mastra Auth] Failed to authenticate user");
      return c.json({ error: "Unauthorized" }, 401);
    }

    console.log("[Mastra Auth] User authenticated:", user.id);

    // Extract data from the request body
    const request = c.req.raw.clone();
    const body = await request.json();
    console.log("[Mastra Auth] Body:", body);

    const projectId = body.projectId;
    if (!projectId) {
      console.error("[Mastra Auth] No projectId provided in body");
      return c.json({ error: "Missing projectId" }, 400);
    }

    console.log("[Mastra Auth] Checking project access:", projectId);

    const [project] = await db
      .select()
      .from(projectsTable)
      .where(
        and(eq(projectsTable.id, projectId), eq(projectsTable.userId, user.id)),
      )
      .limit(1);

    if (!project) {
      console.error(
        "[Mastra Auth] Project not found or user doesn't have access",
      );
      return c.json({ error: "Forbidden" }, 403);
    }

    console.log("[Mastra Auth] Project access verified:", project.name);

    // Set project (all fields from database)
    runtimeContext.set("project", project);

    // Set user context
    const userContext: UserContext = {
      userId: user.id,
      displayName: user.displayName || null,
    };
    runtimeContext.set("user", userContext);

    console.log(
      "[Mastra Auth] RuntimeContext populated with project and user data",
    );

    // Get the last message ID (the user's current message)
    const messages = body.messages as Array<{ id: string; role: string }>;
    const lastMessage = messages?.[messages.length - 1];
    const assistantMessageId = lastMessage?.id;
    if (!assistantMessageId) {
      console.error("[Mastra Auth] No message ID found in request");
      return c.json({ error: "Missing message ID" }, 400);
    }
    console.log("[Mastra Auth] Assistant message ID:", assistantMessageId);
    runtimeContext.set("assistantMessageId", assistantMessageId);

    if (!project.currentDevVersionId) {
      console.error("[Mastra Auth] No current dev version ID found");
      return c.json({ error: "No current dev version ID found" }, 400);
    }

    const [currentDevSecrets] = await db
      .select()
      .from(projectSecretsTable)
      .where(
        eq(projectSecretsTable.projectVersionId, project.currentDevVersionId),
      )
      .limit(1);
    if (!currentDevSecrets) {
      console.error("[Mastra Auth] No current dev secrets found");
      return c.json({ error: "No current dev secrets found" }, 400);
    }
    console.log("[Mastra Auth] Current dev secrets found");

    // Decrypt and parse the secrets before setting them in runtime context
    console.log("[Mastra Auth] Decrypting secrets...");
    const decryptedJson = decrypt(currentDevSecrets.secrets);
    const secretsData: Record<string, string> = JSON.parse(decryptedJson);
    console.log(
      `[Mastra Auth] Found ${Object.keys(secretsData).length} environment variables`,
    );
    runtimeContext.set("environmentVariables", secretsData);

    // Parse model selection from request body
    const modelId = body.modelId || "anthropic/claude-3-5-haiku-20241022";
    const keyProvider = body.keyProvider || "platform";
    console.log("[Mastra Auth] Model ID from body:", modelId);
    console.log("[Mastra Auth] Key provider from body:", keyProvider);

    // Parse provider from modelId (e.g., "anthropic/claude-3-5-haiku" -> "anthropic")
    const provider = modelId.split("/")[0] as "anthropic" | "openai" | "google";

    // If using personal key, fetch and decrypt it from database
    // Google is not supported for personal keys yet
    let apiKey: string | undefined;
    if (keyProvider === "personal") {
      if (provider === "google") {
        console.error(
          `[Mastra Auth] Personal API keys for Google are not supported yet`,
        );
        return c.json(
          {
            error: `Personal API keys for Google are not supported yet. Please use platform keys or select a different provider.`,
          },
          { status: 400 },
        );
      }

      const supportedProvider = provider as "anthropic" | "openai";
      const decryptedKey = await getDecryptedApiKey(user.id, supportedProvider);
      if (!decryptedKey) {
        console.error(
          `[Mastra Auth] Personal API key not found for ${provider}`,
        );
        return c.json(
          {
            error: `Personal API key not found for ${provider}. Please add your ${provider} API key in settings.`,
          },
          { status: 400 },
        );
      }
      apiKey = decryptedKey;
    }

    // Add model selection to runtime context
    const modelSelection: ModelSelectionContext = {
      modelId,
      provider,
      keyProvider: keyProvider as "platform" | "personal",
      apiKey, // Only set if using personal key
    };
    runtimeContext.set("modelSelection", modelSelection);

    console.log(
      `[Mastra Auth] Model selection configured: ${modelId}, provider: ${provider}, keyProvider: ${keyProvider}`,
    );

    await next();
  } catch (error) {
    console.error("[Mastra Auth] Authentication error:", error);
    return c.json({ error: "Internal server error" }, 500);
  }
}
