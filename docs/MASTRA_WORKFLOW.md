---
title: "Branching, Merging, Conditions | Workflows | Mastra Docs"
description: "Control flow in Mastra workflows allows you to manage branching, merging, and conditions to construct workflows that meet your logic requirements."
---

# Control Flow

When you build a workflow, you typically break down operations into smaller tasks that can be linked and reused. **Steps** provide a structured way to manage these tasks by defining inputs, outputs, and execution logic.

- If the schemas match, the `outputSchema` from each step is automatically passed to the `inputSchema` of the next step.
- If the schemas don't match, use [Input data mapping](./input-data-mapping.mdx) to transform the `outputSchema` into the expected `inputSchema`.

## Chaining steps with `.then()`

Chain steps to execute sequentially using `.then()`:

![Chaining steps with .then()](/image/workflows/workflows-control-flow-then.jpg)

```typescript {8-9,4-5} filename="src/mastra/workflows/test-workflow.ts" showLineNumbers copy
import { createWorkflow, createStep } from "@mastra/core/workflows";
import { z } from "zod";

const step1 = createStep({...});
const step2 = createStep({...});

export const testWorkflow = createWorkflow({...})
  .then(step1)
  .then(step2)
  .commit();
```

This does what you'd expect: it executes `step1`, then it executes `step2`.

## Simultaneous steps with `.parallel()`

Execute steps simultaneously using `.parallel()`:

![Concurrent steps with .parallel()](/image/workflows/workflows-control-flow-parallel.jpg)

```typescript {9,4-5} filename="src/mastra/workflows/test-workflow.ts" showLineNumbers copy
import { createWorkflow, createStep } from "@mastra/core/workflows";
import { z } from "zod";

const step1 = createStep({...});
const step2 = createStep({...});
const step3 = createStep({...});

export const testWorkflow = createWorkflow({...})
  .parallel([step1, step2])
  .then(step3)
  .commit();
```

This executes `step1` and `step2` concurrently, then continues to `step3` after both complete.

> See [Parallel Execution with Steps](../../examples/workflows/parallel-steps.mdx) for more information.

