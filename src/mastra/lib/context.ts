/**
 * Project context passed through RuntimeContext
 */
export type ProjectContext = {
  projectId: string;
  projectName: string;
  neonProjectId: string;
  repoId: string;
  userId: string;
};

/**
 * Runtime context type for the codegen agent
 */
export type CodegenRuntimeContext = {
  project: ProjectContext;
};
