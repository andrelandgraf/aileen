import type { Project } from "@/lib/db/schema";

/**
 * User context passed through RuntimeContext
 */
export type UserContext = {
  userId: string;
  displayName: string | null;
};

/**
 * Runtime context type for the codegen agent
 */
export type CodegenRuntimeContext = {
  project: Project;
  user: UserContext;
};
