"use server";

import { stackServerApp } from "@/lib/stack/server";
import { db } from "@/lib/db/db";
import { projectsTable } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { requestDevServer as requestDevServerService } from "@/lib/dev-server";
import { freestyleService } from "@/lib/freestyle";

export async function requestDevServer({ projectId }: { projectId: string }) {
  // Verify user authentication
  const user = await stackServerApp.getUser({ or: "redirect" });

  // Fetch the project and verify user has access
  const [project] = await db
    .select()
    .from(projectsTable)
    .where(
      and(eq(projectsTable.id, projectId), eq(projectsTable.userId, user.id)),
    )
    .limit(1);

  if (!project) {
    throw new Error(
      `Project not found or you don't have access to it: ${projectId}`,
    );
  }

  console.log(
    "[Preview Actions] Requesting dev server for project:",
    projectId,
  );

  // Request dev server using the dev-server service
  // This will automatically fetch secrets and allowlist the domain
  const devServerResponse = await requestDevServerService(project);

  console.log("[Preview Actions] Dev server response:", devServerResponse);
  return {
    ephemeralUrl: devServerResponse.ephemeralUrl,
    devCommandRunning: devServerResponse.devCommandRunning,
    installCommandRunning: devServerResponse.installCommandRunning,
  };
}

export async function getDevServerUrls({ projectId }: { projectId: string }) {
  // Verify user authentication
  const user = await stackServerApp.getUser({ or: "redirect" });

  // Fetch the project and verify user has access
  const [project] = await db
    .select()
    .from(projectsTable)
    .where(
      and(eq(projectsTable.id, projectId), eq(projectsTable.userId, user.id)),
    )
    .limit(1);

  if (!project) {
    throw new Error(
      `Project not found or you don't have access to it: ${projectId}`,
    );
  }

  console.log(
    "[Preview Actions] Getting dev server URLs for project:",
    projectId,
  );

  // Generate deployment URL
  const { url: deploymentUrl } = freestyleService.generateDeploymentUrl(
    project.name,
    user.displayName || user.id,
  );

  try {
    // Request dev server to get latest URLs
    const devServerResponse = await requestDevServerService(project);

    return {
      devServerUrl: devServerResponse.ephemeralUrl,
      codeServerUrl: devServerResponse.codeServerUrl,
      deploymentUrl,
      devCommandRunning: devServerResponse.devCommandRunning,
      installCommandRunning: devServerResponse.installCommandRunning,
    };
  } catch (error) {
    // If dev server is not available yet, return deployment URL only
    console.log(
      "[Preview Actions] Dev server not available yet, returning deployment URL only",
    );
    return {
      devServerUrl: null,
      codeServerUrl: null,
      deploymentUrl,
      devCommandRunning: false,
      installCommandRunning: false,
    };
  }
}