> 📹 Watch: How to run steps in parallel and optimize your Mastra workflow → [YouTube (3 minutes)](https://youtu.be/GQJxve5Hki4)

## Conditional logic with `.branch()`

Execute steps conditionally using `.branch()`:

![Conditional branching with .branch()](/image/workflows/workflows-control-flow-branch.jpg)

```typescript {8-11,4-5} filename="src/mastra/workflows/test-workflow.ts" showLineNumbers copy
import { createWorkflow, createStep } from "@mastra/core/workflows";
import { z } from "zod";

const lessThanStep = createStep({...});
const greaterThanStep = createStep({...});

export const testWorkflow = createWorkflow({...})
  .branch([
    [async ({ inputData: { value } }) => value <= 10, lessThanStep],
    [async ({ inputData: { value } }) => value > 10, greaterThanStep]
  ])
  .commit();
```

Branch conditions are evaluated sequentially, but steps with matching conditions are executed in parallel.

> See [Workflow with Conditional Branching](../../examples/workflows/conditional-branching.mdx) for more information.

## Looping steps

Workflows support two types of loops. When looping a step, or any step-compatible construct like a nested workflow, the initial `inputData` is sourced from the output of the previous step.

To ensure compatibility, the loop’s initial input must either match the shape of the previous step’s output, or be explicitly transformed using the `map` function.

- Match the shape of the previous step’s output, or
- Be explicitly transformed using the `map` function.

### Repeating with `.dowhile()`

Executes step repeatedly while a condition is true.

![Repeating with .dowhile()](/image/workflows/workflows-control-flow-dowhile.jpg)

```typescript {7} filename="src/mastra/workflows/test-workflow.ts" showLineNumbers copy
import { createWorkflow, createStep } from "@mastra/core/workflows";
import { z } from "zod";

const counterStep = createStep({...});

export const testWorkflow = createWorkflow({...})
  .dowhile(counterStep, async ({ inputData: { number } }) => number < 10)
  .commit();
```

### Repeating with `.dountil()`

Executes step repeatedly until a condition becomes true.

![Repeating with .dountil()](/image/workflows/workflows-control-flow-dountil.jpg)

```typescript {7} filename="src/mastra/workflows/test-workflow.ts" showLineNumbers copy
import { createWorkflow, createStep } from "@mastra/core/workflows";
import { z } from "zod";

const counterStep = createStep({...});

export const testWorkflow = createWorkflow({...})
  .dountil(counterStep, async ({ inputData: { number } }) => number > 10)
  .commit();
```

### Loop management

Loop conditions can be implemented in different ways depending on how you want the loop to end. Common patterns include checking values returned in `inputData`, setting a maximum number of iterations, or aborting execution when a limit is reached.

#### Conditional loops

The `inputData` for a loop step is the output of a previous step. Use the values in `inputData` to determine whether the loop should continue or stop.

```typescript {7} filename="src/mastra/workflows/test-workflow.ts" showLineNumbers copy
import { createWorkflow, createStep } from "@mastra/core/workflows";
import { z } from "zod";

const counterStep = createStep({...});

export const testWorkflow = createWorkflow({...})
.dountil(nestedWorkflowStep, async ({ inputData: { userResponse } }) => userResponse === "yes")
.commit();
```

#### Limiting loops

The `iterationCount` tracks how many times the loop step has run. You can use this to limit the number of iterations and prevent infinite loops. Combine it with `inputData` values to stop the loop after a set number of attempts.

```typescript {7} filename="src/mastra/workflows/test-workflow.ts" showLineNumbers copy
import { createWorkflow, createStep } from "@mastra/core/workflows";
import { z } from "zod";

const counterStep = createStep({...});

export const testWorkflow = createWorkflow({...})
.dountil(nestedWorkflowStep, async ({ inputData: { userResponse, iterationCount } }) => userResponse === "yes" || iterationCount >= 10)
.commit();
```

#### Aborting loops

Use `iterationCount` to limit how many times a loop runs. If the count exceeds your threshold, throw an error to fail the step and stop the workflow.

```typescript {7} filename="src/mastra/workflows/test-workflow.ts" showLineNumbers copy
import { createWorkflow, createStep } from "@mastra/core/workflows";
import { z } from "zod";

const counterStep = createStep({...});

export const testWorkflow = createWorkflow({...})
.dountil(nestedWorkflowStep, async ({ inputData: { userResponse, iterationCount } }) => {
  if (iterationCount >= 10) {
    throw new Error("Maximum iterations reached");
  }
  return userResponse === "yes";
})
.commit();
```

### Repeating with `.foreach()`

Sequentially executes the same step for each item from the `inputSchema`.

![Repeating with .foreach()](/image/workflows/workflows-control-flow-foreach.jpg)

```typescript {7} filename="src/mastra/workflows/test-workflow.ts" showLineNumbers copy
import { createWorkflow, createStep } from "@mastra/core/workflows";
import { z } from "zod";

const mapStep = createStep({...});

export const testWorkflow = createWorkflow({...})
  .foreach(mapStep)
  .commit();
```

#### Setting concurrency limits

Use `concurrency` to execute steps in parallel with a limit on the number of concurrent executions.

```typescript {7} filename="src/mastra/workflows/test-workflow.ts" showLineNumbers copy
import { createWorkflow, createStep } from "@mastra/core/workflows";
import { z } from "zod";

const mapStep = createStep({...})

export const testWorkflow = createWorkflow({...})
  .foreach(mapStep, { concurrency: 2 })
  .commit();
```

## Using a nested workflow

Use a nested workflow as a step by passing it to `.then()`. This runs each of its steps in sequence as part of the parent workflow.

```typescript {4,7} filename="src/mastra/workflows/test-workflow.ts" showLineNumbers copy
import { createWorkflow, createStep } from "@mastra/core/workflows";
import { z } from "zod";

export const nestedWorkflow = createWorkflow({...})

export const testWorkflow = createWorkflow({...})
  .then(nestedWorkflow)
  .commit();
```

## Cloning a workflow

Use `cloneWorkflow` to duplicate an existing workflow. This lets you reuse its structure while overriding parameters like `id`.

```typescript {6,10} filename="src/mastra/workflows/test-workflow.ts" showLineNumbers copy
import { createWorkflow, createStep, cloneWorkflow } from "@mastra/core/workflows";
import { z } from "zod";

const step1 = createStep({...});
const parentWorkflow = createWorkflow({...})
const clonedWorkflow = cloneWorkflow(parentWorkflow, { id: "cloned-workflow" });

export const testWorkflow = createWorkflow({...})
  .then(step1)
  .then(clonedWorkflow)
  .commit();
```

## Example Run Instance

The following example demonstrates how to start a run with multiple inputs. Each input will pass through the `mapStep` sequentially.

```typescript {6} filename="src/test-workflow.ts" showLineNumbers copy
import { mastra } from "./mastra";

const run = await mastra.getWorkflow("testWorkflow").createRunAsync();

const result = await run.start({
  inputData: [{ number: 10 }, { number: 100 }, { number: 200 }],
});
```

To execute this run from your terminal:

```bash copy
npx tsx src/test-workflow.ts
```

---

title: "Using Workflows with Agents and Tools | Workflows | Mastra Docs"
description: "Steps in Mastra workflows provide a structured way to manage operations by defining inputs, outputs, and execution logic."

---

# Agents and Tools

Workflow steps are composable and typically run logic directly within the `execute` function. However, there are cases where calling an agent or tool is more appropriate. This pattern is especially useful when:

- Generating natural language responses from user input using an LLM.
- Abstracting complex or reusable logic into a dedicated tool.
- Interacting with third-party APIs in a structured or reusable way.

Workflows can use Mastra agents or tools directly as steps, for example: `createStep(testAgent)` or `createStep(testTool)`.

## Using agents in workflows

To include an agent in a workflow, define it in the usual way, then either add it directly to the workflow using `createStep(testAgent)` or, invoke it from within a step's `execute` function using `.generate()`.

### Example agent

This agent uses OpenAI to generate a fact about a city, country, and timezone.

```typescript filename="src/mastra/agents/test-agent.ts" showLineNumbers copy
import { openai } from "@ai-sdk/openai";
import { Agent } from "@mastra/core/agent";

export const testAgent = new Agent({
  name: "test-agent",
  description: "Create facts for a country based on the city",
  instructions: `Return an interesting fact about the country based on the city provided`,
  model: openai("gpt-4o"),
});
```

### Adding an agent as a step

In this example, `step1` uses the `testAgent` to generate an interesting fact about the country based on a given city.

The `.map` method transforms the workflow input into a `prompt` string compatible with the `testAgent`.

The step is composed into the workflow using `.then()`, allowing it to receive the mapped input and return the agent's structured output. The workflow is finalized with `.commit()`.

![Agent as step](/image/workflows/workflows-agent-tools-agent-step.jpg)

```typescript {3} filename="src/mastra/workflows/test-workflow.ts" showLineNumbers copy
import { testAgent } from "../agents/test-agent";

const step1 = createStep(testAgent);

export const testWorkflow = createWorkflow({
  id: "test-workflow",
  description: "Test workflow",
  inputSchema: z.object({
    input: z.string(),
  }),
  outputSchema: z.object({
    output: z.string(),
  }),
})
  .map(({ inputData }) => {
    const { input } = inputData;
    return {
      prompt: `Provide facts about the city: ${input}`,
    };
  })
  .then(step1)
  .commit();
```

### Calling an agent with `.generate()`

In this example, the `step1` builds a prompt using the provided `input` and passes it to the `testAgent`, which returns a plain-text response containing facts about the city and its country.

The step is added to the workflow using the sequential `.then()` method, allowing it to receive input from the workflow and return structured output. The workflow is finalized with `.commit()`.

```typescript {1,18, 29} filename="src/mastra/workflows/test-workflow.ts" showLineNumbers copy
import { testAgent } from "../agents/test-agent";

const step1 = createStep({
  id: "step-1",
  description: "Create facts for a country based on the city",
  inputSchema: z.object({
    input: z.string()
  }),
  outputSchema: z.object({
    output: z.string()
  }),

  execute: async ({ inputData }) => {
    const { input } = inputData;

    const  prompt = `Provide facts about the city: ${input}`

    const { text } = await testAgent.generate([
      { role: "user", content: prompt }
    ]);

    return {
      output: text
    };
  }
});

export const testWorkflow = createWorkflow({...})
  .then(step1)
  .commit();
```

## Using tools in workflows

To use a tool within a workflow, define it in the usual way, then either add it directly to the workflow using `createStep(testTool)` or, invoke it from within a step's `execute` function using `.execute()`.

### Example tool

The example below uses the Open Meteo API to retrieve geolocation details for a city, returning its name, country, and timezone.

```typescript filename="src/mastra/tools/test-tool.ts" showLineNumbers copy
import { createTool } from "@mastra/core";
import { z } from "zod";

export const testTool = createTool({
  id: "test-tool",
  description: "Gets country for a city",
  inputSchema: z.object({
    input: z.string(),
  }),
  outputSchema: z.object({
    country_name: z.string(),
  }),
  execute: async ({ context }) => {
    const { input } = context;
    const geocodingResponse = await fetch(
      `https://geocoding-api.open-meteo.com/v1/search?name=${input}`,
    );
    const geocodingData = await geocodingResponse.json();

    const { country } = geocodingData.results[0];

    return {
      country_name: country,
    };
  },
});
```

### Adding a tool as a step

In this example, `step1` uses the `testTool`, which performs a geocoding lookup using the provided `city` and returns the resolved `country`.

The step is added to the workflow using the sequential `.then()` method, allowing it to receive input from the workflow and return structured output. The workflow is finalized with `.commit()`.

![Tool as step](/image/workflows/workflows-agent-tools-tool-step.jpg)

```typescript {1,3,6} filename="src/mastra/workflows/test-workflow.ts" showLineNumbers copy
import { testTool } from "../tools/test-tool";

