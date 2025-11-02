import invariant from "tiny-invariant";

// Types
export type Branch = {
  id: string;
  name?: string;
  created_at?: string;
  parent_id?: string;
};

export type OperationStatus =
  | "scheduling"
  | "running"
  | "finished"
  | "failed"
  | "cancelling"
  | "cancelled"
  | "skipped";

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

type CreateProjectResponse = {
  project?: { id?: string; name?: string };
  id?: string;
  connection_uris?: Array<{
    connection_uri?: string;
  }>;
  operations?: Array<{ id?: string }>;
};

type InitNeonAuthResponse = {
  auth_provider: string;
  auth_provider_project_id: string;
  pub_client_key: string;
  secret_server_key: string;
  jwks_url: string;
  schema_name: string;
  table_name: string;
};

type AuthDomain = {
  domain: string;
  auth_provider: string;
};

type ListAuthDomainsResponse = {
  domains: AuthDomain[];
};

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

type CreateSnapshotOptions = {
  name?: string;
  timestamp?: string; // RFC 3339; defaults to now
};

type WaitOptions = {
  pollIntervalMs?: number;
  timeoutMs?: number;
  onUpdate?: (info: { operationId: string; status: OperationStatus }) => void;
};

// Helper functions
function isTerminalOperationStatus(status: OperationStatus): boolean {
  return (
    status === "finished" || status === "skipped" || status === "cancelled"
  );
}

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

