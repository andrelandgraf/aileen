# Encrypt Project Secrets - Implementation Plan

**Date:** 25-11-04  
**Feature:** Encrypt project secrets at rest using AES-256-GCM encryption

## Problem Statement

Currently, project secrets (environment variables like DATABASE_URL, Stack Auth keys, etc.) are stored as plain text in the `project_secrets` table's JSONB column. This poses a security risk:

- Sensitive credentials are stored unencrypted in the database
- Anyone with database access can read API keys and connection strings
- No protection against database breaches or unauthorized access
- Violates security best practices for credential storage

We need to encrypt all project secrets at rest using the same encryption utilities developed for the BYOK API keys feature.

## Solution Overview

1. **Add Migration Column**: Add `is_encrypted` boolean column (default false) to `project_secrets` table
2. **Reuse Encryption Utils**: Use existing AES-256-GCM encryption from `src/lib/encryption.ts`
3. **Update Insert Operations**: Encrypt secrets before inserting (3 locations in codebase)
4. **Update Read Operations**: Decrypt secrets after reading (2 locations in codebase)
5. **Create Migration Script**: Script to encrypt all existing unencrypted secrets
6. **Future Cleanup**: Remove `is_encrypted` column after all secrets are encrypted

## Implementation Decisions

### Reuse Existing Encryption

- **Detail:** Use the same `encrypt()` and `decrypt()` functions from `src/lib/encryption.ts`
- **Rationale:**
  - Already implements AES-256-GCM with proper security
  - Consistent encryption approach across the application
  - No need to duplicate encryption logic
  - Uses the same `ENCRYPTION_KEY` environment variable

### Add `is_encrypted` Column

- **Detail:** Add boolean column with default `false` to support gradual migration
- **Rationale:**
  - Allows backward compatibility during transition period
  - Can deploy code without breaking existing secrets
  - Enables safe rollout to production
  - Can be removed after all secrets are encrypted

### Encrypt Entire JSONB Object

- **Detail:** Serialize JSONB to string, encrypt the string, store as text
- **Rationale:**
  - Simpler than encrypting individual values
  - Protects all keys and values together
  - Single encryption/decryption operation per record
  - No schema changes to JSONB structure

### Encrypt on Write, Decrypt on Read

- **Detail:** All insert operations encrypt before storing, all read operations decrypt after fetching
- **Rationale:**
  - Data is always encrypted at rest
  - Decryption only happens in memory when needed
  - Minimal performance impact
  - Clear separation of concerns

## Files to Create

### 1. `migrations/0008_add_is_encrypted_to_project_secrets.sql` (NEW FILE)

**Purpose:** Database migration to add `is_encrypted` column

**Migration Structure:**

```sql
-- Add is_encrypted column to project_secrets table
-- Default false for existing records (unencrypted)
ALTER TABLE "project_secrets"
ADD COLUMN "is_encrypted" boolean NOT NULL DEFAULT false;

-- Add index for performance when querying encrypted vs unencrypted
CREATE INDEX "project_secrets_is_encrypted_idx"
ON "project_secrets"("is_encrypted");
```

### 2. `scripts/encrypt-existing-secrets.ts` (NEW FILE)

**Purpose:** One-time script to encrypt all existing unencrypted secrets

**Implementation Structure:**

