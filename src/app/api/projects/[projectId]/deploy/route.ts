import { NextResponse } from "next/server";
import { stackServerApp } from "@/lib/stack/server";
import { db } from "@/lib/db/db";
import { projectsTable } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { FreestyleSandboxes } from "freestyle-sandboxes";

interface RouteParams {
  params: Promise<{
    projectId: string;
  }>;
}

const freestyle = new FreestyleSandboxes({
  apiKey: process.env.FREESTYLE_API_KEY!,
});

// Helper function to create custom domain
const sanitizeDomain = (str: string) =>
  str
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");

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

    // Create custom domain
    const projectSlug = sanitizeDomain(project.name);
    const userSlug = sanitizeDomain(user.displayName || user.id);
    const customDomain = `${projectSlug}-${userSlug}.style.dev`;

    console.log("[Deploy API] Deploying to domain:", customDomain);

    // Trigger deployment (async - don't await)
    freestyle
      .deployWeb(
        {
          kind: "git",
          url: `https://git.freestyle.sh/${project.repoId}`,
        },
        {
          domains: [customDomain],
          envVars: {},
          build: true,
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

    // Create custom domain
    const projectSlug = sanitizeDomain(project.name);
    const userSlug = sanitizeDomain(user.displayName || user.id);
    const customDomain = `${projectSlug}-${userSlug}.style.dev`;
    const deploymentUrl = `https://${customDomain}`;

    console.log("[Deploy API] Deployment URL:", deploymentUrl);

    // Return deployment info
    // Note: Deployment status tracking could be added in the future
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
