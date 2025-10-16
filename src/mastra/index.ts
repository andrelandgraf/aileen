import { Mastra } from "@mastra/core";
import { codegenAgent } from "./agents/codegenAgent";
import { authenticateAndAuthorize } from "./lib/middleware";

export const mastra = new Mastra({
  agents: { codegenAgent },
  server: {
    middleware: [authenticateAndAuthorize],
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
  },
});

// Allow streaming responses up to 5 minutes (dev server operations can be slow)
export const maxDuration = 300;
