"use server";

import { stackServerApp } from "@/lib/stack/server";
import { db } from "@/lib/db/db";
import { projectsTable } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { requestDevServer as requestDevServerService } from "@/lib/dev-server";

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
