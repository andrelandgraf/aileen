import crypto from "crypto";
import { mainConfig } from "./config";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 16; // 16 bytes for GCM
const AUTH_TAG_LENGTH = 16;

/**
 * Get encryption key from environment variable
 * Must be 32 bytes (256 bits) for AES-256
 */
function getEncryptionKey(): Buffer {
  const key = mainConfig.encryptionKey;
  if (!key) {
    throw new Error(
      "ENCRYPTION_KEY environment variable is required. " +
        "Generate one with: node -e \"console.log(require('crypto').randomBytes(32).toString('hex'))\"",
    );
  }
  // Key should be a 64-character hex string (32 bytes)
  if (key.length !== 64) {
    throw new Error(
      "ENCRYPTION_KEY must be a 64-character hex string (32 bytes)",
    );
  }
  return Buffer.from(key, "hex");
}

/**
 * Encrypt any sensitive string value
 * Returns base64-encoded string containing: iv + authTag + encrypted data
 *
 * This function can be used for:
 * - API keys (Anthropic, OpenAI, etc.)
 * - OAuth tokens and refresh tokens
 * - Database credentials
 * - Any sensitive user data
 *
 * @param text - Plain text to encrypt
 * @returns Base64-encoded encrypted data safe for database storage
 *
 * @example
 * // Encrypt an API key
 * const encryptedKey = encrypt("sk-ant-api-key-123");
 *
 * @example
 * // Encrypt an OAuth token
 * const encryptedToken = encrypt(userOAuthToken);
 *
 * @example
 * // Encrypt a password or secret
 * const encryptedPassword = encrypt(userPassword);
 */
export function encrypt(text: string): string {
  if (!text) {
    throw new Error("Cannot encrypt empty text");
  }

  const key = getEncryptionKey();
  const iv = crypto.randomBytes(IV_LENGTH);

  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

  let encrypted = cipher.update(text, "utf8", "hex");
  encrypted += cipher.final("hex");

  const authTag = cipher.getAuthTag();

  // Combine iv:authTag:encrypted for storage
  const combined = Buffer.concat([iv, authTag, Buffer.from(encrypted, "hex")]);

  return combined.toString("base64");
}

/**
 * Decrypt any previously encrypted string value
 * Expects base64-encoded string containing: iv + authTag + encrypted data
 *
 * This function decrypts data encrypted by the encrypt() function.
 * Works with any type of sensitive data that was encrypted.
 *
 * @param encryptedData - Base64-encoded encrypted data from encrypt()
 * @returns Decrypted plain text
 * @throws Error if decryption fails or data is tampered with
 *
 * @example
 * // Decrypt an API key
 * const apiKey = decrypt(encryptedKeyFromDb);
 *
 * @example
 * // Decrypt an OAuth token
 * const token = decrypt(encryptedTokenFromDb);
 */
export function decrypt(encryptedData: string): string {
  if (!encryptedData) {
    throw new Error("Cannot decrypt empty data");
  }

  const key = getEncryptionKey();
  let combined: Buffer;

  try {
    combined = Buffer.from(encryptedData, "base64");
  } catch (error) {
    throw new Error(
      `Failed to decode base64 encrypted data: ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  // Validate minimum length (iv + authTag)
  const minLength = IV_LENGTH + AUTH_TAG_LENGTH;
  if (combined.length < minLength) {
    throw new Error(
      `Encrypted data too short: expected at least ${minLength} bytes, got ${combined.length}. ` +
        "This may indicate corrupted or invalid encrypted data.",
    );
  }

  // Extract components
  const iv = combined.subarray(0, IV_LENGTH);
  const authTag = combined.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH);
  const encrypted = combined.subarray(IV_LENGTH + AUTH_TAG_LENGTH);

  let decipher: crypto.DecipherGCM;
  try {
    decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(authTag);
  } catch (error) {
    throw new Error(
      `Failed to create decipher: ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  let decrypted: Buffer;
  try {
    decrypted = decipher.update(encrypted);
    decrypted = Buffer.concat([decrypted, decipher.final()]);
  } catch (error) {
    throw new Error(
      `Decryption failed: ${error instanceof Error ? error.message : String(error)}. ` +
        "This may indicate incorrect encryption key, corrupted data, or tampered data.",
    );
  }

  return decrypted.toString("utf8");
}

/**
 * Generate a new encryption key for ENCRYPTION_KEY environment variable
 * This should be run once and the output stored in environment variables
 *
 * @returns 64-character hex string (32 bytes)
 */
export function generateEncryptionKey(): string {
  return crypto.randomBytes(32).toString("hex");
}
