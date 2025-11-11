import { stackServerApp } from "@/lib/stack/server";
import { db } from "@/lib/db/db";
import { userAiApiKeysTable } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { encrypt, decrypt } from "@/lib/encryption";
import { z } from "zod";
import { parseRequestJson } from "@/lib/parser-utils";

type AIProvider = "anthropic" | "openai" | "openrouter";

function isValidProvider(provider: string): provider is AIProvider {
  return ["anthropic", "openai", "openrouter"].includes(provider);
}

const saveApiKeySchema = z.object({
  provider: z.enum(["anthropic", "openai", "openrouter"]),
  apiKey: z.string().trim().min(1, "API key is required"),
});

/**
 * GET - Get status of all API keys for the user
 * Returns array with boolean for each provider, never exposes actual keys
 */
export async function GET(request: Request): Promise<Response> {
  const user = await stackServerApp.getUser();
  if (!user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Query all keys for this user
  const keys = await db.query.userAiApiKeysTable.findMany({
    where: (keys, { eq }) => eq(keys.userId, user.id),
  });

  // Create a map of provider -> hasKey
  const keyMap = new Map(keys.map((key) => [key.provider, true]));

  // Return status for all providers
  const allProviders: AIProvider[] = ["anthropic", "openai", "openrouter"];
  const result = allProviders.map((provider) => ({
    provider,
    hasKey: keyMap.has(provider),
  }));

  return Response.json({ keys: result });
}

/**
 * POST - Save or update user's API key
 * Encrypts the key before storing in the database
 */
export async function POST(request: Request): Promise<Response> {
  const user = await stackServerApp.getUser();
  if (!user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data, error } = await parseRequestJson(
    request,
    saveApiKeySchema,
  );
  if (error) {
    return error;
  }

  const { provider: parsedProvider, apiKey } = data;
  const provider: AIProvider = parsedProvider;

  // Basic validation for Anthropic API keys
  if (provider === "anthropic" && !apiKey.startsWith("sk-ant-")) {
    return Response.json(
      { error: "Invalid Anthropic API key format" },
      { status: 400 },
    );
  }

  try {
    // Encrypt API key before storing
    const encryptedKey = encrypt(apiKey);

    // Upsert key
    await db
      .insert(userAiApiKeysTable)
      .values({ userId: user.id, provider, apiKey: encryptedKey })
      .onConflictDoUpdate({
        target: [userAiApiKeysTable.userId, userAiApiKeysTable.provider],
        set: { apiKey: encryptedKey, updatedAt: new Date() },
      });

    return Response.json({ success: true });
  } catch (error) {
    console.error("Error saving API key:", error);
    return Response.json({ error: "Failed to save API key" }, { status: 500 });
  }
}

/**
 * DELETE - Remove user's API key for a provider
 */
export async function DELETE(request: Request): Promise<Response> {
  const user = await stackServerApp.getUser();
  if (!user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const providerParam = searchParams.get("provider");

  if (!providerParam || !isValidProvider(providerParam)) {
    return Response.json(
      { error: "Valid provider is required" },
      { status: 400 },
    );
  }

  const provider: AIProvider = providerParam;

  try {
    await db
      .delete(userAiApiKeysTable)
      .where(
        and(
          eq(userAiApiKeysTable.userId, user.id),
          eq(userAiApiKeysTable.provider, provider),
        ),
      );

    return Response.json({ success: true });
  } catch (error) {
    console.error("Error deleting API key:", error);
    return Response.json(
      { error: "Failed to delete API key" },
      { status: 500 },
    );
  }
}

/**
 * Internal helper to get decrypted API key for a user
 * DO NOT expose this via HTTP endpoint
 * Use this function server-side to retrieve keys for making API calls
 */
export async function getDecryptedApiKey(
  userId: string,
  provider: AIProvider,
): Promise<string | null> {
  const key = await db.query.userAiApiKeysTable.findFirst({
    where: (keys, { eq, and }) =>
      and(eq(keys.userId, userId), eq(keys.provider, provider)),
  });

  if (!key) return null;

  try {
    // Decrypt before returning
    return decrypt(key.apiKey);
  } catch (error) {
    console.error("Error decrypting API key:", error);
    return null;
  }
}
