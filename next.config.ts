import type { NextConfig } from "next";
import { withWorkflow } from "workflow/next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["@mastra/*"],
  reactCompiler: true,
};

export default withWorkflow(nextConfig);
