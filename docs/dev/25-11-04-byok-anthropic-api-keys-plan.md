# BYOK (Bring Your Own Key) - Anthropic API Keys - Implementation Plan

**Date:** 25-11-04  
**Feature:** Allow users to optionally provide their own Anthropic API keys and select models

## Problem Statement

Currently, Aileen uses platform-provided Anthropic API keys, which means:

- Users are limited by platform quota and rate limits
- When platform credits run out, all users are affected
- Users cannot take advantage of their own Anthropic credits
- There's no flexibility in model selection beyond the default (Haiku)

We need a BYOK (Bring Your Own Key) feature that allows users to:

1. Optionally provide their own Anthropic API key
2. Select between platform keys and their personal keys
3. Choose which model to use based on available keys
4. Seamlessly switch between platform and personal keys

## Solution Overview

1. **Database Schema**: Add `user_ai_api_keys` table to store encrypted API keys per user
2. **UI Components**: Create model selection modal with BYOK management and model picker tabs
3. **Frontend Integration**: Add model selector trigger next to send button in chat interface
4. **Backend Integration**: Pass model/key selection to Mastra via query params
5. **Agent Configuration**: Dynamically configure agent model based on user selection

## Implementation Decisions

### API Key Storage

- **Detail:** Store API keys in `user_ai_api_keys` table with AI provider enum
- **Rationale:**
  - Allows future support for OpenAI, OpenRouter, etc.
  - Keeps keys associated with users, not projects
  - Enables easy key rotation and management

### Key Encryption

- **Detail:** Store keys encrypted at rest using AES-256-GCM encryption with Node.js crypto module
- **Rationale:**
  - Security best practice - API keys are sensitive credentials
  - AES-256-GCM provides authenticated encryption (prevents tampering)
  - Node.js crypto is built-in, no external dependencies
  - Fast performance with minimal overhead
  - Industry-standard encryption algorithm

### Reusable Encryption Utilities

- **Detail:** Create general-purpose encryption utilities in `src/lib/encryption.ts` that can be used across the application
- **Rationale:**
  - Not limited to API keys - can encrypt any sensitive string data
  - Promotes DRY principle - single source of truth for encryption
  - Consistent encryption approach across the application
  - Easy to maintain and update encryption logic in one place
  - Future-proof for other features requiring encryption (OAuth tokens, secrets, PII)
  - Well-documented with examples for different use cases
  - Can be extended with additional features (key versioning, rotation)

### Model Selection UI

- **Detail:** Modal dialog with two tabs: "API Keys" and "Model Selection"
- **Rationale:**
  - Separates key management from model selection
  - Makes it clear when personal keys are required
  - Easy to extend with more providers and models later

### Model Options

- **Detail:** Simple model list showing:
  - Haiku (platform key) - always available
  - Haiku (personal key) - available only if personal key saved
- **Rationale:**
  - Keeps it simple for MVP
  - Easy to add more models (Sonnet, Opus) later
  - Clear indication of which key will be used

### Key Scope

- **Detail:** Keys are per-user, not per-project
- **Rationale:**
  - Users typically use the same API key across projects
  - Simpler UX - configure once, use everywhere
  - Can be extended to project-level keys later if needed

## Files to Create

### 1. `migrations/0008_add_user_ai_api_keys.sql` (NEW FILE)

**Purpose:** Database migration to add user AI API keys table

**Migration Structure:**

```sql
CREATE TYPE "ai_provider" AS ENUM ('anthropic', 'openai', 'openrouter');

CREATE TABLE "user_ai_api_keys" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "user_id" text NOT NULL REFERENCES "users_sync"("id") ON DELETE CASCADE,
  "provider" "ai_provider" NOT NULL,
  "api_key" text NOT NULL,
  "created_at" timestamp NOT NULL DEFAULT now(),
  "updated_at" timestamp NOT NULL DEFAULT now(),
  UNIQUE("user_id", "provider")
);

CREATE INDEX "user_ai_api_keys_user_id_idx" ON "user_ai_api_keys"("user_id");
```

### 2. `src/components/model-selector-modal.tsx` (NEW FILE)

**Purpose:** Modal dialog for managing API keys and selecting models

**Component Structure:**

```typescript
"use client";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";

interface ModelSelectorModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string;
  accessToken: string;
  selectedModel: ModelSelection;
  onModelSelect: (model: ModelSelection) => void;
}

export type ModelSelection =
  | { provider: "platform"; model: "claude-haiku-4-5" }
  | { provider: "personal"; model: "claude-haiku-4-5" };
```

