import { Mastra } from "@mastra/core";
import { chatRoute } from "@mastra/ai-sdk";
import { codegenAgent } from "./agents/codegenAgent";
import { auth } from "./lib/middleware";

export const mastra = new Mastra({
  agents: { codegenAgent },
  server: {
    middleware: [
      {
        handler: auth,
        path: "/api",
      },
      {
        handler: auth,
        path: "/codegen",
      },
    ],
    port: 4111,
    host: "localhost",
    cors: {
      origin: [
        process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000",
        "http://localhost:4111", // Allow Mastra playground
      ],
      allowMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
      allowHeaders: ["Content-Type", "Authorization"],
      credentials: true,
    },
    apiRoutes: [
      chatRoute({
        path: "/codegen",
        agent: "codegenAgent",
        defaultOptions: {
          maxSteps: 50,
        },
      }),
    ],
  },
});

// Allow streaming responses up to 5 minutes (dev server operations can be slow)
export const maxDuration = 300;
