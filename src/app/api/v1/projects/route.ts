import { NextResponse } from "next/server";
import { stackServerApp } from "@/lib/stack/server";
import { db } from "@/lib/db/db";
import { projectsTable } from "@/lib/db/schema";
import { freestyleService } from "@/lib/freestyle";
import { createAssistantThread } from "@/lib/assistant-ui";
import { neonService } from "@/lib/neon";
import { revalidatePath } from "next/cache";
import { start } from "workflow/api";
import { initalizeFirstProjectVersion } from "@/lib/workflows";
import { z } from "zod";
import { parseRequestJson } from "@/lib/parser-utils";

const createProjectSchema = z.object({
  name: z.string().trim().min(1, "Project name is required"),
});

export async function POST(request: Request) {
  try {
    const user = await stackServerApp.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { data, error } = await parseRequestJson(
      request,
      createProjectSchema,
    );
    if (error) {
      return error;
    }
    const { name } = data;

    console.log("[API] Create project request from user:", user.id);
    console.log("[API] Project name:", name);

    // Create repo in Freestyle, Neon project, and AssistantCloud thread in parallel
    console.log(
      "[API] Calling Freestyle, Neon, and AssistantCloud APIs in parallel...",
    );
    const [{ repoId }, { neonProjectId, databaseUrl }, threadId] =
      await Promise.all([
        freestyleService.createRepo({ name }),
        neonService.createProject(name),
        createAssistantThread(user.id, name),
      ]);
    console.log("[API] Freestyle repo created with ID:", repoId);
    console.log("[API] Neon project created with ID:", neonProjectId);
    console.log("[API] Database URL:", databaseUrl);
    console.log("[API] Thread created with ID:", threadId);

    try {
      freestyleService.initializeRawDevServer(repoId);
    } catch (_) {}

    // Create project in database with Freestyle repoId, Neon project ID, and thread ID
    console.log("[API] Inserting project into database...");
    console.log("[API] Insert values:", {
      name,
      repoId,
      neonProjectId,
      threadId,
      userId: user.id,
    });

    const [project] = await db
      .insert(projectsTable)
      .values({
        name,
        repoId,
        neonProjectId,
        threadId,
        userId: user.id,
      })
      .returning();

    console.log("[API] Project created successfully:", project);

    console.log("[API] Triggering Workflow for project initialization...");
    await start(initalizeFirstProjectVersion, [project]);

    revalidatePath("/projects");

    return NextResponse.json(project, { status: 201 });
  } catch (error) {
    console.error("Error creating project:", error);
    return NextResponse.json(
      { error: "Failed to create project" },
      { status: 500 },
    );
  }
}