**Tabs Structure:**

1. **API Keys Tab:**
   - Input for Anthropic API key
   - Save/Update button
   - Status indicator (key saved, not saved)
   - Delete key button
   - Placeholder for future providers (OpenAI, OpenRouter)

2. **Model Selection Tab:**
   - Radio group with model options:
     - Haiku (platform key) - always enabled
     - Haiku (personal key) - enabled only if key saved
   - Apply button to save selection

**Implementation Details:**

1. **State Management:**

   ```typescript
   const [hasPersonalKey, setHasPersonalKey] = useState(false);
   const [apiKeyInput, setApiKeyInput] = useState("");
   const [selectedModelOption, setSelectedModelOption] =
     useState<string>("platform-haiku");
   ```

2. **API Key Management:**
   - Fetch: `GET /api/v1/user/ai-keys?provider=anthropic`
   - Save: `POST /api/v1/user/ai-keys` with `{ provider, apiKey }`
   - Delete: `DELETE /api/v1/user/ai-keys?provider=anthropic`

3. **Model Selection:**
   - Store selection in component state
   - On Apply, call `onModelSelect` callback
   - Close modal

**Dependencies:**

```typescript
import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Alert, AlertDescription } from "@/components/ui/alert";
```

### 3. `src/lib/encryption.ts` (NEW FILE)

**Purpose:** General-purpose encryption/decryption utilities using AES-256-GCM

**Use Cases:**

- Encrypting API keys (Anthropic, OpenAI, etc.)
- Encrypting OAuth tokens and refresh tokens
- Encrypting sensitive user data (PII, credentials, etc.)
- Encrypting any sensitive strings before database storage
- Can be extended for file encryption if needed

**Implementation:**

```typescript
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
```

**Key Generation:**

To generate an encryption key for your environment variables:

```bash
# Using Node.js
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

# Or using the utility function
node -e "console.log(require('./src/lib/encryption').generateEncryptionKey())"
```

**Environment Setup:**

Add to `.env.local` (development) and production environment:

```env
# Generate with: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
# IMPORTANT: Use different keys for dev/staging/production!
ENCRYPTION_KEY=a8f5f167f44f4964e6c998dee827110c36d7f5e9e7b6d9e8f5d6c7e8f9a0b1c2
```

**Security Notes:**

- Each encryption operation generates a random IV (Initialization Vector)
- GCM mode provides authenticated encryption (detects tampering)
- Auth tag ensures data integrity
- Keys are validated before use
- Never log encrypted or decrypted values
- Use different keys for different environments

**Dependencies:**

```typescript
import crypto from "crypto"; // Built-in Node.js module
```

**Usage Examples:**

```typescript
// Example 1: Encrypting API Keys
import { encrypt, decrypt } from "@/lib/encryption";

// Save encrypted API key to database
const userApiKey = "sk-ant-api-key-123";
const encryptedKey = encrypt(userApiKey);
await db.insert(apiKeysTable).values({
  userId: user.id,
  apiKey: encryptedKey,
});

// Retrieve and decrypt API key
const record = await db.query.apiKeysTable.findFirst({
  where: eq(apiKeysTable.userId, user.id),
});
const decryptedKey = decrypt(record.apiKey);

// Example 2: Encrypting OAuth Tokens
const oauthToken = "ya29.a0AfH6SMBx...";
const encryptedToken = encrypt(oauthToken);
await db.insert(oauthTokensTable).values({
  userId: user.id,
  accessToken: encryptedToken,
});

// Example 3: Encrypting Database Credentials
const dbConnectionString = "postgresql://user:pass@host:5432/db";
const encryptedConnString = encrypt(dbConnectionString);
await db.insert(projectsTable).values({
  projectId: project.id,
  connectionString: encryptedConnString,
});

// Example 4: Encrypting Sensitive User Data
const ssn = "123-45-6789";
const encryptedSSN = encrypt(ssn);
await db
  .update(usersTable)
  .set({ socialSecurityNumber: encryptedSSN })
  .where(eq(usersTable.id, user.id));
```

**Best Practices:**

1. **Always encrypt before storing:** Never store sensitive data in plain text
2. **Decrypt only when needed:** Minimize time sensitive data is in memory
3. **Use different keys per environment:** Dev, staging, and production should have unique keys
4. **Rotate keys periodically:** Plan for key rotation strategy (see Future Enhancements)
5. **Never log sensitive data:** Don't log encrypted or decrypted values
6. **Handle errors gracefully:** Wrap decrypt calls in try-catch for tampered data detection
7. **Use for any sensitive strings:** Passwords, tokens, secrets, PII, credentials

