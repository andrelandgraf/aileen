import { Mastra } from "@mastra/core";
import { codegenAgent } from "./agents/codegenAgent";

export const mastra = new Mastra({
  agents: { codegenAgent },
});