```typescript
import { db } from "@/lib/db/db";
import { projectSecretsTable } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { encrypt } from "@/lib/encryption";

async function encryptExistingSecrets() {
  console.log("[Encryption Script] Starting encryption of existing secrets...");

  // Fetch all unencrypted secrets
  const unencryptedSecrets = await db
    .select()
    .from(projectSecretsTable)
    .where(eq(projectSecretsTable.isEncrypted, false));

  console.log(
    `[Encryption Script] Found ${unencryptedSecrets.length} unencrypted secret records`,
  );

  let successCount = 0;
  let errorCount = 0;

  for (const secretRecord of unencryptedSecrets) {
    try {
      // Serialize JSONB to string
      const secretsJson = JSON.stringify(secretRecord.secrets);

      // Encrypt the JSON string
      const encryptedSecrets = encrypt(secretsJson);

      // Update record with encrypted data and mark as encrypted
      await db
        .update(projectSecretsTable)
        .set({
          secrets: encryptedSecrets as any, // Type assertion needed for JSONB -> text
          isEncrypted: true,
        })
        .where(eq(projectSecretsTable.id, secretRecord.id));

      successCount++;
      console.log(
        `[Encryption Script] Encrypted secrets for record ${secretRecord.id} (${successCount}/${unencryptedSecrets.length})`,
      );
    } catch (error) {
      errorCount++;
      console.error(
        `[Encryption Script] Failed to encrypt record ${secretRecord.id}:`,
        error,
      );
    }
  }

  console.log(`[Encryption Script] Encryption complete!`);
  console.log(
    `[Encryption Script] Success: ${successCount}, Errors: ${errorCount}`,
  );

  if (errorCount > 0) {
    console.error(
      `[Encryption Script] WARNING: ${errorCount} records failed to encrypt. Review errors above.`,
    );
    process.exit(1);
  }
}

// Run the script
encryptExistingSecrets()
  .then(() => {
    console.log("[Encryption Script] Script completed successfully");
    process.exit(0);
  })
  .catch((error) => {
    console.error("[Encryption Script] Script failed:", error);
    process.exit(1);
  });
```

**Usage:**

```bash
# Run the encryption script
bun run scripts/encrypt-existing-secrets.ts

# After verifying all secrets are encrypted, can drop the column later:
# ALTER TABLE "project_secrets" DROP COLUMN "is_encrypted";
```

## Files to Modify

### 3. `src/lib/db/schema.ts`

**Changes:**

- **Add:** `isEncrypted` column to `projectSecretsTable`

```typescript
export const projectSecretsTable = pgTable("project_secrets", {
  id: uuid("id").primaryKey().defaultRandom(),
  projectVersionId: uuid("project_version_id")
    .notNull()
    .references(() => projectVersionsTable.id),
  secrets: jsonb("secrets").notNull().$type<Record<string, string>>(),
  isEncrypted: boolean("is_encrypted").notNull().default(false),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});
```

**Keep:**

- All existing table definitions
- All existing type exports
- All existing imports

### 4. `src/lib/steps.ts`

**Changes:**

#### Location 1: `saveProjectSecrets()` function (lines 83-94)

**Add:** Import encryption utilities at top of file:

```typescript
import { encrypt } from "@/lib/encryption";
```

**Replace:** The `saveProjectSecrets` function:

```typescript
export async function saveProjectSecrets(
  versionId: string,
  secrets: Record<string, string>,
) {
  "use step";
  console.log("[Projects] Saving project secrets...");

  // Serialize and encrypt secrets
  const secretsJson = JSON.stringify(secrets);
  const encryptedSecrets = encrypt(secretsJson);

  await db.insert(projectSecretsTable).values({
    projectVersionId: versionId,
    secrets: encryptedSecrets as any, // Type assertion: encrypted string stored as JSONB
    isEncrypted: true,
  });
  console.log("[Projects] Project secrets saved (encrypted)");
}
```

#### Location 2: `copyProjectSecrets()` function (lines 153-175)

**Add:** Import decryption utilities (already imported above):

```typescript
import { encrypt, decrypt } from "@/lib/encryption";
```

**Replace:** The `copyProjectSecrets` function:

```typescript
export async function copyProjectSecrets(
  fromVersionId: string,
  toVersionId: string,
) {
  "use step";
  console.log("[Projects] Copying secrets from version:", fromVersionId);
  const [currentSecrets] = await db
    .select()
    .from(projectSecretsTable)
    .where(eq(projectSecretsTable.projectVersionId, fromVersionId))
    .limit(1);

  if (!currentSecrets) {
    console.warn("[Projects] No secrets found, skipping copy");
    return;
  }

  // Decrypt existing secrets if encrypted
  let secretsData: Record<string, string>;
  if (currentSecrets.isEncrypted) {
    const decryptedJson = decrypt(currentSecrets.secrets as unknown as string);
    secretsData = JSON.parse(decryptedJson);
  } else {
    // Legacy unencrypted secrets
    secretsData = currentSecrets.secrets;
  }

  // Re-encrypt for new version
  const secretsJson = JSON.stringify(secretsData);
  const encryptedSecrets = encrypt(secretsJson);

  await db.insert(projectSecretsTable).values({
    projectVersionId: toVersionId,
    secrets: encryptedSecrets as any,
    isEncrypted: true,
  });
  console.log("[Projects] Secrets copied and encrypted successfully");
}
```

