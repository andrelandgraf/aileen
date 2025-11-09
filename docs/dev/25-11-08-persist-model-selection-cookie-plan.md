# Model Selection Cookie Persistence - Implementation Plan

**Date:** 25-11-08  
**Feature:** Persist user's model selection in a cookie to remember their preference across sessions

## Problem Statement

Currently, the model selection in the chat interface (`ModelSelection` state) is stored only in component state. When a user:

- Refreshes the page
- Closes and reopens the browser
- Navigates away and returns

Their model selection is lost and defaults back to `{ provider: "platform", model: "claude-3-5-haiku-20241022" }`. This creates a poor user experience as users have to re-select their preferred model every time they visit a project.

## Solution Overview

Implement cookie-based persistence for the model selection preference with clean separation of concerns:

1. Create generic cookie utilities in `lib/cookies` (reusable across app)
2. Create model-selection-specific logic in `lib/model-selection` (domain-specific)
3. Abstract React logic into custom hooks for cleaner component integration
4. Handle edge cases (invalid data, missing cookies, expired cookies)

## Implementation Decisions

### Architecture

- **Generic Cookie Utils:** `lib/cookies/` - Reusable cookie operations (get, set, delete, parse JSON)
- **Model Selection Logic:** `lib/model-selection/` - Domain-specific cookie operations and hooks
- **Custom Hooks:** Abstract useState + cookie sync + validation into `useModelSelection` hook
- **Type Safety:** Export `ModelSelection` type from model-selection module for consistency

**Rationale:** Clean separation of concerns makes code reusable, testable, and maintainable. Generic cookie utilities can be used for other features. Hooks encapsulate complex logic away from components.

### Cookie Strategy

- **Name:** `aileen_model_selection`
- **Scope:** Client-side cookie (not httpOnly) since this is purely a UI preference
- **Expiration:** 90 days (reasonable balance between persistence and privacy)
- **Domain:** Default (current domain)
- **Path:** `/` (available across entire app)
- **SameSite:** `Lax` (prevents CSRF while allowing normal navigation)
- **Secure:** `true` in production (HTTPS only)

**Rationale:** Client-side cookie is appropriate since this is a user preference, not security-sensitive. 90 days provides good persistence without being overly permanent.

### Data Format

Store as JSON-encoded string:

```json
{
  "provider": "platform" | "personal",
  "model": "claude-3-5-haiku-20241022"
}
```

**Rationale:** JSON allows easy extension if we add more model options in the future. Matches the `ModelSelection` type exactly.

### Fallback Behavior

If cookie is:

- Missing → Use default (platform/haiku)
- Invalid JSON → Use default and clear cookie
- Has invalid provider → Use default and clear cookie
- Has invalid model → Use default and clear cookie

**Rationale:** Defensive programming ensures the app always works even with corrupted cookies.

### Personal Key Validation

If cookie specifies `provider: "personal"`:

- Check if user has a personal API key configured
- If not, fall back to `provider: "platform"`

**Rationale:** Prevents broken state where personal provider is selected but no key exists.

## Files to Create

### 1. `src/lib/cookies/index.ts` (NEW FILE)

**Purpose:** Generic, reusable cookie utilities for the entire application

**Implementation Structure:**

```typescript
export interface CookieOptions {
  maxAge?: number; // in seconds
  path?: string;
  domain?: string;
  sameSite?: "Strict" | "Lax" | "None";
  secure?: boolean;
}

/**
 * Get a cookie value by name
 */
export function getCookie(name: string): string | null {
  const value = document.cookie
    .split("; ")
    .find((row) => row.startsWith(`${name}=`))
    ?.split("=")[1];

  return value ? decodeURIComponent(value) : null;
}

/**
 * Set a cookie with options
 */
export function setCookie(
  name: string,
  value: string,
  options: CookieOptions = {},
): void {
  const {
    maxAge,
    path = "/",
    domain,
    sameSite = "Lax",
    secure = process.env.NODE_ENV === "production",
  } = options;

  const cookieParts = [
    `${name}=${encodeURIComponent(value)}`,
    maxAge !== undefined ? `max-age=${maxAge}` : "",
    `path=${path}`,
    domain ? `domain=${domain}` : "",
    `SameSite=${sameSite}`,
    secure ? "Secure" : "",
  ].filter(Boolean);

  document.cookie = cookieParts.join("; ");
}

/**
 * Delete a cookie by name
 */
export function deleteCookie(name: string, path: string = "/"): void {
  document.cookie = `${name}=; max-age=0; path=${path}`;
}

/**
 * Get a JSON-parsed cookie value
 * Returns null if cookie doesn't exist or parsing fails
 */
export function getJsonCookie<T>(name: string): T | null {
  const value = getCookie(name);
  if (!value) return null;

  try {
    return JSON.parse(value) as T;
  } catch (error) {
    console.error(`Failed to parse JSON cookie "${name}":`, error);
    deleteCookie(name);
    return null;
  }
}

/**
 * Set a JSON cookie (automatically stringifies the value)
 */
export function setJsonCookie<T>(
  name: string,
  value: T,
  options: CookieOptions = {},
): void {
  const jsonString = JSON.stringify(value);
  setCookie(name, jsonString, options);
}
```

