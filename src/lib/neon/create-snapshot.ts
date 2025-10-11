"use server";

import invariant from "tiny-invariant";
import getProductionBranch from "./branches";

type CreateSnapshotOptions = {
  name?: string;
  timestamp?: string; // RFC 3339; defaults to now
};

export async function createSnapshot(
  neonProjectId: string,
  options: CreateSnapshotOptions = {},
): Promise<string> {
  const apiKey = process.env.NEON_API_KEY;
  invariant(apiKey, "NEON_API_KEY is required");
  const prodBranch = await getProductionBranch(neonProjectId);
  invariant(prodBranch?.id, "Production branch not found");
  const branchId = prodBranch.id;

  const timestamp = options.timestamp ?? new Date().toISOString();

  const res = await fetch(
    `https://console.neon.tech/api/v2/projects/${neonProjectId}/branches/${branchId}/snapshot`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
        Accept: "application/json",
      },
      body: JSON.stringify({
        timestamp,
        name: options.name,
      }),
      cache: "no-store",
    },
  );

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Failed to create snapshot: ${res.status} ${text}`);
  }

  const json = (await res.json()) as unknown as {
    snapshot?: { id?: string };
  } & { id?: string };
  const snapshotId: string | undefined = json?.snapshot?.id ?? json?.id;
  invariant(snapshotId, "Snapshot ID missing in response");
  return snapshotId;
}