**Keep:**

- All other functions unchanged
- All existing exports
- All existing imports (add to them)

### 5. `src/mastra/lib/tools.ts`

**Changes:**

**Add:** Import encryption utilities at top of file:

```typescript
import { encrypt } from "@/lib/encryption";
```

**Modify:** The `freestyle-commit-and-push` tool execution (lines 304-316):

Find this section:

```typescript
// Get final environment variables from context and store as secrets for the new version
const finalEnvVars = runtimeContext.get("environmentVariables") || {};
console.log(
  `[freestyle-commit-and-push] Storing ${Object.keys(finalEnvVars).length} environment variables for version ${version.id}...`,
);
await db.insert(projectSecretsTable).values({
  projectVersionId: version.id,
  secrets: finalEnvVars,
});
console.log(
  `[freestyle-commit-and-push] Stored secrets for version ${version.id}`,
);
```

**Replace with:**

```typescript
// Get final environment variables from context and store as secrets for the new version
const finalEnvVars = runtimeContext.get("environmentVariables") || {};
console.log(
  `[freestyle-commit-and-push] Storing ${Object.keys(finalEnvVars).length} environment variables for version ${version.id}...`,
);

// Serialize and encrypt secrets
const secretsJson = JSON.stringify(finalEnvVars);
const encryptedSecrets = encrypt(secretsJson);

await db.insert(projectSecretsTable).values({
  projectVersionId: version.id,
  secrets: encryptedSecrets as any,
  isEncrypted: true,
});
console.log(
  `[freestyle-commit-and-push] Stored encrypted secrets for version ${version.id}`,
);
```

**Keep:**

- All other tool definitions
- All existing functionality
- All other imports

### 6. `src/lib/dev-server.ts`

**Changes:**

**Add:** Import decryption utilities at top of file:

```typescript
import { decrypt } from "@/lib/encryption";
```

**Modify:** The secret fetching logic (lines 47-72):

Find this section:

```typescript
// Fetch secrets for the current dev version
console.log(
  "[DevServer] Fetching secrets for version:",
  project.currentDevVersionId,
);
const [currentDevSecrets] = await db
  .select()
  .from(projectSecretsTable)
  .where(eq(projectSecretsTable.projectVersionId, project.currentDevVersionId))
  .limit(1);

if (!currentDevSecrets) {
  throw new Error(
    `No secrets found for current dev version: ${project.currentDevVersionId}`,
  );
}

console.log(
  "[DevServer] Found secrets with",
  Object.keys(currentDevSecrets.secrets).length,
  "environment variables",
);
secrets = currentDevSecrets.secrets;
```

**Replace with:**

```typescript
// Fetch secrets for the current dev version
console.log(
  "[DevServer] Fetching secrets for version:",
  project.currentDevVersionId,
);
const [currentDevSecrets] = await db
  .select()
  .from(projectSecretsTable)
  .where(eq(projectSecretsTable.projectVersionId, project.currentDevVersionId))
  .limit(1);

if (!currentDevSecrets) {
  throw new Error(
    `No secrets found for current dev version: ${project.currentDevVersionId}`,
  );
}

// Decrypt secrets if encrypted
let secretsData: Record<string, string>;
if (currentDevSecrets.isEncrypted) {
  console.log("[DevServer] Decrypting encrypted secrets...");
  const decryptedJson = decrypt(currentDevSecrets.secrets as unknown as string);
  secretsData = JSON.parse(decryptedJson);
} else {
  // Legacy unencrypted secrets
  console.log("[DevServer] Using legacy unencrypted secrets");
  secretsData = currentDevSecrets.secrets;
}

console.log(
  "[DevServer] Found secrets with",
  Object.keys(secretsData).length,
  "environment variables",
);
secrets = secretsData;
```

**Keep:**

- All existing function signatures
- All existing logic flow
- All other imports

### 7. `src/app/api/v1/projects/[projectId]/versions/route.ts`

**Changes:**