**Dependencies:** None (pure utility functions)

---

### 2. `src/lib/model-selection/types.ts` (NEW FILE)

**Purpose:** Type definitions for model selection

**Implementation:**

```typescript
export type ModelSelection =
  | { provider: "platform"; model: "claude-3-5-haiku-20241022" }
  | { provider: "personal"; model: "claude-3-5-haiku-20241022" };

export const DEFAULT_MODEL_SELECTION: ModelSelection = {
  provider: "platform",
  model: "claude-3-5-haiku-20241022",
};
```

**Dependencies:** None

---

### 3. `src/lib/model-selection/cookie.ts` (NEW FILE)

**Purpose:** Model-selection-specific cookie operations

**Implementation:**

```typescript
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
```

**Dependencies:**

```typescript
import { getJsonCookie, setJsonCookie, deleteCookie } from "@/lib/cookies";
import type { ModelSelection } from "./types";
import { DEFAULT_MODEL_SELECTION } from "./types";
```

---

### 4. `src/lib/model-selection/hooks.ts` (NEW FILE)

**Purpose:** React hooks for model selection with cookie persistence and validation

**Implementation:**

```typescript
import { useState, useEffect, useCallback } from "react";
import type { ModelSelection } from "./types";
import { DEFAULT_MODEL_SELECTION } from "./types";
import {
  getModelSelectionOrDefault,
  saveModelSelectionToCookie,
} from "./cookie";

interface UseModelSelectionOptions {
  /**
   * Access token for validating personal API keys
   */
  accessToken?: string;
  /**
   * Whether to validate personal provider on mount
   */
  validatePersonalProvider?: boolean;
}

interface KeyStatus {
  provider: string;
  hasKey: boolean;
}

/**
 * Hook for managing model selection with cookie persistence
 *
 * Features:
 * - Loads initial selection from cookie
 * - Automatically saves changes to cookie
 * - Validates personal provider has API key (optional)
 * - Falls back to platform provider if personal key missing
 */
export function useModelSelection(options: UseModelSelectionOptions = {}) {
  const { accessToken, validatePersonalProvider = true } = options;

  // Initialize from cookie
  const [modelSelection, setModelSelection] = useState<ModelSelection>(() =>
    getModelSelectionOrDefault(),
  );

  // Validate personal provider on mount
  useEffect(() => {
    if (!validatePersonalProvider || !accessToken) return;
    if (modelSelection.provider !== "personal") return;

    const validateKey = async () => {
      try {
        const response = await fetch(`/api/v1/user/ai-keys`, {
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        });

        if (!response.ok) {
          throw new Error("Failed to fetch API keys");
        }

        const data = await response.json();
        const hasAnthropicKey = data.keys.some(
          (key: KeyStatus) => key.provider === "anthropic" && key.hasKey,
        );

        // If no key found, fall back to platform
        if (!hasAnthropicKey) {
          console.warn(
            "Personal provider selected but no Anthropic key found, falling back to platform",
          );
          updateModelSelection(DEFAULT_MODEL_SELECTION);
        }
      } catch (error) {
        console.error("Failed to validate personal provider:", error);
        // On error, fall back to platform for safety
        updateModelSelection(DEFAULT_MODEL_SELECTION);
      }
    };

    validateKey();
  }, []); // Only run on mount

  // Update selection and save to cookie
  const updateModelSelection = useCallback((selection: ModelSelection) => {
    setModelSelection(selection);
    saveModelSelectionToCookie(selection);
  }, []);

  return {
    modelSelection,
    updateModelSelection,
    setModelSelection: updateModelSelection, // Alias for compatibility
  };
}
```

**Dependencies:**

