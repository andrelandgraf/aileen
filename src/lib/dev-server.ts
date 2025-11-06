import type { FreestyleDevServer } from "freestyle-sandboxes";
import { db } from "@/lib/db/db";
import { projectSecretsTable, type SelectProject } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { freestyleService } from "./freestyle";
import { neonService } from "./neon";
import { decrypt } from "@/lib/encryption";

/**
 * Request a dev server for a project with automatic secret management
 * and domain allowlisting for Neon Auth.
 *
 * This service:
 * 1. Uses provided environmentVariables OR fetches secrets for the project's current dev version
 * 2. Requests a dev server from Freestyle
 * 3. Allowlists the dev server domain in Neon Auth
 * 4. Returns the dev server response
 *
 * @param project - The project object to request a dev server for
 * @param environmentVariables - Optional environment variables to use instead of fetching from DB
 * @returns The Freestyle dev server response
 * @throws If no current dev version or secrets are found (when environmentVariables not provided)
 */
export async function requestDevServer(
  project: SelectProject,
  environmentVariables?: Record<string, string>,
): Promise<FreestyleDevServer> {
  console.log("[DevServer] Requesting dev server for project:", project.id);

  let secrets: Record<string, string>;

  if (environmentVariables) {
    // Use provided environment variables
    console.log(
      "[DevServer] Using provided environment variables with",
      Object.keys(environmentVariables).length,
      "entries",
    );
    secrets = environmentVariables;
  } else {
    // Validate that the project has a current dev version
    if (!project.currentDevVersionId) {
      throw new Error(
        `No current dev version found for project: ${project.id}`,
      );
    }

    // Fetch secrets for the current dev version
    console.log(
      "[DevServer] Fetching secrets for version:",
      project.currentDevVersionId,
    );
    const [currentDevSecrets] = await db
      .select()
      .from(projectSecretsTable)
      .where(
        eq(projectSecretsTable.projectVersionId, project.currentDevVersionId),
      )
      .limit(1);

    if (!currentDevSecrets) {
      throw new Error(
        `No secrets found for current dev version: ${project.currentDevVersionId}`,
      );
    }

    // Decrypt secrets
    console.log("[DevServer] Decrypting secrets...");
    const decryptedJson = decrypt(currentDevSecrets.secrets);
    const secretsData: Record<string, string> = JSON.parse(decryptedJson);

    console.log(
      "[DevServer] Found secrets with",
      Object.keys(secretsData).length,
      "environment variables",
    );
    secrets = secretsData;
  }

  // Request dev server using the freestyle service
  console.log("[DevServer] Requesting Freestyle dev server...");
  const devServerResponse = await freestyleService.requestDevServer({
    repoId: project.repoId,
    environmentVariables: secrets,
  });

  console.log("[DevServer] Dev server ready:", {
    ephemeralUrl: devServerResponse.ephemeralUrl,
    isNew: devServerResponse.isNew,
  });

  const url = new URL(devServerResponse.ephemeralUrl);
  const domain = `${url.protocol}//${url.host}`;

  console.log("[DevServer] Allowlisting domain in Neon Auth:", domain);
  await neonService.addAuthDomain(project.neonProjectId, domain);
  console.log("[DevServer] Domain allowlisted successfully");

  return devServerResponse;
}