### 4. `src/app/api/v1/user/ai-keys/route.ts` (NEW FILE)

**Purpose:** API routes for managing user AI API keys

**Handler Signatures:**

```typescript
// GET - Check if user has an API key for a provider (returns boolean only)
export async function GET(request: Request): Promise<Response>;

// POST - Save or update user's API key (encrypts before storing)
export async function POST(request: Request): Promise<Response>;

// DELETE - Remove user's API key for a provider
export async function DELETE(request: Request): Promise<Response>;
```

**Implementation Structure:**

1. **GET Handler (Check Key Exists):**

   ```typescript
   export async function GET(request: Request) {
     const user = await stackServerApp.getUser();
     if (!user)
       return Response.json({ error: "Unauthorized" }, { status: 401 });

     const { searchParams } = new URL(request.url);
     const provider = searchParams.get("provider");

     // Query database for user's key
     const key = await db.query.userAiApiKeysTable.findFirst({
       where: (keys, { eq, and }) =>
         and(eq(keys.userId, user.id), eq(keys.provider, provider)),
     });

     // Only return boolean - never expose the actual key
     return Response.json({
       hasKey: !!key,
       provider,
     });
   }
   ```

   **Note:** For retrieving the actual decrypted key for use in API calls, add a separate internal function:

   ```typescript
   /**
    * Internal helper to get decrypted API key for a user
    * DO NOT expose this via HTTP endpoint
    */
   export async function getDecryptedApiKey(
     userId: string,
     provider: string,
   ): Promise<string | null> {
     const key = await db.query.userAiApiKeysTable.findFirst({
       where: (keys, { eq, and }) =>
         and(eq(keys.userId, userId), eq(keys.provider, provider)),
     });

     if (!key) return null;

     // Decrypt before returning
     return decrypt(key.apiKey);
   }
   ```

2. **POST Handler:**

   ```typescript
   export async function POST(request: Request) {
     const user = await stackServerApp.getUser();
     if (!user)
       return Response.json({ error: "Unauthorized" }, { status: 401 });

     const { provider, apiKey } = await request.json();

     // Validate API key format
     if (!apiKey || !provider) {
       return Response.json({ error: "Invalid request" }, { status: 400 });
     }

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
   }
   ```

3. **DELETE Handler:**

   ```typescript
   export async function DELETE(request: Request) {
     const user = await stackServerApp.getUser();
     if (!user)
       return Response.json({ error: "Unauthorized" }, { status: 401 });

     const { searchParams } = new URL(request.url);
     const provider = searchParams.get("provider");

     await db
       .delete(userAiApiKeysTable)
       .where(
         and(
           eq(userAiApiKeysTable.userId, user.id),
           eq(userAiApiKeysTable.provider, provider),
         ),
       );

     return Response.json({ success: true });
   }
   ```

**Dependencies:**

```typescript
import { stackServerApp } from "@/lib/stack/server";
import { db } from "@/lib/db/db";
import { userAiApiKeysTable } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { encrypt, decrypt } from "@/lib/encryption";
```

## Files to Modify

### 4. `src/lib/db/schema.ts`

**Changes:**

- **Add:** AI provider enum and user AI API keys table definition

```typescript
// Add after existing imports
export const aiProviderEnum = pgEnum("ai_provider", [
  "anthropic",
  "openai",
  "openrouter",
]);

// Add after projectSecretsTable
export const userAiApiKeysTable = pgTable("user_ai_api_keys", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: text("user_id")
    .notNull()
    .references(() => usersTable.id, { onDelete: "cascade" }),
  provider: aiProviderEnum("provider").notNull(),
  apiKey: text("api_key").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at")
    .notNull()
    .$onUpdate(() => new Date()),
});

// Add type exports
export type InsertUserAiApiKey = typeof userAiApiKeysTable.$inferInsert;
export type SelectUserAiApiKey = typeof userAiApiKeysTable.$inferSelect;
export type UserAiApiKey = SelectUserAiApiKey;
```

- **Add:** Index for faster lookups:

```typescript
// In pgTable options (after table definition)
(table) => ({
  userIdIdx: index("user_ai_api_keys_user_id_idx").on(table.userId),
  uniqueUserProvider: unique("user_ai_api_keys_user_provider_unique").on(
    table.userId,
    table.provider,
  ),
});
```

