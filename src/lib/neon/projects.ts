"use server";

import invariant from "tiny-invariant";
import { waitForOperationsToSettle } from "./operations";

type CreateProjectResponse = {
  project?: { id?: string; name?: string };
  id?: string;
  connection_uris?: Array<{
    connection_uri?: string;
  }>;
  operations?: Array<{ id?: string }>;
};

export async function createNeonProject(
  name: string,
): Promise<{ neonProjectId: string; databaseUrl: string }> {
  console.log("[Neon] Creating project with name:", name);

  const apiKey = process.env.NEON_API_KEY;
  invariant(apiKey, "NEON_API_KEY is required");

  // Debug: Verify API key is loaded (show first/last 4 chars only)
  console.log(
    "[Neon] API key loaded:",
    apiKey
      ? `${apiKey.substring(0, 4)}...${apiKey.substring(apiKey.length - 4)}`
      : "NOT SET",
  );
  console.log("[Neon] API key length:", apiKey?.length);

  const requestBody = { project: { name } };
  console.log("[Neon] Request body:", JSON.stringify(requestBody, null, 2));

  const res = await fetch("https://console.neon.tech/api/v2/projects", {
    method: "POST",
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(requestBody),
    cache: "no-store",
  });

  console.log("[Neon] Response status:", res.status);

  if (!res.ok) {
    const text = await res.text();
    console.error("[Neon] Error response:", text);
    throw new Error(`Failed to create Neon project: ${res.status} ${text}`);
  }

  const json = (await res.json()) as CreateProjectResponse;
  console.log("[Neon] Success! Response data:", JSON.stringify(json, null, 2));

  const neonProjectId = json.project?.id ?? json.id;
  invariant(neonProjectId, "Neon project id missing in create response");
  console.log("[Neon] Extracted project ID:", neonProjectId);

  const databaseUrl = json.connection_uris?.[0]?.connection_uri;
  invariant(databaseUrl, "Database URL missing in create response");
  console.log("[Neon] Database URL:", databaseUrl);

  // Wait for control-plane operations (e.g., start compute, create timeline) to complete
  const opIds = (json.operations ?? [])
    .map((o) => o.id)
    .filter((id): id is string => typeof id === "string" && id.length > 0);
  if (opIds.length > 0) {
    console.log("[Neon] Waiting for operations to settle:", opIds);
    await waitForOperationsToSettle(neonProjectId, opIds);
    console.log("[Neon] Operations completed");
  }

  return { neonProjectId, databaseUrl };
}

export async function deleteNeonProject(neonProjectId: string): Promise<void> {
  const apiKey = process.env.NEON_API_KEY;
  invariant(apiKey, "NEON_API_KEY is required");
  const url = `https://console.neon.tech/api/v2/projects/${neonProjectId}`;
  const res = await fetch(url, {
    method: "DELETE",
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    cache: "no-store",
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(
      `Failed to delete Neon project ${neonProjectId}: ${res.status} ${text}`,
    );
  }
}
