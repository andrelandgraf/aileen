---
title: "MCP Overview | Tools & MCP | Mastra Docs"
description: Learn about the Model Context Protocol (MCP), how to use third-party tools via MCPClient, connect to registries, and share your own tools using MCPServer.
---

import { Tabs } from "nextra/components";

# MCP Overview

Mastra supports the [Model Context Protocol (MCP)](https://modelcontextprotocol.io/introduction), an open standard for connecting AI agents to external tools and resources. It serves as a universal plugin system, enabling agents to call tools regardless of language or hosting environment.

Mastra can also be used to author MCP servers, exposing agents, tools, and other structured resources via the MCP interface. These can then be accessed by any system or agent that supports the protocol.

Mastra currently supports two MCP classes:

1. **`MCPClient`**: Connects to one or many MCP servers to access their tools, resources, prompts, and handle elicitation requests.
2. **`MCPServer`**: Exposes Mastra tools, agents, workflows, prompts, and resources to MCP compatible clients.

## Getting started

To use MCP, install the required dependency:

```bash
npm install @mastra/mcp@latest
```

## Configuring `MCPClient`

The `MCPClient` connects Mastra primitives to external MCP servers, which can be local packages (invoked using `npx`) or remote HTTP(S) endpoints. Each server must be configured with either a `command` or a `url`, depending on how it's hosted.

```typescript filename="src/mastra/mcp/test-mcp-client.ts" showLineNumbers copy
import { MCPClient } from "@mastra/mcp";

export const testMcpClient = new MCPClient({
  id: "test-mcp-client",
  servers: {
    wikipedia: {
      command: "npx",
      args: ["-y", "wikipedia-mcp"],
    },
    weather: {
      url: new URL(
        `https://server.smithery.ai/@smithery-ai/national-weather-service/mcp?api_key=${process.env.SMITHERY_API_KEY}`,
      ),
    },
  },
});
```

> See [MCPClient](../../reference/tools/mcp-client.mdx) for a full list of configuration options.

## Using `MCPClient` with an agent

To use tools from an MCP server in an agent, import your `MCPClient` and call `.getTools()` in the `tools` parameter. This loads from the defined MCP servers, making them available to the agent.

```typescript {4,16} filename="src/mastra/agents/test-agent.ts" showLineNumbers copy
import { openai } from "@ai-sdk/openai";
import { Agent } from "@mastra/core/agent";

import { testMcpClient } from "../mcp/test-mcp-client";

export const testAgent = new Agent({
  name: "Test Agent",
  description: "You are a helpful AI assistant",
  instructions: `
      You are a helpful assistant that has access to the following MCP Servers.
      - Wikipedia MCP Server
      - US National Weather Service

      Answer questions using the information you find using the MCP Servers.`,
  model: openai("gpt-4o-mini"),
  tools: await testMcpClient.getTools(),
});
```

> See the [Agent Class](../../reference/agents/agent.mdx) for a full list of configuration options.

## Configuring `MCPServer`

To expose agents, tools, and workflows from your Mastra application to external systems over HTTP(S) use the `MCPServer` class. This makes them accessible to any system or agent that supports the protocol.

```typescript filename="src/mastra/mcp/test-mcp-server.ts" showLineNumbers copy
import { MCPServer } from "@mastra/mcp";

import { testAgent } from "../agents/test-agent";
import { testWorkflow } from "../workflows/test-workflow";
import { testTool } from "../tools/test-tool";

export const testMcpServer = new MCPServer({
  id: "test-mcp-server",
  name: "Test Server",
  version: "1.0.0",
  agents: { testAgent },
  tools: { testTool },
  workflows: { testWorkflow },
});
```

> See [MCPServer](../../reference/tools/mcp-server.mdx) for a full list of configuration options.

## Registering an `MCPServer`

To make an MCP server available to other systems or agents that support the protocol, register it in the main `Mastra` instance using `mcpServers`.

```typescript filename="src/mastra/index.ts" showLineNumbers copy
import { Mastra } from "@mastra/core/mastra";

import { testMcpServer } from "./mcp/test-mcp-server";

