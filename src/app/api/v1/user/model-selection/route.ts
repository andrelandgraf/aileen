import { NextRequest, NextResponse } from "next/server";
import { stackServerApp } from "@/lib/stack/server";
import { cookies } from "next/headers";
import { setServerJsonCookie } from "@/lib/cookies";
import {
  COOKIE_NAME,
  COOKIE_MAX_AGE,
  isValidModelSelection,
} from "@/lib/model-selection/cookie";
import { getModelById } from "@/lib/models-dev";
import { db } from "@/lib/db/db";
import { userAiApiKeysTable } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";

/**
 * PUT /api/v1/user/model-selection
 * Update user's model selection preference
 */
export async function PUT(request: NextRequest) {
  try {
    // Verify user is authenticated
    const user = await stackServerApp.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Parse and validate request body
    const body = await request.json();

    if (!isValidModelSelection(body)) {
      return NextResponse.json(
        {
          error: "Invalid model selection",
          details:
            'Expected { provider: "platform" | "personal", modelId: string }',
        },
        { status: 400 },
      );
    }

    // Verify the model ID is supported by the platform
    const model = await getModelById(body.modelId);
    if (!model) {
      return NextResponse.json(
        {
          error: "Invalid model",
          details: `Model "${body.modelId}" is not supported by the platform`,
        },
        { status: 400 },
      );
    }

    // If using personal provider, verify user has API key for this model's provider
    if (body.provider === "personal") {
      const [userKey] = await db
        .select()
        .from(userAiApiKeysTable)
        .where(
          and(
            eq(userAiApiKeysTable.userId, user.id),
            eq(userAiApiKeysTable.provider, model.provider),
          ),
        )
        .limit(1);

      if (!userKey) {
        return NextResponse.json(
          {
            error: "Missing API key",
            details: `You must configure your ${model.provider} API key before using personal provider for this model`,
          },
          { status: 400 },
        );
      }
    }

    // Set cookie
    const cookieStore = await cookies();
    setServerJsonCookie(COOKIE_NAME, body, cookieStore, {
      maxAge: COOKIE_MAX_AGE,
    });

    return NextResponse.json({
      success: true,
      selection: body,
    });
  } catch (error) {
    console.error("Failed to update model selection:", error);
    return NextResponse.json(
      { error: "Failed to update model selection" },
      { status: 500 },
    );
  }
}
