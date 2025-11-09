import { stackServerApp } from "@/lib/stack/server";
import { db } from "@/lib/db/db";
import { userAiApiKeysTable } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import {
  getSystemModels,
  getBYOKModels,
  type NormalizedModel,
} from "@/lib/models-dev";

interface ModelsResponse {
  systemModels: NormalizedModel[];
  byokModels: NormalizedModel[];
  userProviders: Array<"anthropic" | "openai" | "google">;
}

export async function GET(request: Request): Promise<Response> {
  try {
    // Get authenticated user
    const user = await stackServerApp.getUser();
    if (!user) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Get user's saved API keys to determine which BYOK models to show
    const userKeys = await db.query.userAiApiKeysTable.findMany({
      where: eq(userAiApiKeysTable.userId, user.id),
    });

    const savedProviders = userKeys.map((key) => key.provider) as Array<
      "anthropic" | "openai" | "google"
    >;

    // Fetch system models (always available)
    const systemModels = await getSystemModels();

    // Fetch BYOK models based on saved keys
    const byokModels = await getBYOKModels(savedProviders);

    const response: ModelsResponse = {
      systemModels,
      byokModels,
      userProviders: savedProviders,
    };

    return Response.json(response);
  } catch (error) {
    console.error("Failed to fetch models:", error);
    return Response.json({ error: "Failed to fetch models" }, { status: 500 });
  }
}
