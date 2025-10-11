import { notFound } from "next/navigation";
import { stackServerApp } from "@/lib/stack/server";
import { db } from "@/lib/db/db";
import { projectsTable } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { ProjectChat } from "@/components/project-chat";
import { FreestyleSandboxes } from "freestyle-sandboxes";

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

  // Request dev server to get ephemeral URL for preview
  console.log("[Project Page] Requesting dev server for preview...");
  console.log("[Project Page] This may take 20-30 seconds on cold start...");

  const freestyle = new FreestyleSandboxes({
    apiKey: process.env.FREESTYLE_API_KEY!,
  });

  const devServerResponse = await freestyle.requestDevServer({
    repoId: project.repoId,
  });

  const { ephemeralUrl, codeServerUrl, isNew } = devServerResponse;

  console.log("[Project Page] Dev server ready:", {
    ephemeralUrl,
    codeServerUrl,
    isNew,
  });

  // Create custom domain for deployment URL
  const sanitizeDomain = (str: string) =>
    str
      .toLowerCase()
      .replace(/[^a-z0-9-]/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "");

  const projectSlug = sanitizeDomain(project.name);
  const userSlug = sanitizeDomain(user.displayName || user.id);
  const deploymentDomain = `${projectSlug}-${userSlug}.style.dev`;
  const deploymentUrl = `https://${deploymentDomain}`;

  console.log("[Project Page] Deployment URL:", deploymentUrl);

  return (
    <ProjectChat
      projectId={id}
      projectName={project.name}
      repoId={project.repoId}
      previewUrl={ephemeralUrl}
      deploymentUrl={deploymentUrl}
      codeServerUrl={codeServerUrl}
    />
  );
}