```typescript
import { useState, useEffect, useCallback } from "react";
import type { ModelSelection } from "./types";
import { DEFAULT_MODEL_SELECTION } from "./types";
import {
  getModelSelectionOrDefault,
  saveModelSelectionToCookie,
} from "./cookie";
```

---

### 5. `src/lib/model-selection/index.ts` (NEW FILE)

**Purpose:** Barrel export for model selection module

**Implementation:**

```typescript
export * from "./types";
export * from "./cookie";
export * from "./hooks";
```

**Dependencies:** Internal module files

## Files to Modify

### 6. `src/components/model-selector-modal.tsx`

**Changes:**

- **Update type import (line 18-20):**

  Remove:

  ```typescript
  export type ModelSelection =
    | { provider: "platform"; model: "claude-3-5-haiku-20241022" }
    | { provider: "personal"; model: "claude-3-5-haiku-20241022" };
  ```

  Add import:

  ```typescript
  import type { ModelSelection } from "@/lib/model-selection";
  ```

**Rationale:** Centralize type definition in model-selection module for consistency

**Keep:**

- All existing component logic
- All existing props
- All existing UI

---

### 7. `src/components/project-chat.tsx`

**Changes:**

- **Update imports (line 40):**

  Remove:

  ```typescript
  import {
    ModelSelectorModal,
    type ModelSelection,
  } from "@/components/model-selector-modal";
  ```

  Replace with:

  ```typescript
  import { ModelSelectorModal } from "@/components/model-selector-modal";
  import { useModelSelection } from "@/lib/model-selection";
  ```

- **Replace state and effects with hook (line 64-68):**

  Remove:

  ```typescript
  const [modelSelection, setModelSelection] = useState<ModelSelection>({
    provider: "platform",
    model: "claude-3-5-haiku-20241022",
  });
  ```

  Replace with:

  ```typescript
  const { modelSelection, updateModelSelection } = useModelSelection({
    accessToken,
    validatePersonalProvider: true,
  });
  ```

- **Update modal callback (line 142):**

  Change:

  ```typescript
  onModelSelect = { setModelSelection };
  ```

  To:

  ```typescript
  onModelSelect = { updateModelSelection };
  ```

**Keep:**

- All existing state and effects (except modelSelection)
- All existing UI rendering
- All existing component structure

**Result:** Component is now much cleaner! All cookie logic and validation moved to the hook.

## Directory Structure

```
src/
├── lib/
│   ├── cookies/
│   │   └── index.ts                 (NEW FILE - generic cookie utilities)
│   ├── model-selection/
│   │   ├── index.ts                 (NEW FILE - barrel export)
│   │   ├── types.ts                 (NEW FILE - type definitions)
│   │   ├── cookie.ts                (NEW FILE - model selection cookie ops)
│   │   └── hooks.ts                 (NEW FILE - React hooks)
│   └── ...
└── components/
    ├── model-selector-modal.tsx     (MODIFY - update type import)
    └── project-chat.tsx              (MODIFY - use hook instead of manual state)
```

## Implementation Flow

```
1. User visits project page
   ├─ ProjectChat component renders
   ├─ useModelSelection hook initializes
   │   ├─ Calls getModelSelectionOrDefault()
   │   │   ├─ Tries getJsonCookie()
   │   │   ├─ Validates data with isValidModelSelection()
   │   │   └─ Returns valid selection or DEFAULT_MODEL_SELECTION
   │   └─ Sets initial state
   └─ Component renders with loaded selection

2. Validation effect runs (inside useModelSelection hook)
   ├─ Checks if provider is "personal"
   ├─ If yes, fetches /api/v1/user/ai-keys
   ├─ Checks if anthropic key exists
   └─ If not, calls updateModelSelection(DEFAULT_MODEL_SELECTION)
       ├─ Updates React state
       └─ Saves to cookie via saveModelSelectionToCookie()

3. User opens model selector modal
   └─ Current selection (from hook state) is displayed

4. User changes model selection
   ├─ Clicks Apply in modal
   ├─ onModelSelect={updateModelSelection} callback fires
   ├─ updateModelSelection() function is called
   │   ├─ Updates React state with setModelSelection()
   │   └─ Saves to cookie with saveModelSelectionToCookie()
   │       └─ Uses setJsonCookie() with 90-day expiration
   └─ Modal closes

5. User refreshes or returns later
   └─ Back to step 1 - saved preference is restored from cookie
```

## Cookie Security Considerations

### Why Not httpOnly?

- This cookie stores UI preferences, not sensitive authentication data
- Must be readable by client-side JavaScript for React state initialization
- No security risk since it only affects which model dropdown option is selected

