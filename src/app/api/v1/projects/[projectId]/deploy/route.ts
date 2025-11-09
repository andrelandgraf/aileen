import { NextResponse } from "next/server";
import { stackServerApp } from "@/lib/stack/server";
import { db } from "@/lib/db/db";
import { projectsTable, projectSecretsTable } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { FreestyleSandboxes } from "freestyle-sandboxes";
import { neonService } from "@/lib/neon";
import { generateDeploymentUrl } from "@/lib/freestyle";
import { decrypt } from "@/lib/encryption";
import { mainConfig } from "@/lib/config";

interface RouteParams {
  params: Promise<{
    projectId: string;
  }>;
}

const freestyle = new FreestyleSandboxes({
  apiKey: mainConfig.freestyle.apiKey,
});

export async function POST(req: Request, { params }: RouteParams) {
  try {
    const { projectId } = await params;

    console.log("[Deploy API] POST - Triggering deployment for:", projectId);

    // Verify user authentication
    const user = await stackServerApp.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Fetch project from database
    const [project] = await db
      .select()
      .from(projectsTable)
      .where(
        and(eq(projectsTable.id, projectId), eq(projectsTable.userId, user.id)),
      )
      .limit(1);

    if (!project) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }

    // Validate that the project has a current dev version
    if (!project.currentDevVersionId) {
      return NextResponse.json(
        { error: "No current version found. Please create a version first." },
        { status: 400 },
      );
    }

    // Generate deployment URL
    const { domain: customDomain, url: deploymentUrl } = generateDeploymentUrl(
      project.name,
      user.displayName || user.id,
    );

    console.log("[Deploy API] Deploying to domain:", customDomain);

    // Whitelist the deployment URL in Neon Auth
    console.log(
      "[Deploy API] Whitelisting domain in Neon Auth:",
      deploymentUrl,
    );
    try {
      await neonService.addAuthDomain(project.neonProjectId, deploymentUrl);
      console.log("[Deploy API] Domain whitelisted successfully");
    } catch (error) {
      console.error("[Deploy API] Failed to whitelist domain:", error);
      // Continue with deployment even if whitelisting fails
    }

    // Get the database connection URI
    const databaseUrl = await neonService.getConnectionUri({
      projectId: project.neonProjectId,
    });

    // Fetch secrets for the current dev version
    console.log(
      "[Deploy API] Fetching secrets for version:",
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
      return NextResponse.json(
        { error: "No secrets found for current dev version" },
        { status: 400 },
      );
    }

    // Decrypt and parse secrets
    const decryptedJson = decrypt(currentDevSecrets.secrets);
    const secretsData: Record<string, string> = JSON.parse(decryptedJson);

    // Trigger deployment (async - don't await)
    freestyle
      .deployWeb(
        {
          kind: "git",
          url: `https://git.freestyle.sh/${project.repoId}`,
        },
        {
          domains: [customDomain],
          envVars: secretsData,
          build: {
            envVars: secretsData,
          },
        },
      )
      .then(() => {
        console.log("[Deploy API] Deployment completed for:", projectId);
      })
      .catch((error) => {
        console.error("[Deploy API] Deployment failed:", error);
      });

    return NextResponse.json({
      message: "Deployment triggered",
      domain: customDomain,
      url: deploymentUrl,
    });
  } catch (error) {
    console.error("[Deploy API] Error:", error);
    return NextResponse.json(
      {
        error: "Failed to trigger deployment",
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 },
    );
  }
}

export async function GET(req: Request, { params }: RouteParams) {
  try {
    const { projectId } = await params;

    console.log(
      "[Deploy API] GET - Checking deployment status for:",
      projectId,
    );

    // Verify user authentication
    const user = await stackServerApp.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Fetch project from database
    const [project] = await db
      .select()
      .from(projectsTable)
      .where(
        and(eq(projectsTable.id, projectId), eq(projectsTable.userId, user.id)),
      )
      .limit(1);

    if (!project) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }

    // Generate deployment URL
    const { domain: customDomain, url: deploymentUrl } = generateDeploymentUrl(
      project.name,
      user.displayName || user.id,
    );

    console.log("[Deploy API] Deployment URL:", deploymentUrl);

    return NextResponse.json({
      domain: customDomain,
      url: deploymentUrl,
      status: "deployed",
    });
  } catch (error) {
    console.error("[Deploy API] Error:", error);
    return NextResponse.json(
      {
        error: "Failed to get deployment status",
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 },
    );
  }
}