export const mastra = new Mastra({
  // ...
  mcpServers: { testMcpServer },
});
```

## Static and dynamic tools

`MCPClient` offers two approaches to retrieving tools from connected servers, suitable for different application architectures:

| Feature           | Static Configuration (`await mcp.getTools()`) | Dynamic Configuration (`await mcp.getToolsets()`)    |
| :---------------- | :-------------------------------------------- | :--------------------------------------------------- |
| **Use Case**      | Single-user, static config (e.g., CLI tool)   | Multi-user, dynamic config (e.g., SaaS app)          |
| **Configuration** | Fixed at agent initialization                 | Per-request, dynamic                                 |
| **Credentials**   | Shared across all uses                        | Can vary per user/request                            |
| **Agent Setup**   | Tools added in `Agent` constructor            | Tools passed in `.generate()` or `.stream()` options |

### Static tools

Use the `.getTools()` method to fetch tools from all configured MCP servers. This is suitable when configuration (such as API keys) is static and consistent across users or requests. Call it once and pass the result to the `tools` property when defining your agent.

> See [getTools()](../../reference/tools/mcp-client.mdx#gettools) for more information.

```typescript {8} filename="src/mastra/agents/test-agent.ts" showLineNumbers copy
import { openai } from "@ai-sdk/openai";
import { Agent } from "@mastra/core/agent";

import { testMcpClient } from "../mcp/test-mcp-client";

export const testAgent = new Agent({
  // ...
  tools: await testMcpClient.getTools(),
});
```

### Dynamic tools

Use the `.getToolsets()` method when tool configuration may vary by request or user, such as in a multi-tenant system where each user provides their own API key. This method returns toolsets that can be passed to the `toolsets` option in the agent's `.generate()` or `.stream()` calls.

```typescript {5-16,21} showLineNumbers copy
import { MCPClient } from "@mastra/mcp";
import { mastra } from "./mastra";

