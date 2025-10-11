import { notFound } from "next/navigation";
import { stackServerApp } from "@/lib/stack/server";
import { db } from "@/lib/db/db";
import { projectsTable } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { ProjectChat } from "@/components/project-chat";

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

  // Create custom domain for preview
  const sanitizeDomain = (str: string) =>
    str
      .toLowerCase()
      .replace(/[^a-z0-9-]/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "");

  const projectSlug = sanitizeDomain(project.name);
  const userSlug = sanitizeDomain(user.displayName || user.id);
  const customDomain = `${projectSlug}-${userSlug}.style.dev`;
  const deploymentUrl = `https://${customDomain}`;

  console.log("[Project Page] Deployment URL:", deploymentUrl);

  return (
    <ProjectChat
      projectId={id}
      projectName={project.name}
      repoId={project.repoId}
      previewUrl={deploymentUrl}
    />
  );
}
