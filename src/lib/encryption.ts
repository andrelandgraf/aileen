import crypto from "crypto";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 16; // 16 bytes for GCM
const AUTH_TAG_LENGTH = 16;

/**
 * Get encryption key from environment variable
 * Must be 32 bytes (256 bits) for AES-256
 */
function getEncryptionKey(): Buffer {
  const key = process.env.ENCRYPTION_KEY;
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
  const combined = Buffer.from(encryptedData, "base64");

  // Extract components
  const iv = combined.subarray(0, IV_LENGTH);
  const authTag = combined.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH);
  const encrypted = combined.subarray(IV_LENGTH + AUTH_TAG_LENGTH);

  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);

  let decrypted = decipher.update(encrypted);
  decrypted = Buffer.concat([decrypted, decipher.final()]);

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
