import { Mastra } from "@mastra/core";
import { codegenAgent } from "./agents/codegenAgent";
import { auth } from "./lib/middleware";
import * as codegenRoute from "./routes/codegen";
import { mainConfig } from "@/lib/config";

export const mastra = new Mastra({
  agents: { codegenAgent },
  server: {
    middleware: [
      {
        handler: auth,
        path: "/codegen",
      },
    ],
    port: 4111,
    host: "localhost",
    cors: {
      origin: [
        mainConfig.public_url,
        "http://localhost:4111", // Allow Mastra playground
      ],
      allowMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
      allowHeaders: ["Content-Type", "Authorization"],
      credentials: true,
    },
    apiRoutes: [
      {
        path: "/codegen",
        method: "POST",
        handler: codegenRoute.POST,
      },
    ],
  },
});

// Allow streaming responses up to 5 minutes (dev server operations can be slow)
export const maxDuration = 300;
