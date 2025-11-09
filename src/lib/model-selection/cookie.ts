import { getJsonCookie, setJsonCookie, deleteCookie } from "@/lib/cookies";
import type { ModelSelection } from "./types";
import { DEFAULT_MODEL_SELECTION } from "./types";

const COOKIE_NAME = "aileen_model_selection";
const COOKIE_MAX_AGE = 90 * 24 * 60 * 60; // 90 days in seconds

/**
 * Validate if an object is a valid ModelSelection
 */
function isValidModelSelection(value: unknown): value is ModelSelection {
  if (typeof value !== "object" || value === null) return false;

  const obj = value as Record<string, unknown>;

  return (
    (obj.provider === "platform" || obj.provider === "personal") &&
    typeof obj.model === "string"
  );
}

/**
 * Get model selection from cookie
 */
export function getModelSelectionFromCookie(): ModelSelection | null {
  const value = getJsonCookie<unknown>(COOKIE_NAME);

  if (!value) return null;

  if (!isValidModelSelection(value)) {
    console.warn("Invalid model selection in cookie, clearing");
    deleteCookie(COOKIE_NAME);
    return null;
  }

  return value;
}

/**
 * Save model selection to cookie
 */
export function saveModelSelectionToCookie(selection: ModelSelection): void {
  setJsonCookie(COOKIE_NAME, selection, {
    maxAge: COOKIE_MAX_AGE,
  });
}

/**
 * Clear model selection cookie
 */
export function clearModelSelectionCookie(): void {
  deleteCookie(COOKIE_NAME);
}

/**
 * Get model selection from cookie with fallback to default
 */
export function getModelSelectionOrDefault(): ModelSelection {
  return getModelSelectionFromCookie() ?? DEFAULT_MODEL_SELECTION;
}