**Keep:**

- All existing table definitions
- All existing type exports
- All existing imports

### 5. `src/components/project-chat.tsx`

**Changes:**

- **Add:** State for model selection and modal control

```typescript
const [modelSelection, setModelSelection] = useState<ModelSelection>({
  provider: "platform",
  model: "claude-haiku-4-5",
});
const [isModelSelectorOpen, setIsModelSelectorOpen] = useState(false);
```

- **Add:** Import and render model selector modal

```typescript
import { ModelSelectorModal } from "@/components/model-selector-modal";

// In render, before AssistantRuntimeProvider
<ModelSelectorModal
  open={isModelSelectorOpen}
  onOpenChange={setIsModelSelectorOpen}
  projectId={projectId}
  accessToken={accessToken}
  selectedModel={modelSelection}
  onModelSelect={setModelSelection}
/>
```

- **Modify:** Transport API URL to include model selection

```typescript
transport: new AssistantChatTransport({
  api: `${process.env.NEXT_PUBLIC_MASTRA_API_URL}?projectId=${projectId}&model=${modelSelection.model}&keyProvider=${modelSelection.provider}`,
  headers: {
    Authorization: `Bearer ${accessToken}`,
  },
}),
```

**Note:** API keys are NOT passed in headers from client to server. Instead, the server will fetch the encrypted key from the database and decrypt it when `keyProvider=personal`.

- **Add:** Model selector button in header (next to ProfileButton)

```typescript
// In header, before ProfileButton
<Button
  variant="outline"
  size="sm"
  onClick={() => setIsModelSelectorOpen(true)}
>
  <span className="mr-2">{modelSelection.model}</span>
  <ChevronDown className="h-4 w-4" />
</Button>
```

**Keep:**

- All existing props and state
- All existing functionality
- All existing imports (add to them)

### 6. `src/mastra/routes/codegen.ts`

**Changes:**

- **Add:** Query param parsing for model and key provider with server-side key retrieval

```typescript
export async function POST(c: ContextWithMastra): Promise<Response> {
  const mastra = c.get("mastra");
  const runtimeContext = c.get("runtimeContext");
  const { messages } = await c.req.json();

  // Parse query params for model selection
  const url = new URL(c.req.url);
  const model = url.searchParams.get("model") || "claude-haiku-4-5";
  const keyProvider = url.searchParams.get("keyProvider") || "platform";

  // Get user info from runtime context
  const user = runtimeContext.get("user") as UserContext;

  // If using personal key, fetch and decrypt it from database
  let apiKey: string | undefined;
  if (keyProvider === "personal" && user) {
    const decryptedKey = await getDecryptedApiKey(user.userId, "anthropic");
    if (!decryptedKey) {
      return Response.json(
        {
          error:
            "Personal API key not found. Please add your Anthropic API key in settings.",
        },
        { status: 400 },
      );
    }
    apiKey = decryptedKey;
  }

  // Add to runtime context
  runtimeContext.set("modelSelection", {
    model,
    keyProvider,
    apiKey, // Only set if using personal key
  });

  console.log(
    `[Codegen] Processing request with ${messages.length} messages, model: ${model}, provider: ${keyProvider}`,
  );

  // ... rest of existing code
}
```

- **Add:** Import for key retrieval helper

```typescript
import { getDecryptedApiKey } from "@/app/api/v1/user/ai-keys/route";
import type { UserContext } from "@/mastra/lib/context";
```

**Keep:**

- All existing error handling
- All existing stream processing
- All existing logging

### 7. `src/mastra/agents/codegenAgent.ts`

**Changes:**

- **Modify:** Model selection to be dynamic based on runtime context

```typescript
model: ({ runtimeContext }: { runtimeContext: RuntimeContext<CodegenRuntimeContext> }) => {
  const modelSelection = runtimeContext.get("modelSelection") as {
    model: string;
    keyProvider: string;
    apiKey?: string;
  } | undefined;

  const modelName = modelSelection?.model || "claude-haiku-4-5";
  const apiKey = modelSelection?.apiKey;

  // If personal key provided, use it
  if (apiKey) {
    return [
      {
        model: anthropic(modelName, { apiKey }),
        maxRetries: 1,
      },
    ];
  }

  // Otherwise use platform key (from env)
  return [
    {
      model: anthropic(modelName),
      maxRetries: 1,
    },
  ];
},
```

- **Add:** Note about model selection in instructions