**Add:** Import decryption utilities at top of file:

```typescript
import { decrypt } from "@/lib/encryption";
```

**Modify:** The secret fetching logic in POST handler (lines 133-146):

Find this section:

```typescript
// Step 1: Fetch secrets for the version being restored
console.log("[POST Restore Version] Fetching secrets for version...");
const [versionSecrets] = await db
  .select()
  .from(projectSecretsTable)
  .where(eq(projectSecretsTable.projectVersionId, versionId))
  .limit(1);
if (!versionSecrets) {
  return NextResponse.json(
    { error: "Version secrets not found" },
    { status: 404 },
  );
}
```

**Replace with:**

```typescript
// Step 1: Fetch secrets for the version being restored
console.log("[POST Restore Version] Fetching secrets for version...");
const [versionSecrets] = await db
  .select()
  .from(projectSecretsTable)
  .where(eq(projectSecretsTable.projectVersionId, versionId))
  .limit(1);
if (!versionSecrets) {
  return NextResponse.json(
    { error: "Version secrets not found" },
    { status: 404 },
  );
}

// Decrypt secrets if encrypted
let secretsData: Record<string, string>;
if (versionSecrets.isEncrypted) {
  console.log("[POST Restore Version] Decrypting encrypted secrets...");
  const decryptedJson = decrypt(versionSecrets.secrets as unknown as string);
  secretsData = JSON.parse(decryptedJson);
} else {
  // Legacy unencrypted secrets
  console.log("[POST Restore Version] Using legacy unencrypted secrets");
  secretsData = versionSecrets.secrets;
}
```

**Then update line 151 to use `secretsData` instead of `versionSecrets.secrets`:**

```typescript
// Step 2: Request dev server to get process access (also allowlists domain in Neon Auth)
console.log("[POST Restore Version] Requesting dev server...");
const devServerResponse = await requestDevServer(
  project,
  secretsData, // Changed from versionSecrets.secrets
);
```

**Keep:**

- All existing route handlers (GET, POST)
- All existing error handling
- All other imports

## Directory Structure

```
src/
├── app/
│   └── api/
│       └── v1/
│           └── projects/
│               └── [projectId]/
│                   └── versions/
│                       └── route.ts        (MODIFY - decrypt on read)
├── lib/
│   ├── db/
│   │   └── schema.ts                      (MODIFY - add is_encrypted column)
│   ├── dev-server.ts                      (MODIFY - decrypt on read)
│   ├── encryption.ts                      (EXISTING - reuse for secrets)
│   └── steps.ts                           (MODIFY - encrypt on insert, decrypt on copy)
├── mastra/
│   └── lib/
│       └── tools.ts                       (MODIFY - encrypt on insert)
migrations/
├── 0008_add_is_encrypted_to_project_secrets.sql (NEW FILE - add column)
scripts/
└── encrypt-existing-secrets.ts            (NEW FILE - migration script)
```

## Implementation Flow

```
1. Database Schema Update
   a. Create migration file to add is_encrypted column
   b. Update schema.ts with new column definition
   c. Run migration: bun run db:generate && bun run db:migrate

2. Update Write Operations (Encrypt Before Insert)
   a. Update saveProjectSecrets() in src/lib/steps.ts
   b. Update copyProjectSecrets() in src/lib/steps.ts
   c. Update freestyle-commit-and-push tool in src/mastra/lib/tools.ts
   d. Add encrypt() import to all modified files

3. Update Read Operations (Decrypt After Fetch)
   a. Update requestDevServer() in src/lib/dev-server.ts
   b. Update POST handler in src/app/api/v1/projects/[projectId]/versions/route.ts
   c. Add decrypt() import to all modified files
   d. Handle both encrypted and unencrypted secrets (check is_encrypted flag)

4. Testing
   a. Test creating new project (secrets should be encrypted)
   b. Test checkpoint creation (secrets should be encrypted)
   c. Test commit and push (secrets should be encrypted)
   d. Test dev server requests (secrets should decrypt properly)
   e. Test version restore (secrets should decrypt properly)
   f. Test with existing unencrypted secrets (backward compatibility)

5. Production Migration (Future)
   a. Deploy code with backward compatibility
   b. Run encrypt-existing-secrets.ts script to encrypt all existing secrets
   c. Verify all secrets are encrypted (is_encrypted = true)
   d. Create migration to drop is_encrypted column
   e. Remove is_encrypted references from code
```

