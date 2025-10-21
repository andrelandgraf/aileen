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
      accessToken={accessToken}
    />
  );
}
