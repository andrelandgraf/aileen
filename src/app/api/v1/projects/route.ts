import { NextResponse } from "next/server";
import { stackServerApp } from "@/lib/stack/server";
import { db } from "@/lib/db/db";
import { projectsTable } from "@/lib/db/schema";
import { freestyleService } from "@/lib/freestyle";
import { createNeonProject } from "@/lib/neon/projects";

export async function POST(request: Request) {
  try {
    const user = await stackServerApp.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { name } = body;

    console.log("[API] Create project request from user:", user.id);
    console.log("[API] Project name:", name);

    if (!name) {
      return NextResponse.json(
        { error: "Missing required field: name" },
        { status: 400 },
      );
    }

    // Create repo in Freestyle
    console.log("[API] Calling Freestyle API to create repo...");
    const { repoId } = await freestyleService.createRepo({ name });
    console.log("[API] Freestyle repo created with ID:", repoId);

    // Create Neon project
    console.log("[API] Calling Neon API to create project...");
    const { neonProjectId, databaseUrl } = await createNeonProject(name);
    console.log("[API] Neon project created with ID:", neonProjectId);
    console.log("[API] Database URL:", databaseUrl);

    // Create project in database with Freestyle repoId and Neon project ID
    console.log("[API] Inserting project into database...");
    console.log("[API] Insert values:", {
      name,
      repoId,
      neonProjectId,
      userId: user.id,
    });

    const [project] = await db
      .insert(projectsTable)
      .values({
        name,
        repoId,
        neonProjectId,
        userId: user.id,
      })
      .returning();

    console.log("[API] Project created successfully:", project);

    return NextResponse.json(project, { status: 201 });
  } catch (error) {
    console.error("Error creating project:", error);
    return NextResponse.json(
      { error: "Failed to create project" },
      { status: 500 },
    );
  }
}
