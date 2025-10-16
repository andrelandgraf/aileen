"use server";

import invariant from "tiny-invariant";

type ConnectionUriResponse = {
  uri?: string;
};

type GetConnectionUriParams = {
  projectId: string;
  branchId?: string;
  databaseName?: string;
  roleName?: string;
  endpointId?: string;
  pooled?: boolean;
};

export async function getNeonConnectionUri({
  projectId,
  branchId,
  databaseName = "neondb",
  roleName = "neondb_owner",
  endpointId,
  pooled,
}: GetConnectionUriParams): Promise<string> {
  console.log("[Neon] Getting connection URI for project:", projectId, {
    branchId,
    databaseName,
    roleName,
    endpointId,
    pooled,
  });

  const apiKey = process.env.NEON_API_KEY;
  invariant(apiKey, "NEON_API_KEY is required");

  // Build query parameters with defaults
  const queryParams = new URLSearchParams();
  if (branchId) queryParams.append("branch_id", branchId);
  queryParams.append("database_name", databaseName);
  queryParams.append("role_name", roleName);
  if (endpointId) queryParams.append("endpoint_id", endpointId);
  if (pooled !== undefined) queryParams.append("pooled", String(pooled));

  const queryString = queryParams.toString();
  const url = `https://console.neon.tech/api/v2/projects/${projectId}/connection_uri${queryString ? `?${queryString}` : ""}`;

  console.log("[Neon] Request URL:", url);

  const res = await fetch(url, {
    method: "GET",
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    cache: "no-store",
  });

  console.log("[Neon] Response status:", res.status);

  if (!res.ok) {
    const text = await res.text();
    console.error("[Neon] Error response:", text);
    throw new Error(
      `Failed to get connection URI for project ${projectId}: ${res.status} ${text}`,
    );
  }

  const json = (await res.json()) as ConnectionUriResponse;
  console.log("[Neon] Connection URI response:", JSON.stringify(json, null, 2));

  const connectionUri = json.uri;
  invariant(connectionUri, "Connection URI missing in response");

  return connectionUri;
}