async function handleRequest(userPrompt: string, userApiKey: string) {
  const userMcp = new MCPClient({
    servers: {
      weather: {
        url: new URL("http://localhost:8080/mcp"),
        requestInit: {
          headers: {
            Authorization: `Bearer ${userApiKey}`,
          },
        },
      },
    },
  });

  const agent = mastra.getAgent("testAgent");

  const response = await agent.generate(userPrompt, {
    toolsets: await userMcp.getToolsets(),
  });

  await userMcp.disconnect();

  return Response.json({
    data: response.text,
  });
}
```

> See [getToolsets()](../../reference/tools/mcp-client.mdx#gettoolsets) for more information.

## Connecting to an MCP registry

MCP servers can be discovered through registries. Here's how to connect to some popular ones using `MCPClient`:

{/_
LLM CONTEXT: This Tabs component shows how to connect to different MCP (Model Context Protocol) registries.
Each tab demonstrates the configuration for a specific MCP registry service (mcp.run, Composio.dev, Smithery.ai).
The tabs help users understand how to connect to various MCP server providers and their different authentication methods.
Each tab shows the specific URL patterns and configuration needed for that registry service.
_/}

<Tabs items={["Klavis AI", "mcp.run", "Composio.dev", "Smithery.ai", "Ampersand"]}>
<Tabs.Tab>
[Klavis AI](https://klavis.ai) provides hosted, enterprise-authenticated, high-quality MCP servers.

    ```typescript
    import { MCPClient } from "@mastra/mcp";

    const mcp = new MCPClient({
      servers: {
        salesforce: {
          url: new URL("https://salesforce-mcp-server.klavis.ai/mcp/?instance_id={private-instance-id}"),
        },
        hubspot: {
          url: new URL("https://hubspot-mcp-server.klavis.ai/mcp/?instance_id={private-instance-id}"),
        },
      },
    });
    ```

    Klavis AI offers enterprise-grade authentication and security for production deployments.

    For more details on how to integrate Mastra with Klavis, check out their [documentation](https://docs.klavis.ai/documentation/ai-platform-integration/mastra).

</Tabs.Tab>
<Tabs.Tab>
[mcp.run](https://www.mcp.run/) provides pre-authenticated, managed MCP servers. Tools are grouped into Profiles, each with a unique, signed URL.

    ```typescript
    import { MCPClient } from "@mastra/mcp";

    const mcp = new MCPClient({
      servers: {
        marketing: { // Example profile name
          url: new URL(process.env.MCP_RUN_SSE_URL!), // Get URL from mcp.run profile
        },
      },
    });
    ```

    > **Important:** Treat the mcp.run SSE URL like a password. Store it securely, for example, in an environment variable.
    > ```bash filename=".env"
    > MCP_RUN_SSE_URL=https://www.mcp.run/api/mcp/sse?nonce=...
    > ```

</Tabs.Tab>
<Tabs.Tab>
[Composio.dev](https://composio.dev) offers a registry of [SSE-based MCP servers](https://mcp.composio.dev). You can use the SSE URL generated for tools like Cursor directly.

    ```typescript
    import { MCPClient } from "@mastra/mcp";

    const mcp = new MCPClient({
      servers: {
        googleSheets: {
          url: new URL("https://mcp.composio.dev/googlesheets/[private-url-path]"),
        },
        gmail: {
          url: new URL("https://mcp.composio.dev/gmail/[private-url-path]"),
        },
      },
    });
    ```

    Authentication with services like Google Sheets often happens interactively through the agent conversation.

    *Note: Composio URLs are typically tied to a single user account, making them best suited for personal automation rather than multi-tenant applications.*

</Tabs.Tab>
<Tabs.Tab>
[Smithery.ai](https://smithery.ai) provides a registry accessible via their CLI.

    ```typescript
    // Unix/Mac
    import { MCPClient } from "@mastra/mcp";

    const mcp = new MCPClient({
      servers: {
        sequentialThinking: {
          command: "npx",
          args: [
            "-y",
            "@smithery/cli@latest",
            "run",
            "@smithery-ai/server-sequential-thinking",
            "--config",
            "{}",
          ],
        },
      },
    });
    ```

    ```typescript
    // Windows
    import { MCPClient } from "@mastra/mcp";

    const mcp = new MCPClient({
      servers: {
        sequentialThinking: {
          command: "npx",
          args: [
            "-y",
            "@smithery/cli@latest",
            "run",
            "@smithery-ai/server-sequential-thinking",
            "--config",
            "{}",
          ],
        },
      },
    });
    ```

</Tabs.Tab>
<Tabs.Tab>

    [Ampersand](https://withampersand.com?utm_source=mastra-docs) offers an [MCP Server](https://docs.withampersand.com/mcp) that allows you to connect your agent to 150+ integrations with SaaS products like Salesforce, Hubspot, and Zendesk.


    ```typescript

    // MCPClient with Ampersand MCP Server using SSE
    export const mcp = new MCPClient({
        servers: {
        "@amp-labs/mcp-server": {
          "url": `https://mcp.withampersand.com/v1/sse?${new URLSearchParams({
            apiKey: process.env.AMPERSAND_API_KEY,
            project: process.env.AMPERSAND_PROJECT_ID,
            integrationName: process.env.AMPERSAND_INTEGRATION_NAME,
            groupRef: process.env.AMPERSAND_GROUP_REF
          })}`
        }
      }
    });

    ```

    ```typescript
    // If you prefer to run the MCP server locally:

    import { MCPClient } from "@mastra/mcp";

    // MCPClient with Ampersand MCP Server using stdio transport
    export const mcp = new MCPClient({
        servers: {
          "@amp-labs/mcp-server": {
            command: "npx",
            args: [
              "-y",
              "@amp-labs/mcp-server@latest",
              "--transport",
              "stdio",
              "--project",
              process.env.AMPERSAND_PROJECT_ID,
              "--integrationName",
              process.env.AMPERSAND_INTEGRATION_NAME,
              "--groupRef",
              process.env.AMPERSAND_GROUP_REF, // optional
            ],
            env: {
              AMPERSAND_API_KEY: process.env.AMPERSAND_API_KEY,
            },
          },
        },
    });
    ```

    As an alternative to MCP, Ampersand's AI SDK also has an adapter for Mastra, so you can [directly import Ampersand tools](https://docs.withampersand.com/ai-sdk#use-with-mastra) for your agent to access.

</Tabs.Tab>
</Tabs>

## Related

- [Using Tools and MCP](../agents/using-tools-and-mcp.mdx)
- [MCPClient](../../reference/tools/mcp-client.mdx)
- [MCPServer](../../reference/tools/mcp-server.mdx)

---

title: "Runtime context | Tools & MCP | Mastra Docs"
description: Learn how to use Mastra's RuntimeContext to provide dynamic, request-specific configuration to tools.

---

import { Callout } from "nextra/components";

# Tool Runtime Context

Mastra provides `RuntimeContext`, a dependency injection system that lets you configure tools with runtime variables. If you find yourself creating multiple tools that perform similar tasks, runtime context allows you to consolidate them into a single, more flexible tool.

## Overview

The dependency injection system allows you to:

1. Pass runtime configuration variables to tools through a type-safe `runtimeContext`.
2. Access these variables within tool execution context.
3. Modify tool behavior without changing the underlying code.
4. Share configuration across multiple tools within the same agent.

<Callout>
  **Note:** `RuntimeContext` is primarily used for passing data *into* tool
  executions. It's distinct from agent memory, which handles conversation
  history and state persistence across multiple calls.
</Callout>

## Accessing `runtimeContext` in tools

Tools can access the same `runtimeContext` used by their parent agent, allowing them to adjust behavior based on runtime configuration. In this example, the `temperature-unit` is retrieved within the tool’s `execute` function to ensure consistent formatting with the agent’s instructions.

```typescript {14-15} filename="src/mastra/tools/test-weather-tool" showLineNumbers copy
import { createTool } from "@mastra/core/tools";
import { z } from "zod";

