import { getServerJsonCookie } from "@/lib/cookies";
import type { ModelSelection } from "./types";
import { DEFAULT_MODEL_SELECTION } from "./types";
import type { cookies } from "next/headers";

export const COOKIE_NAME = "aileen_model_selection";
export const COOKIE_MAX_AGE = 90 * 24 * 60 * 60; // 90 days in seconds

type CookieStore = Awaited<ReturnType<typeof cookies>>;

/**
 * Validate if an object is a valid ModelSelection
 */
export function isValidModelSelection(value: unknown): value is ModelSelection {
  if (typeof value !== "object" || value === null) return false;

  const obj = value as Record<string, unknown>;

  return (
    (obj.provider === "platform" || obj.provider === "personal") &&
    typeof obj.modelId === "string"
  );
}

/**
 * Get model selection from cookie (server-side only)
 * Use this in Server Components to read the user's model selection
 *
 * @example
 * ```ts
 * import { cookies } from "next/headers";
 * import { getModelSelectionFromCookie } from "@/lib/model-selection/cookie";
 *
 * const cookieStore = await cookies();
 * const selection = getModelSelectionFromCookie(cookieStore);
 * ```
 */
export function getModelSelectionFromCookie(
  cookieStore: CookieStore,
): ModelSelection | null {
  const value = getServerJsonCookie<unknown>(COOKIE_NAME, cookieStore);

  if (!value) return null;

  if (!isValidModelSelection(value)) {
    console.warn("Invalid model selection in cookie");
    return null;
  }

  return value;
}

/**
 * Get model selection from cookie with fallback to default (server-side only)
 *
 * @example
 * ```ts
 * import { cookies } from "next/headers";
 * import { getModelSelectionOrDefault } from "@/lib/model-selection/cookie";
 *
 * const cookieStore = await cookies();
 * const selection = getModelSelectionOrDefault(cookieStore);
 * ```
 */
export function getModelSelectionOrDefault(
  cookieStore: CookieStore,
): ModelSelection {
  return getModelSelectionFromCookie(cookieStore) ?? DEFAULT_MODEL_SELECTION;
}

/**
 * Save model selection to cookie (client-side via API)
 * This calls the API endpoint to set the cookie server-side
 * Authentication is handled automatically via Stack Auth session cookie
 *
 * @param selection The model selection to save
 */
export async function saveModelSelectionToCookie(
  selection: ModelSelection,
): Promise<void> {
  const response = await fetch("/api/v1/user/model-selection", {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(selection),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || "Failed to save model selection");
  }
}
