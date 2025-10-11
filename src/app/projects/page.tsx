import { stackServerApp } from "@/lib/stack/server";
import { db } from "@/lib/db/db";
import { projectsTable } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { ProjectsList } from "@/components/projects-list";
import { CreateProjectButton } from "@/components/create-project-button";
import { ProfileButton } from "@/components/profile-button";

export default async function ProjectsPage() {
  const user = await stackServerApp.getUser({ or: "redirect" });

  const projects = await db
    .select()
    .from(projectsTable)
    .where(eq(projectsTable.userId, user.id))
    .orderBy(projectsTable.createdAt);

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="border-b">
        <div className="container flex h-16 items-center justify-between px-4">
          <div className="flex items-center gap-6">
            <h1 className="text-xl font-bold">Aileen</h1>
            <nav className="flex items-center gap-4">
              <span className="text-sm font-medium text-primary">Projects</span>
            </nav>
          </div>
          <div className="flex items-center gap-4">
            <CreateProjectButton />
            <ProfileButton />
          </div>
        </div>
      </header>
      <main className="container flex-1 px-4 py-8">
        <div className="mx-auto max-w-7xl space-y-6">
          <div>
            <h2 className="text-3xl font-bold tracking-tight">Your Projects</h2>
            <p className="mt-2 text-muted-foreground">
              Manage and access all your code generation projects
            </p>
          </div>
          <ProjectsList projects={projects} />
        </div>
      </main>
    </div>
  );
}