const step1 = createStep(testTool);

export const testWorkflow = createWorkflow({...})
  .then(step1)
  .commit();
```

### Calling a tool with `.execute()`

In this example, `step1` directly invokes `testTool` using its `.execute()` method. The tool performs a geocoding lookup with the provided `city` and returns the corresponding `country`.

The result is returned as structured output from the step. The step is composed into the workflow using `.then()`, enabling it to process workflow input and produce typed output. The workflow is finalized with `.commit()`

```typescript {3,20,32} filename="src/mastra/workflows/test-workflow.ts" showLineNumbers copy
import { RuntimeContext } from "@mastra/core/di";

import { testTool } from "../tools/test-tool";

const runtimeContext = new RuntimeContext();

const step1 = createStep({
  id: "step-1",
  description: "Gets country for a city",
  inputSchema: z.object({
    input: z.string()
  }),
  outputSchema: z.object({
    output: z.string()
  }),

  execute: async ({ inputData }) => {
    const { input } = inputData;

    const { country_name } = await testTool.execute({
      context: { input },
      runtimeContext
    });

    return {
      output: country_name
    };
  }
});

export const testWorkflow = createWorkflow({...})
  .then(step1)
  .commit();
```

## Using workflows as tools

In this example the `cityStringWorkflow` workflow has been added to the main Mastra instance.

```typescript {7} filename="src/mastra/index.ts" showLineNumbers copy
import { Mastra } from "@mastra/core/mastra";

