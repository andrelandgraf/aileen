import { notFound } from "next/navigation";
import { stackServerApp } from "@/lib/stack/server";
import { db } from "@/lib/db/db";
import { projectsTable } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { ProjectChat } from "@/components/project-chat";
import { generateDeploymentUrl } from "@/lib/freestyle";
import { requestDevServer } from "@/lib/dev-server";

interface ProjectPageProps {
  params: Promise<{
    id: string;
  }>;
}

export default async function ProjectPage({ params }: ProjectPageProps) {
  const { id } = await params;
  const user = await stackServerApp.getUser({ or: "redirect" });

  const [project] = await db
    .select()
    .from(projectsTable)
    .where(and(eq(projectsTable.id, id), eq(projectsTable.userId, user.id)))
    .limit(1);

  if (!project) {
    notFound();
  }

  // Only request dev server if project has a current version initialized
  let codeServerUrl: string | null = null;
  let devServerUrl: string | null = null;

  if (project.currentDevVersionId) {
    console.log("[Project Page] Requesting dev server for preview...");
    console.log("[Project Page] This may take 20-30 seconds on cold start...");

    // Request dev server using the dev-server service
    // This will automatically fetch secrets and allowlist the domain
    const devServerResponse = await requestDevServer(project);

    codeServerUrl = devServerResponse.codeServerUrl;
    devServerUrl = devServerResponse.ephemeralUrl;

    console.log("[Project Page] Dev server ready:", {
      ephemeralUrl: devServerResponse.ephemeralUrl,
      codeServerUrl,
      isNew: devServerResponse.isNew,
    });
  } else {
    console.log(
      "[Project Page] No current version yet, skipping dev server request",
    );
  }

  // Generate deployment URL
  const { url: deploymentUrl } = generateDeploymentUrl(
    project.name,
    user.displayName || user.id,
  );

  console.log("[Project Page] Deployment URL:", deploymentUrl);

  // Get access token to pass to client component
  const authJson = await user.getAuthJson();
  if (!authJson.accessToken) {
    throw new Error("No access token available");
  }
  const accessToken = authJson.accessToken;

  return (
    <ProjectChat
      projectId={id}
      projectName={project.name}
      repoId={project.repoId}
      threadId={project.threadId}
      deploymentUrl={deploymentUrl}
      devServerUrl={devServerUrl}
      codeServerUrl={codeServerUrl}
      accessToken={accessToken}
    />
  );
}
