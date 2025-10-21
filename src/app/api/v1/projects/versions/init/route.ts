import { NextResponse } from "next/server";
import { stackServerApp } from "@/lib/stack/server";
import { db } from "@/lib/db/db";
import { projectsTable } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { initFirstVersionAfterProjectCreation } from "@/lib/projects";

export async function POST(request: Request) {
  try {
    const user = await stackServerApp.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { projectId } = body;

    console.log("[API] Init project version request from user:", user.id);
    console.log("[API] Project ID:", projectId);

    if (!projectId) {
      return NextResponse.json(
        { error: "Missing required field: projectId" },
        { status: 400 },
      );
    }

    // Verify project exists and belongs to user
    const [project] = await db
      .select()
      .from(projectsTable)
      .where(eq(projectsTable.id, projectId))
      .limit(1);

    if (!project) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }

    if (project.userId !== user.id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // Initialize the first version asynchronously
    console.log("[API] Initializing first version for project:", projectId);
    await initFirstVersionAfterProjectCreation(projectId);
    console.log("[API] First version initialization complete");

    return NextResponse.json({ success: true }, { status: 200 });
  } catch (error) {
    console.error("Error initializing project version:", error);
    return NextResponse.json(
      { error: "Failed to initialize project version" },
      { status: 500 },
    );
  }
}