type WeatherRuntimeContext = {
  "temperature-unit": "celsius" | "fahrenheit";
};

export const testWeatherTool = createTool({
  id: "getWeather",
  description: "Get the current weather for a location",
  inputSchema: z.object({
    location: z.string().describe("The location to get weather for"),
  }),
  execute: async ({ context, runtimeContext }) => {
    const temperatureUnit = runtimeContext.get(
      "temperature-unit",
    ) as WeatherRuntimeContext["temperature-unit"];

    const weather = await fetchWeather(context.location, temperatureUnit);

    return { result: weather };
  },
});

async function fetchWeather(
  location: string,
  temperatureUnit: WeatherRuntimeContext["temperature-unit"],
) {
  // ...
}
```

## Related

[Agent Runtime Context](../agents/runtime-context.mdx)

---

title: "Advanced Tool Usage | Tools & MCP | Mastra Docs"
description: This page covers advanced features for Mastra tools, including abort signals and compatibility with the Vercel AI SDK tool format.

---

# Advanced Tool Usage

This page covers more advanced techniques and features related to using tools in Mastra.

## Abort Signals

When you initiate an agent interaction using `generate()` or `stream()`, you can provide an `AbortSignal`. Mastra automatically forwards this signal to any tool executions that occur during that interaction.

This allows you to cancel long-running operations within your tools, such as network requests or intensive computations, if the parent agent call is aborted.

You access the `abortSignal` in the second parameter of the tool's `execute` function.

```typescript
import { createTool } from "@mastra/core/tools";
import { z } from "zod";

export const longRunningTool = createTool({
  id: "long-computation",
  description: "Performs a potentially long computation",
  inputSchema: z.object({ /* ... */ }),
  execute: async ({ context }, { abortSignal }) => {
    // Example: Forwarding signal to fetch
    const response = await fetch("https://api.example.com/data", {
      signal: abortSignal, // Pass the signal here
    });

    if (abortSignal?.aborted) {
      console.log("Tool execution aborted.");
      throw new Error("Aborted");
    }

    // Example: Checking signal during a loop
    for (let i = 0; i < 1000000; i++) {
      if (abortSignal?.aborted) {
        console.log("Tool execution aborted during loop.");
        throw new Error("Aborted");
      }
      // ... perform computation step ...
    }

    const data = await response.json();
    return { result: data };
  },\n});
```

To use this, provide an `AbortController`'s signal when calling the agent:

```typescript
import { Agent } from "@mastra/core/agent";
// Assume 'agent' is an Agent instance with longRunningTool configured

const controller = new AbortController();

// Start the agent call
const promise = agent.generate("Perform the long computation.", {
  abortSignal: controller.signal,
});

// Sometime later, if needed:
// controller.abort();

try {
  const result = await promise;
  console.log(result.text);
} catch (error) {
  if (error.name === "AbortError") {
    console.log("Agent generation was aborted.");
  } else {
    console.error("An error occurred:", error);
  }
}
```

## AI SDK Tool Format

Mastra maintains compatibility with the tool format used by the Vercel AI SDK (`ai` package). You can define tools using the `tool` function from the `ai` package and use them directly within your Mastra agents alongside tools created with Mastra's `createTool`.

First, ensure you have the `ai` package installed:

```bash npm2yarn copy
npm install ai
```

Here's an example of a tool defined using the Vercel AI SDK format:

```typescript filename="src/mastra/tools/vercelWeatherTool.ts" copy
import { tool } from "ai";
import { z } from "zod";

export const vercelWeatherTool = tool({
  description: "Fetches current weather using Vercel AI SDK format",
  parameters: z.object({
    city: z.string().describe("The city to get weather for"),
  }),
  execute: async ({ city }) => {
    console.log(`Fetching weather for ${city} (Vercel format tool)`);
    // Replace with actual API call
    const data = await fetch(`https://api.example.com/weather?city=${city}`);
    return data.json();
  },
});
```

You can then add this tool to your Mastra agent just like any other tool:

```typescript filename="src/mastra/agents/mixedToolsAgent.ts"
import { Agent } from "@mastra/core/agent";
import { openai } from "@ai-sdk/openai";
import { vercelWeatherTool } from "../tools/vercelWeatherTool"; // Vercel AI SDK tool
import { mastraTool } from "../tools/mastraTool"; // Mastra createTool tool

export const mixedToolsAgent = new Agent({
  name: "Mixed Tools Agent",
  instructions: "You can use tools defined in different formats.",
  model: openai("gpt-4o-mini"),
  tools: {
    weatherVercel: vercelWeatherTool,
    someMastraTool: mastraTool,
  },
});
```

Mastra supports both tool formats, allowing you to mix and match as needed.