import { testWorkflow, cityStringWorkflow } from "./workflows/test-workflow";

export const mastra = new Mastra({
  ...
  workflows: { testWorkflow, cityStringWorkflow },
});
```

Once a workflow has been registered it can be referenced using `getWorkflow` from withing a tool.

```typescript {10,17-27} filename="src/mastra/tools/test-tool.ts" showLineNumbers copy
export const cityCoordinatesTool = createTool({
  id: "city-tool",
  description: "Convert city details",
  inputSchema: z.object({
    city: z.string(),
  }),
  outputSchema: z.object({
    outcome: z.string(),
  }),
  execute: async ({ context, mastra }) => {
    const { city } = context;
    const geocodingResponse = await fetch(
      `https://geocoding-api.open-meteo.com/v1/search?name=${city}`,
    );
    const geocodingData = await geocodingResponse.json();

    const { name, country, timezone } = geocodingData.results[0];

    const workflow = mastra?.getWorkflow("cityStringWorkflow");

    const run = await workflow?.createRunAsync();

    const { result } = await run?.start({
      inputData: {
        city_name: name,
        country_name: country,
        country_timezone: timezone,
      },
    });

    return {
      outcome: result.outcome,
    };
  },
});
```

## Using workflows in agents

You can also use Workflows in Agents. This agent is able to choose between using the test tool or the test workflow.

```typescript
import { openai } from "@ai-sdk/openai";
import { Agent } from "@mastra/core/agent";
import { testTool } from "../tools/test-tool";
import { testWorkflow } from "../workflows/test-workflow";

export const testAgent = new Agent({
  name: "test-agent",
  description: "Create facts for a country based on the city",
  instructions: `Return an interesting fact about the country based on the city provided`,
  model: openai("gpt-4o"),
  workflows: {
    test_workflow: testWorkflow,
  },
  tools: {
    test_tool: testTool,
  },
});
```

## Exposing workflows with `MCPServer`

You can convert your workflows into tools by passing them into an instance of a Mastra `MCPServer`. This allows any MCP-compatible client to access your workflow.

The workflow description becomes the tool description and the input schema becomes the tool's input schema.

When you provide workflows to the server, each workflow is automatically exposed as a callable tool for example:

- `run_testWorkflow`.

```typescript filename="src/test-mcp-server.ts" showLineNumbers copy
import { MCPServer } from "@mastra/mcp";

import { testAgent } from "./mastra/agents/test-agent";
import { testTool } from "./mastra/tools/test-tool";
import { testWorkflow } from "./mastra/workflows/test-workflow";

async function startServer() {
  const server = new MCPServer({
    name: "test-mcp-server",
    version: "1.0.0",
    workflows: {
      testWorkflow,
    },
  });

  await server.startStdio();
  console.log("MCPServer started on stdio");
}

startServer().catch(console.error);
```

To verify that your workflow is available on the server, you can connect with an MCPClient.

```typescript filename="src/test-mcp-client.ts" showLineNumbers copy
import { MCPClient } from "@mastra/mcp";

async function main() {
  const mcp = new MCPClient({
    servers: {
      local: {
        command: "npx",
        args: ["tsx", "src/test-mcp-server.ts"],
      },
    },
  });

  const tools = await mcp.getTools();
  console.log(tools);
}

main().catch(console.error);
```

Run the client script to see your workflow tool.

```bash
npx tsx src/test-mcp-client.ts
```

## More resources

- [MCPServer reference documentation](/reference/tools/mcp-server).
- [MCPClient reference documentation](/reference/tools/mcp-client).
