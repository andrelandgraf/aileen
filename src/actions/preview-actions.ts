"use server";

import { stackServerApp } from "@/lib/stack/server";
import { db } from "@/lib/db/db";
import { projectsTable } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { getNeonConnectionUri } from "@/lib/neon/connection-uri";
import { freestyleService } from "@/lib/freestyle";

export async function requestDevServer({
  repoId,
  projectId,
}: {
  repoId: string;
  projectId: string;
}) {
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

  // Get the database connection URI
  const databaseUrl = await getNeonConnectionUri({
    projectId: project.neonProjectId,
  });

  // Request dev server using the freestyle service
  const devServerResponse = await freestyleService.requestDevServer({
    repoId,
    envVars: {
      DATABASE_URL: databaseUrl,
    },
  });

  console.log("[Preview Actions] Dev server response:", devServerResponse);
  return {
    ephemeralUrl: devServerResponse.ephemeralUrl,
    devCommandRunning: devServerResponse.devCommandRunning,
    installCommandRunning: devServerResponse.installCommandRunning,
  };
}
