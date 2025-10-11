import invariant from "tiny-invariant";

export type OperationStatus =
  | "scheduling"
  | "running"
  | "finished"
  | "failed"
  | "cancelling"
  | "cancelled"
  | "skipped";

export function isTerminalOperationStatus(status: OperationStatus): boolean {
  return (
    status === "finished" || status === "skipped" || status === "cancelled"
  );
}

async function fetchOperationStatus(
  neonProjectId: string,
  operationId: string,
): Promise<OperationStatus> {
  const apiKey = process.env.NEON_API_KEY;
  invariant(apiKey, "NEON_API_KEY is required");

  const url = `https://console.neon.tech/api/v2/projects/${neonProjectId}/operations/${operationId}`;
  const res = await fetch(url, {
    method: "GET",
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    cache: "no-store",
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(
      `Failed to get operation ${operationId}: ${res.status} ${text}`,
    );
  }

  const json = (await res.json()) as unknown as {
    operation?: { status?: OperationStatus };
  };
  const status = json?.operation?.status as OperationStatus | undefined;
  invariant(status, `Operation status missing for ${operationId}`);
  return status;
}

type WaitOptions = {
  pollIntervalMs?: number;
  timeoutMs?: number;
  onUpdate?: (info: { operationId: string; status: OperationStatus }) => void;
};

export async function waitForOperationToSettle(
  neonProjectId: string,
  operationId: string,
  options: WaitOptions = {},
): Promise<OperationStatus> {
  const pollIntervalMs = options.pollIntervalMs ?? 5000;
  const timeoutMs = options.timeoutMs ?? 5 * 60 * 1000; // 5 minutes
  const startedAt = Date.now();
  while (true) {
    const status = await fetchOperationStatus(neonProjectId, operationId);
    options.onUpdate?.({ operationId, status });
    if (isTerminalOperationStatus(status)) return status;
    if (Date.now() - startedAt > timeoutMs) {
      throw new Error(
        `Timed out waiting for operation ${operationId} to settle (last status: ${status})`,
      );
    }
    await new Promise((r) => setTimeout(r, pollIntervalMs));
  }
}

export async function waitForOperationsToSettle(
  neonProjectId: string,
  operationIds: string[],
  options: WaitOptions = {},
): Promise<Record<string, OperationStatus>> {
  const entries = await Promise.all(
    operationIds.map(async (opId) => {
      const status = await waitForOperationToSettle(
        neonProjectId,
        opId,
        options,
      );
      return [opId, status] as const;
    }),
  );
  return Object.fromEntries(entries);
}