```typescript
**Current Model Configuration:**
- Model: ${modelSelection?.model || "claude-haiku-4-5"}
- Key Provider: ${modelSelection?.keyProvider || "platform"} ${modelSelection?.apiKey ? "(using your personal API key)" : "(using platform key)"}
```

**Keep:**

- All existing tool configuration
- All existing instructions
- All existing imports

### 8. `src/mastra/lib/context.ts`

**Changes:**

- **Add:** Model selection type to CodegenRuntimeContext

```typescript
export type CodegenRuntimeContext = {
  project: Project;
  user: UserContext;
  modelSelection?: {
    model: string;
    keyProvider: "platform" | "personal";
    apiKey?: string;
  };
};
```

**Keep:**

- All existing context types
- All existing exports

## Directory Structure

```
src/
├── app/
│   └── api/
│       └── v1/
│           └── user/
│               └── ai-keys/
│                   └── route.ts           (NEW FILE - API key management with encryption)
├── components/
│   ├── model-selector-modal.tsx          (NEW FILE - model selector UI)
│   └── project-chat.tsx                  (MODIFY - add model selector)
├── lib/
│   ├── encryption.ts                     (NEW FILE - AES-256-GCM encryption utilities)
│   └── db/
│       └── schema.ts                     (MODIFY - add user_ai_api_keys table)
├── mastra/
│   ├── agents/
│   │   └── codegenAgent.ts               (MODIFY - dynamic model selection)
│   ├── lib/
│   │   └── context.ts                    (MODIFY - add model selection to context)
│   └── routes/
│       └── codegen.ts                    (MODIFY - fetch and decrypt personal keys)
migrations/
└── 0008_add_user_ai_api_keys.sql         (NEW FILE - database migration)
```

## Implementation Flow

```
1. Encryption Setup
   a. Create src/lib/encryption.ts with AES-256-GCM utilities
   b. Generate encryption key: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
   c. Add ENCRYPTION_KEY to .env.local and production environment
   d. Test encryption/decryption with sample data

2. Database Schema Setup
   a. Create migration file with user_ai_api_keys table
   b. Update schema.ts with new table definition
   c. Run migration: bun run db:generate && bun run db:migrate

3. API Routes for Key Management
   a. Create /api/v1/user/ai-keys/route.ts
   b. Implement GET handler (check if user has key)
   c. Implement POST handler (encrypt and save key)
   d. Implement DELETE handler (remove key)
   e. Add getDecryptedApiKey helper for server-side use

4. Model Selector Modal Component
   a. Create model-selector-modal.tsx
   b. Implement API Keys tab with input and save functionality
   c. Implement Model Selection tab with radio group
   d. Add key validation and error handling
   e. Wire up state management and callbacks

4. Integrate Modal into Project Chat
   a. Add state for model selection in project-chat.tsx
   b. Add model selector button in header
   c. Render ModelSelectorModal component
   d. Update transport to include model query params
   e. Add custom API key header when using personal key

5. Backend Integration
   a. Update codegen.ts route to parse model query params
   b. Extract custom API key from headers
   c. Add model selection to runtime context

6. Agent Configuration
   a. Update codegenAgent.ts to read model selection from context
   b. Make model configuration dynamic based on key provider
   c. Use custom API key when provided
   d. Update instructions to show current model config

7. Testing
   a. Test key save/delete flows
   b. Test model selection with platform key
   c. Test model selection with personal key
   d. Test error handling for invalid keys
   e. Test switching between keys mid-conversation
```

## Model Selection UI Details

### API Keys Tab

```
┌─────────────────────────────────────────┐
│ API Keys    Model Selection             │
├─────────────────────────────────────────┤
│                                         │
│  Anthropic API Key                      │
│  ┌─────────────────────────────────┐   │
│  │ sk-ant-...                      │   │
│  └─────────────────────────────────┘   │
│  ✓ Key saved                            │
│                                         │
│  [Save Key]  [Delete Key]               │
│                                         │
│  ─────────────────────────────────────  │
│                                         │
│  Coming Soon:                           │
│  • OpenAI API Key                       │
│  • OpenRouter API Key                   │
│                                         │
└─────────────────────────────────────────┘
```

### Model Selection Tab

```
┌─────────────────────────────────────────┐
│ API Keys    Model Selection             │
├─────────────────────────────────────────┤
│                                         │
│  Select Model:                          │
│                                         │
│  ○ Haiku (platform key)                 │
│     Always available                    │
│                                         │
│  ○ Haiku (personal key)                 │
│     Requires your Anthropic API key     │
│                                         │
│                                         │
│  [Apply]  [Cancel]                      │
│                                         │
└─────────────────────────────────────────┘
```