## Encryption Details

### Data Flow

**Writing Secrets (3 locations):**

```
Plain Object → JSON.stringify() → encrypt() → Store as text (marked is_encrypted=true)
```

**Reading Secrets (2 locations):**

```
Fetch from DB → Check is_encrypted → decrypt() → JSON.parse() → Plain Object
```

### Type Handling

The JSONB column stores encrypted strings with type assertions:

- Storage: `secrets: encryptedSecrets as any`
- Retrieval: `currentSecrets.secrets as unknown as string`

This is necessary because:

1. Schema defines column as `jsonb` for legacy compatibility
2. New encrypted records store strings, not JSON objects
3. TypeScript needs assertions to handle this dual type

### Backward Compatibility

Code handles both encrypted and unencrypted secrets:

```typescript
if (currentSecrets.isEncrypted) {
  // New encrypted format
  const decryptedJson = decrypt(currentSecrets.secrets as unknown as string);
  secretsData = JSON.parse(decryptedJson);
} else {
  // Legacy unencrypted format
  secretsData = currentSecrets.secrets;
}
```

## Testing Checklist

- [ ] Create and run database migration successfully
- [ ] Verify `is_encrypted` column exists with default false
- [ ] Test creating new project - secrets encrypted
- [ ] Test checkpoint creation - secrets encrypted
- [ ] Test commit and push - secrets encrypted
- [ ] Test copying secrets between versions - re-encrypted
- [ ] Test dev server request with encrypted secrets - decrypts properly
- [ ] Test dev server request with unencrypted secrets - works (backward compat)
- [ ] Test version restore with encrypted secrets - decrypts properly
- [ ] Test version restore with unencrypted secrets - works (backward compat)
- [ ] Verify encrypted secrets are not readable in database
- [ ] Test encryption script on test data
- [ ] Verify all secrets marked as encrypted after script runs
- [ ] Test that encryption/decryption adds minimal performance overhead
- [ ] Verify ENCRYPTION_KEY environment variable is set
- [ ] Test error handling when ENCRYPTION_KEY is missing

## Security Considerations

### Key Management

- **Encryption Key:** Uses same `ENCRYPTION_KEY` as API keys
- **Key Storage:** Environment variable, never committed to code
- **Key Rotation:** Future enhancement - would require re-encrypting all secrets
- **Key Backup:** Ensure key is backed up securely (losing key = losing all secrets)

### Data Protection

- **At Rest:** All new secrets encrypted with AES-256-GCM
- **In Transit:** HTTPS for all API calls (already handled by Next.js)
- **In Memory:** Decrypted secrets only exist in memory during processing
- **Logging:** Never log decrypted secrets (review all console.log statements)

### Access Control

- **Database Access:** Encrypted secrets are useless without encryption key
- **Application Access:** Only authenticated users can trigger decryption
- **Service Access:** Dev server receives decrypted secrets (secure channel)

## Future Enhancements

- **Remove is_encrypted Column:** After all secrets are encrypted in production
- **Key Rotation:** Add ability to rotate encryption key and re-encrypt secrets
- **Per-Project Keys:** Option for users to provide their own encryption keys
- **Audit Logging:** Track when secrets are accessed/decrypted
- **Secret Versioning:** Keep history of secret changes
- **Secret Expiry:** Add TTL for temporary secrets
- **Selective Encryption:** Encrypt only sensitive values, not all env vars
- **Performance Monitoring:** Track encryption/decryption overhead

## Notes

- Encryption adds minimal overhead (~1-2ms per operation)
- All new secrets are encrypted automatically after deployment
- Existing secrets remain unencrypted until migration script runs
- Backward compatibility ensures zero-downtime deployment
- `is_encrypted` column is temporary - can be removed after full migration
- Same encryption key is used for both API keys and project secrets
- Test the migration script thoroughly before running in production
- Ensure ENCRYPTION_KEY is set in all environments
- Document the encryption key backup/recovery process
- Consider running encryption script during low-traffic period
- Monitor for any decryption errors after deployment
