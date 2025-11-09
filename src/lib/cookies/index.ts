export interface CookieOptions {
  maxAge?: number; // in seconds
  path?: string;
  domain?: string;
  sameSite?: "Strict" | "Lax" | "None";
  secure?: boolean;
}

// ============================================================================
// CLIENT-SIDE COOKIE UTILITIES (Browser only)
// ============================================================================

/**
 * Get a cookie value by name (client-side only)
 * Returns null on server-side
 */
export function getCookie(name: string): string | null {
  if (typeof window === "undefined") {
    return null;
  }

  const value = document.cookie
    .split("; ")
    .find((row) => row.startsWith(`${name}=`))
    ?.split("=")[1];

  return value ? decodeURIComponent(value) : null;
}

/**
 * Set a cookie with options (client-side only)
 * No-op on server-side
 */
export function setCookie(
  name: string,
  value: string,
  options: CookieOptions = {},
): void {
  if (typeof window === "undefined") {
    return;
  }

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
 * Delete a cookie by name (client-side only)
 * No-op on server-side
 */
export function deleteCookie(name: string, path: string = "/"): void {
  if (typeof window === "undefined") {
    return;
  }

  document.cookie = `${name}=; max-age=0; path=${path}`;
}

/**
 * Get a JSON-parsed cookie value (client-side only)
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
 * Set a JSON cookie (automatically stringifies the value) (client-side only)
 */
export function setJsonCookie<T>(
  name: string,
  value: T,
  options: CookieOptions = {},
): void {
  const jsonString = JSON.stringify(value);
  setCookie(name, jsonString, options);
}

// ============================================================================
// SERVER-SIDE COOKIE UTILITIES (Next.js Server Components, API Routes, etc.)
// ============================================================================

/**
 * Get a cookie value by name (server-side only)
 * Uses Next.js cookies() function
 *
 * @example
 * ```ts
 * import { getServerCookie } from "@/lib/cookies";
 * import { cookies } from "next/headers";
 *
 * const cookieStore = await cookies();
 * const value = getServerCookie("myCookie", cookieStore);
 * ```
 */
export function getServerCookie(
  name: string,
  cookieStore: Awaited<ReturnType<typeof import("next/headers").cookies>>,
): string | null {
  const cookie = cookieStore.get(name);
  return cookie ? decodeURIComponent(cookie.value) : null;
}

/**
 * Set a cookie with options (server-side only)
 * Uses Next.js cookies().set() method
 * Note: Only works in Route Handlers, not Server Components
 *
 * @example
 * ```ts
 * import { setServerCookie } from "@/lib/cookies";
 * import { cookies } from "next/headers";
 *
 * const cookieStore = await cookies();
 * setServerCookie("myCookie", "value", cookieStore, { maxAge: 3600 });
 * ```
 */
export function setServerCookie(
  name: string,
  value: string,
  cookieStore: Awaited<ReturnType<typeof import("next/headers").cookies>> & {
    set: (name: string, value: string, options?: any) => void;
  },
  options: CookieOptions = {},
): void {
  const {
    maxAge,
    path = "/",
    domain,
    sameSite = "Lax",
    secure = process.env.NODE_ENV === "production",
  } = options;

  cookieStore.set(name, encodeURIComponent(value), {
    maxAge,
    path,
    domain,
    sameSite,
    secure,
    httpOnly: true, // Server-side cookies should be HttpOnly for security
  });
}

/**
 * Delete a cookie (server-side only)
 * Uses Next.js cookies().delete() method
 * Note: Only works in Route Handlers, not Server Components
 *
 * @example
 * ```ts
 * import { deleteServerCookie } from "@/lib/cookies";
 * import { cookies } from "next/headers";
 *
 * const cookieStore = await cookies();
 * deleteServerCookie("myCookie", cookieStore);
 * ```
 */
export function deleteServerCookie(
  name: string,
  cookieStore: Awaited<ReturnType<typeof import("next/headers").cookies>> & {
    delete: (name: string) => void;
  },
  path: string = "/",
): void {
  cookieStore.delete(name);
}

/**
 * Get a JSON-parsed cookie value (server-side only)
 * Returns null if cookie doesn't exist or parsing fails
 *
 * @example
 * ```ts
 * import { getServerJsonCookie } from "@/lib/cookies";
 * import { cookies } from "next/headers";
 *
 * const cookieStore = await cookies();
 * const data = getServerJsonCookie<MyType>("myCookie", cookieStore);
 * ```
 */
export function getServerJsonCookie<T>(
  name: string,
  cookieStore: Awaited<ReturnType<typeof import("next/headers").cookies>>,
): T | null {
  const value = getServerCookie(name, cookieStore);
  if (!value) return null;

  try {
    return JSON.parse(value) as T;
  } catch (error) {
    console.error(`Failed to parse JSON cookie "${name}":`, error);
    return null;
  }
}

/**
 * Set a JSON cookie (server-side only)
 * Uses Next.js cookies().set() method
 * Note: Only works in Route Handlers, not Server Components
 *
 * @example
 * ```ts
 * import { setServerJsonCookie } from "@/lib/cookies";
 * import { cookies } from "next/headers";
 *
 * const cookieStore = await cookies();
 * setServerJsonCookie("myCookie", { key: "value" }, cookieStore, { maxAge: 3600 });
 * ```
 */
export function setServerJsonCookie<T>(
  name: string,
  value: T,
  cookieStore: Awaited<ReturnType<typeof import("next/headers").cookies>> & {
    set: (name: string, value: string, options?: any) => void;
  },
  options: CookieOptions = {},
): void {
  const jsonString = JSON.stringify(value);
  setServerCookie(name, jsonString, cookieStore, options);
}