## Security Considerations

### API Key Storage

- **MVP:** Store keys as plain text in database
- **Future:** Encrypt keys at rest using industry-standard encryption
- **Access:** Keys only accessible by the user who created them
- **Transmission:** Always use HTTPS for key transmission

### API Key Validation

- **Client-side:** Basic format validation (starts with sk-ant-)
- **Server-side:** Optional test call to Anthropic API to verify key validity
- **Error handling:** Clear error messages for invalid keys

### API Key Exposure

- **Never log:** Ensure API keys are never logged in application logs
- **Never return:** GET endpoint only returns boolean, never the actual key
- **Masked display:** If displaying keys in UI, show only last 4 characters

## Testing Checklist

- [ ] Create database migration and verify table creation
- [ ] Test saving Anthropic API key
- [ ] Test retrieving key status (has key or not)
- [ ] Test deleting API key
- [ ] Test model selector modal opens and closes correctly
- [ ] Test model selection persists during session
- [ ] Test platform key model selection works
- [ ] Test personal key model selection is disabled without saved key
- [ ] Test personal key model selection works with saved key
- [ ] Test switching between platform and personal keys mid-conversation
- [ ] Test invalid API key error handling
- [ ] Test query params are correctly passed to Mastra
- [ ] Test runtime context includes model selection
- [ ] Test agent uses correct model based on selection
- [ ] Test agent uses custom API key when provided
- [ ] Test error messages when personal key quota exceeded
- [ ] Test UI indicates which key is being used
- [ ] Test concurrent requests with different keys

## Future Enhancements

### BYOK Features

- **More Providers:** Add OpenAI and OpenRouter support
- **More Models:** Add Sonnet, Opus, GPT-4, etc. with per-model pricing display
- **Key Testing:** Add "Test Key" button to validate before saving
- **Usage Tracking:** Show usage stats per key (requests, tokens, costs)
- **Project-level Keys:** Allow different keys per project (in addition to user-level)
- **Team Keys:** Share keys across team members with permission management
- **Key Expiry:** Add expiration dates for keys with automatic notifications
- **Audit Log:** Track when keys are added/used/deleted with detailed logging
- **Rate Limiting:** Per-user rate limits for personal keys to prevent abuse
- **Cost Tracking:** Show estimated costs per model/key with budget alerts

### Encryption Infrastructure

- **Encryption Key Rotation:** Implement zero-downtime key rotation strategy:
  - Support multiple active encryption keys simultaneously
  - Add key versioning (store key version with encrypted data)
  - Background job to re-encrypt data with new key
  - Graceful migration path when rotating keys
- **Hardware Security Module (HSM):** Integrate with AWS KMS or Google Cloud KMS for enterprise
- **Field-level Encryption:** Extend encryption utilities to support encrypting JSON fields
- **Audit Trail:** Log all encryption/decryption operations for compliance
- **Key Access Control:** Fine-grained permissions for who can decrypt what data
- **Multi-tenant Key Isolation:** Separate encryption keys per organization/tenant
- **Backup Key Recovery:** Secure key backup and recovery procedures

## Notes

### Implementation Details

- Model selection is per-session (stored in React state), not persisted in database
- Users can switch models/keys at any time during a conversation
- Platform key remains the default to ensure seamless onboarding
- Personal keys are completely optional - platform key always works
- UI is designed to be extensible for future providers and models
- API key management is user-scoped, not project-scoped

### Security

- **API keys are encrypted at rest** using AES-256-GCM encryption
- Encryption utilities in `src/lib/encryption.ts` are reusable across features
- Keys are never transmitted to the client - server-side fetch and decrypt only
- ENCRYPTION_KEY environment variable must be set in all environments
- Use different encryption keys for dev/staging/production

### Testing & Deployment

- Test with actual Anthropic keys during development
- Ensure error messages are user-friendly when keys are invalid/expired
- Document the feature in user-facing docs once implemented
- Generate and securely store ENCRYPTION_KEY before deployment
- Verify encryption/decryption works correctly before going live

### Reusability

- The encryption utilities can be used for other sensitive data:
  - OAuth tokens and refresh tokens
  - Database connection strings
  - User PII and credentials
  - Any sensitive string data
- See "Usage Examples" section in encryption utilities for patterns