function isBranch(value: unknown): value is Branch {
  if (!isRecord(value)) return false;
  const v = value as Record<string, unknown>;
  const idOk = typeof v.id === "string";
  const optionalStringsOk = ["name", "created_at", "parent_id"].every(
    (k) => v[k] === undefined || typeof v[k] === "string",
  );
  return idOk && optionalStringsOk;
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

export class NeonService {
  private apiKey: string;
  private baseUrl = "https://console.neon.tech/api/v2";

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  // Projects
  async createProject(
    name: string,
  ): Promise<{ neonProjectId: string; databaseUrl: string }> {
    console.log("[Neon] Creating project with name:", name);

    // Debug: Verify API key is loaded (show first/last 4 chars only)
    console.log(
      "[Neon] API key loaded:",
      this.apiKey
        ? `${this.apiKey.substring(0, 4)}...${this.apiKey.substring(this.apiKey.length - 4)}`
        : "NOT SET",
    );
    console.log("[Neon] API key length:", this.apiKey?.length);

    const requestBody = { project: { name } };
    console.log("[Neon] Request body:", JSON.stringify(requestBody, null, 2));

    const res = await fetch(`${this.baseUrl}/projects`, {
      method: "POST",
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${this.apiKey}`,
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
    console.log(
      "[Neon] Success! Response data:",
      JSON.stringify(json, null, 2),
    );

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
      await this.waitForOperationsToSettle(neonProjectId, opIds);
      console.log("[Neon] Operations completed");
    }

    return { neonProjectId, databaseUrl };
  }

  async initNeonAuth(
    neonProjectId: string,
    branchId: string,
    databaseName = "neondb",
    roleName = "neondb_owner",
  ): Promise<InitNeonAuthResponse> {
    console.log("[Neon] Initializing Neon Auth for project:", neonProjectId);

    const res = await fetch(`${this.baseUrl}/projects/auth/create`, {
      method: "POST",
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        auth_provider: "stack",
        project_id: neonProjectId,
        branch_id: branchId,
        database_name: databaseName,
        role_name: roleName,
      }),
      cache: "no-store",
    });

    console.log("[Neon] Response status:", res.status);

    if (!res.ok) {
      const text = await res.text();
      console.error("[Neon] Error response:", text);
      throw new Error(`Failed to initialize Neon Auth: ${res.status} ${text}`);
    }

    const json = (await res.json()) as InitNeonAuthResponse;
    console.log("[Neon] Neon Auth initialized:", {
      authProvider: json.auth_provider,
      projectId: json.auth_provider_project_id,
    });

    return json;
  }

  async getNeonAuthKeys(
    neonProjectId: string,
    authProvider = "stack",
  ): Promise<InitNeonAuthResponse> {
    console.log(
      "[Neon] Getting Neon Auth keys for project:",
      neonProjectId,
      "provider:",
      authProvider,
    );

    const res = await fetch(`${this.baseUrl}/projects/auth/keys`, {
      method: "POST",
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        auth_provider: authProvider,
        project_id: neonProjectId,
      }),
      cache: "no-store",
    });

    console.log("[Neon] Response status:", res.status);

    if (!res.ok) {
      const text = await res.text();
      console.error("[Neon] Error response:", text);
      throw new Error(`Failed to get Neon Auth keys: ${res.status} ${text}`);
    }

    const json = (await res.json()) as InitNeonAuthResponse;
    console.log("[Neon] Neon Auth keys retrieved");

    return json;
  }

  async listAuthDomains(neonProjectId: string): Promise<AuthDomain[]> {
    console.log("[Neon] Listing auth domains for project:", neonProjectId);

    const res = await fetch(
      `${this.baseUrl}/projects/${neonProjectId}/auth/domains`,
      {
        method: "GET",
        headers: {
          Accept: "application/json",
          Authorization: `Bearer ${this.apiKey}`,
        },
        cache: "no-store",
      },
    );

    console.log("[Neon] Response status:", res.status);

    if (!res.ok) {
      const text = await res.text();
      console.error("[Neon] Error response:", text);
      throw new Error(`Failed to list auth domains: ${res.status} ${text}`);
    }

    const json = (await res.json()) as ListAuthDomainsResponse;

    return json.domains;
  }

  async addAuthDomain(
    neonProjectId: string,
    domain: string,
    authProvider = "stack",
  ): Promise<void> {
    console.log(
      "[Neon] Adding auth domain for project:",
      neonProjectId,
      "domain:",
      domain,
    );

    // Check if domain already exists to prevent duplicates
    try {
      const existingDomains = await this.listAuthDomains(neonProjectId);
      const domainExists = existingDomains.some(
        (d) => d.domain === domain && d.auth_provider === authProvider,
      );

      if (domainExists) {
        console.log("[Neon] Auth domain already exists, skipping add:", domain);
        return;
      }
    } catch (error) {
      console.warn(
        "[Neon] Failed to check existing domains, proceeding with add attempt",
        error,
      );
      // Continue with add attempt even if we can't check existing domains
    }

    const res = await fetch(
      `${this.baseUrl}/projects/${neonProjectId}/auth/domains`,
      {
        method: "POST",
        headers: {
          Accept: "application/json",
          Authorization: `Bearer ${this.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          domain,
          auth_provider: authProvider,
        }),
        cache: "no-store",
      },
    );

    console.log("[Neon] Response status:", res.status);

    if (!res.ok) {
      const text = await res.text();
      console.error("[Neon] Error response:", text);
      throw new Error(`Failed to add auth domain: ${res.status} ${text}`);
    }

    console.log("[Neon] Auth domain added successfully");
  }

  async deleteProject(neonProjectId: string): Promise<void> {
    console.log("[Neon] Deleting project:", neonProjectId);
    const url = `${this.baseUrl}/projects/${neonProjectId}`;
    const res = await fetch(url, {
      method: "DELETE",
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${this.apiKey}`,
      },
      cache: "no-store",
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(
        `Failed to delete Neon project ${neonProjectId}: ${res.status} ${text}`,
      );
    }
    console.log("[Neon] Project deleted successfully");
  }

  // Connection URI
  async getConnectionUri({
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

    // Build query parameters with defaults
    const queryParams = new URLSearchParams();
    if (branchId) queryParams.append("branch_id", branchId);
    queryParams.append("database_name", databaseName);
    queryParams.append("role_name", roleName);
    if (endpointId) queryParams.append("endpoint_id", endpointId);
    if (pooled !== undefined) queryParams.append("pooled", String(pooled));

    const queryString = queryParams.toString();
    const url = `${this.baseUrl}/projects/${projectId}/connection_uri${queryString ? `?${queryString}` : ""}`;

    console.log("[Neon] Request URL:", url);

    const res = await fetch(url, {
      method: "GET",
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${this.apiKey}`,
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
    console.log(
      "[Neon] Connection URI response:",
      JSON.stringify(json, null, 2),
    );

    const connectionUri = json.uri;
    invariant(connectionUri, "Connection URI missing in response");

    return connectionUri;
  }

  // Branches
  async getAllBranches(neonProjectId: string): Promise<Branch[]> {
    console.log("[Neon] Getting all branches for project:", neonProjectId);
    const url = `${this.baseUrl}/projects/${neonProjectId}/branches`;
    const res = await fetch(url, {
      method: "GET",
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${this.apiKey}`,
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
    console.log(
      "[Neon] Found branches:",
      normalized.map((b) => b.name || b.id),
    );
    return normalized;
  }

  async getProductionBranch(
    neonProjectId: string,
  ): Promise<Branch | undefined> {
    const branches = await this.getAllBranches(neonProjectId);
    console.log(
      "[Neon] getProductionBranch: searching for 'main' (fallback 'production')",
      { neonProjectId, available: branches.map((b) => b.name || b.id) },
    );
    return (
      branches.find((b) => b.name === "main") ??
      branches.find((b) => b.name === "production")
    );
  }

  // Snapshots
  async createSnapshot(
    neonProjectId: string,
    options: CreateSnapshotOptions = {},
  ): Promise<string> {
    console.log("[Neon] Creating snapshot for project:", neonProjectId);
    const prodBranch = await this.getProductionBranch(neonProjectId);
    invariant(prodBranch?.id, "Production branch not found");

    const res = await fetch(
      `${this.baseUrl}/projects/${neonProjectId}/branches/${prodBranch.id}/snapshot`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.apiKey}`,
          Accept: "application/json",
        },
        body: JSON.stringify({
          timestamp: options.timestamp ?? new Date().toISOString(),
          name: options.name,
        }),
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
    console.log("[Neon] Snapshot created:", snapshotId);
    return snapshotId;
  }

  async applySnapshot(
    neonProjectId: string,
    snapshotId: string,
    targetBranchId: string,
  ): Promise<void> {
    console.log(
      "[Neon] Applying snapshot",
      snapshotId,
      "to branch",
      targetBranchId,
    );

    const res = await fetch(
      `${this.baseUrl}/projects/${neonProjectId}/snapshots/${snapshotId}/restore`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.apiKey}`,
          Accept: "application/json",
        },
        body: JSON.stringify({
          name: `before_restore_${Date.now()}`,
          finalize_restore: true,
          target_branch_id: targetBranchId,
        }),
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
      console.log("[Neon] Waiting for operations to settle", operationIds);
      const results = await this.waitForOperationsToSettle(
        neonProjectId,
        operationIds,
        {
          onUpdate: ({ operationId, status }) =>
            console.log(`[Neon] Operation ${operationId} -> ${status}`),
        },
      );
      console.log("[Neon] Operations settled", results);
    } else {
      console.log("[Neon] No operations returned from restore response");
    }
  }

  // Operations
  private async fetchOperationStatus(
    neonProjectId: string,
    operationId: string,
  ): Promise<OperationStatus> {
    const url = `${this.baseUrl}/projects/${neonProjectId}/operations/${operationId}`;
    const res = await fetch(url, {
      method: "GET",
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${this.apiKey}`,
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

  async waitForOperationToSettle(
    neonProjectId: string,
    operationId: string,
    options: WaitOptions = {},
  ): Promise<OperationStatus> {
    const pollIntervalMs = options.pollIntervalMs ?? 5000;
    const timeoutMs = options.timeoutMs ?? 5 * 60 * 1000; // 5 minutes
    const startedAt = Date.now();
    while (true) {
      const status = await this.fetchOperationStatus(
        neonProjectId,
        operationId,
      );
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

  async waitForOperationsToSettle(
    neonProjectId: string,
    operationIds: string[],
    options: WaitOptions = {},
  ): Promise<Record<string, OperationStatus>> {
    const entries = await Promise.all(
      operationIds.map(async (opId) => {
        const status = await this.waitForOperationToSettle(
          neonProjectId,
          opId,
          options,
        );
        return [opId, status] as const;
      }),
    );
    return Object.fromEntries(entries);
  }
}

export const neonService = new NeonService(process.env.NEON_API_KEY!);
