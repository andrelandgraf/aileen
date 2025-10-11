"use server";

import invariant from "tiny-invariant";

export type Branch = {
  id: string;
  name?: string;
  created_at?: string;
  parent_id?: string;
};

type BranchContainer = {
  id?: string;
  name?: string;
  created_at?: string;
  parent_id?: string;
  branch?: {
    id?: string;
    name?: string;
    created_at?: string;
    parent_id?: string;
  };
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isBranchContainer(value: unknown): value is BranchContainer {
  if (!isRecord(value)) return false;

  const record = value as Record<string, unknown>;

  const hasValidOptionalString = (key: string) =>
    record[key] === undefined || typeof record[key] === "string";

  const branch = record["branch"];
  const branchOk =
    branch === undefined ||
    (isRecord(branch) &&
      ["id", "name", "created_at", "parent_id"].every(
        (k) => branch[k] === undefined || typeof branch[k] === "string",
      ));

  return (
    ["id", "name", "created_at", "parent_id"].every(hasValidOptionalString) &&
    branchOk
  );
}

function extractBranchContainers(input: unknown): BranchContainer[] {
  if (Array.isArray(input)) {
    return input.filter(isBranchContainer);
  }

  if (!isRecord(input)) return [];

  const container = input as Record<string, unknown>;
  const candidatesKeys = ["branches", "items", "data"] as const;
  for (const key of candidatesKeys) {
    const maybe = container[key];
    if (Array.isArray(maybe)) {
      return maybe.filter(isBranchContainer);
    }
  }
  return [];
}

function normalizeBranch(container: BranchContainer): {
  id?: string;
  name?: string;
  created_at?: string;
  parent_id?: string;
} {
  return {
    id: container.id ?? container.branch?.id,
    name: container.name ?? container.branch?.name,
    created_at: container.created_at ?? container.branch?.created_at,
    parent_id: container.parent_id ?? container.branch?.parent_id,
  };
}

function isBranch(value: unknown): value is Branch {
  if (!isRecord(value)) return false;
  const v = value as Record<string, unknown>;
  const idOk = typeof v.id === "string";
  const optionalStringsOk = ["name", "created_at", "parent_id"].every(
    (k) => v[k] === undefined || typeof v[k] === "string",
  );
  return idOk && optionalStringsOk;
}

export async function getAllBranches(neonProjectId: string): Promise<Branch[]> {
  const apiKey = process.env.NEON_API_KEY;
  invariant(apiKey, "NEON_API_KEY is required");

  const url = `https://console.neon.tech/api/v2/projects/${neonProjectId}/branches`;
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
    throw new Error(`Failed to list branches: ${res.status} ${text}`);
  }

  const json: unknown = await res.json();
  const items: BranchContainer[] = extractBranchContainers(json);
  const normalized = items.map(normalizeBranch).filter(isBranch);
  return normalized;
}

export async function getProductionBranch(
  neonProjectId: string,
): Promise<Branch | undefined> {
  const branches = await getAllBranches(neonProjectId);
  console.log(
    "[neon] getProductionBranch: searching for 'main' (fallback 'production')",
    { neonProjectId, available: branches.map((b) => b.name || b.id) },
  );
  return (
    branches.find((b) => b.name === "main") ??
    branches.find((b) => b.name === "production")
  );
}

export { getProductionBranch as default };
