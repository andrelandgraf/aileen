"use server";

import invariant from "tiny-invariant";
import { waitForOperationsToSettle } from "./operations";

export async function applySnapshot(
  neonProjectId: string,
  snapshotId: string,
  targetBranchId: string,
): Promise<void> {
  console.log("Applying snapshot", snapshotId);
  const apiKey = process.env.NEON_API_KEY;
  invariant(apiKey, "NEON_API_KEY is required");

  const res = await fetch(
    `https://console.neon.tech/api/v2/projects/${neonProjectId}/snapshots/${snapshotId}/restore`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
        Accept: "application/json",
      },
      // One-step restore with finalize to move computes so connection remains intact
      body: JSON.stringify({
        name: `restored_${Date.now()}`,
        finalize_restore: true,
        target_branch_id: targetBranchId,
      }),
      cache: "no-store",
    },
  );

  if (!res.ok) {
    const text = await res.text();
    throw new Error(
      `Failed to apply snapshot ${snapshotId}: ${res.status} ${text}`,
    );
  }

  const json = (await res.json()) as unknown as {
    operations?: Array<{ id?: string; status?: string; action?: string }>;
  };
  // All three operations:
  // - timeline_unarchive
  // - create_branch
  // - suspend_compute
  // need to be settled before the snapshot is fully restored.
  const operationIds = (json.operations ?? [])
    .map((op) => op.id)
    .filter((id): id is string => typeof id === "string" && id.length > 0);

  if (operationIds.length > 0) {
    console.log("Waiting for operations to settle", operationIds);
    const results = await waitForOperationsToSettle(
      neonProjectId,
      operationIds,
      {
        onUpdate: ({ operationId, status }) =>
          console.log(`Operation ${operationId} -> ${status}`),
      },
    );
    console.log("Operations settled", results);
  } else {
    console.log("No operations returned from restore response");
  }
}