### Why Secure Flag?

- In production, ensures cookie is only sent over HTTPS
- Prevents potential MITM attacks from reading user preferences
- Standard best practice for all cookies

### Why SameSite=Lax?

- Prevents CSRF attacks
- Still allows normal navigation (clicking links from external sites)
- More permissive than `Strict` but still secure

### Data Validation

- Always validate cookie data before using
- Clear invalid cookies immediately
- Never trust cookie data - always type-check

## Edge Cases Handled

### 1. Corrupted Cookie Data

**Scenario:** Cookie contains invalid JSON or malformed data

**Handling:**

- `JSON.parse()` wrapped in try-catch
- Return `null` on parse error
- Clear the invalid cookie
- Fall back to default selection

### 2. Personal Provider Without Key

**Scenario:** Cookie says "personal" but user deleted their API key

**Handling:**

- Validation effect on mount checks key status
- If no key found, switch to "platform"
- Update both state and cookie with fallback

### 3. Future Model Changes

**Scenario:** Cookie references a model that's been removed/renamed

**Handling:**

- Current code validates provider but not specific model name
- Could enhance with model whitelist validation
- For now, invalid models will fail at API level (acceptable)

### 4. Cookie Too Large

**Scenario:** Future expansion makes cookie exceed size limits

**Handling:**

- Current data is minimal (~70 bytes)
- Cookie size limit is 4KB
- Plenty of room for expansion
- If needed, could compress or use localStorage instead

### 5. Cookies Disabled

**Scenario:** User has cookies disabled in browser

**Handling:**

- `getModelSelectionFromCookie()` returns `null`
- App falls back to default selection
- Selection still works within session (React state)
- Just won't persist across sessions (acceptable degradation)

### 6. Multiple Tabs

**Scenario:** User has multiple tabs open, changes model in one

**Handling:**

- Each tab has independent React state
- Cookie is shared across tabs
- New tabs will see latest selection
- Existing tabs keep their state until refresh (acceptable)

## Testing Checklist

- [ ] Fresh user (no cookie) sees default selection (platform/haiku)
- [ ] Changing model updates cookie
- [ ] Refreshing page restores saved selection
- [ ] Cookie persists after browser restart
- [ ] Selecting personal provider with key works
- [ ] Selecting personal provider without key falls back to platform
- [ ] Deleting API key while using personal provider switches to platform
- [ ] Invalid cookie data is handled gracefully
- [ ] Cookie expires after 90 days (manual test or mock date)
- [ ] Works in both development and production
- [ ] Cookie has correct flags (Secure in prod, SameSite=Lax)
- [ ] Opening new tab uses saved preference
- [ ] Works with cookies disabled (graceful degradation)

## Future Enhancements

- **localStorage fallback:** Use localStorage if cookies are disabled
- **Per-project preferences:** Store different model per project (requires larger data structure)
- **Sync across devices:** Use backend storage instead of cookies (requires DB changes)
- **Model validation:** Add whitelist of valid model names for stricter validation
- **Analytics:** Track which models are most popular (with user consent)

## Benefits of This Architecture

### 1. Separation of Concerns

- **Generic utilities (`lib/cookies`):** Reusable across the entire app for any cookie needs
- **Domain logic (`lib/model-selection`):** Model-selection-specific logic isolated
- **UI components:** Clean, focused on rendering, delegate logic to hooks

### 2. Testability

- Cookie utilities can be unit tested independently
- Hooks can be tested with React Testing Library
- Components become easier to test (less logic)

### 3. Reusability

- Generic cookie utilities can handle other features (theme preference, sidebar state, etc.)
- Hook pattern can be applied to other persisted preferences
- Type definitions can be imported anywhere

### 4. Maintainability

- Changes to cookie strategy only affect `lib/cookies`
- Changes to validation logic only affect `lib/model-selection/hooks.ts`
- Clear boundaries make debugging easier

### 5. Developer Experience

- Single import: `import { useModelSelection } from "@/lib/model-selection"`
- No need to remember cookie implementation details
- TypeScript provides full type safety

## Notes

- Cookie is client-side only (no server-side rendering impact)
- Cookie name prefixed with `aileen_` to avoid conflicts
- 90-day expiration is arbitrary - could be adjusted based on user feedback
- If we add more models in future, the JSON structure easily accommodates new options
- Consider adding a "Reset to Default" option in the model selector UI
- The validation effect runs only once on mount (optimized)
- Generic cookie utilities can be extended for httpOnly cookies via server actions if needed
