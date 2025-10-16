# Mastra Refactoring Documentation

This document explains the refactored Mastra setup that follows the Mastra framework model.

## Overview

The application has been refactored to follow Mastra best practices:

1. **Single Mastra Instance**: One centralized Mastra instance with registered agents
2. **RuntimeContext Pattern**: Project-specific data is injected at runtime
3. **Dynamic Tools (Toolsets)**: MCP tools are loaded dynamically per request
4. **Proper Separation of Concerns**: Auth, MCP clients, and agent logic are properly separated

## Architecture

```
User Request → Next.js API Route (/api/projects/[projectId]/chat)
            → Authenticate & Authorize
            → Create Project-Specific MCP Clients
            → Get Toolsets from MCP Clients
            → Create RuntimeContext with Project Data
            → Call Registered Agent with Toolsets & RuntimeContext
            → Stream Response
```

## Key Components

### 1. Mastra Instance (`src/mastra/index.ts`)

The main Mastra instance that registers agents and configures the server:

```typescript
export const mastra = new Mastra({
  agents: { codegenAgent },
  server: {
    port: 4111,
    host: "localhost",
    cors: {
      /* ... */
    },
  },
});
```

**Key Points:**

- Single instance for the entire application
- Agents are registered once at startup
- Server configuration for local dev and Mastra playground

### 2. Codegen Agent (`src/mastra/agents/codegenAgent.ts`)

The agent uses RuntimeContext to access project-specific data dynamically:

```typescript
export const codegenAgent = new Agent({
  name: "codegen-agent",
  description: "Expert Next.js code generation assistant",

  // Instructions function accesses RuntimeContext
  instructions: ({ runtimeContext }) => {
    const project = runtimeContext.get("project") as ProjectContext | undefined;
    // ... builds instructions with project data
  },

  model: anthropic("claude-3-5-sonnet-20241022"),

  defaultStreamOptions: {
    maxSteps: 10,
    modelSettings: { temperature: 0.7 },
  },
});
```

**Key Points:**

- Instructions are a function that receives RuntimeContext
- No tools are registered statically (uses dynamic toolsets pattern)
- Project data is injected at runtime via RuntimeContext

### 3. MCP Clients (`src/mastra/lib/mcp-clients.ts`)

Utility functions for creating project-specific MCP clients and getting toolsets:

```typescript
// Create Freestyle MCP client for a specific repo
export async function createFreestyleMcpClient(repoId: string);

// Create Neon MCP client for a specific project
export function createNeonMcpClient(neonProjectId: string);

// Get toolsets from both MCP clients
export async function getProjectToolsets(
  freestyleMcp: MCPClient,
  neonMcp: MCPClient,
);
```

**Key Points:**

- MCP clients are created per request (multi-tenant pattern)
- `getToolsets()` is used instead of `getTools()` for dynamic configuration
- Toolsets can be passed to agent methods at runtime

### 4. API Route (`src/app/api/projects/[projectId]/chat/route.ts`)

The Next.js API route that handles chat requests:

```typescript
export async function POST(req: Request, { params }: RouteParams) {
  // 1. Authenticate user
  const user = await stackServerApp.getUser();

  // 2. Get project from database
  const [project] = await db.select()...

  // 3. Create MCP clients
  const { mcpClient: freestyleMcp } = await createFreestyleMcpClient(project.repoId);
  const neonMcp = createNeonMcpClient(project.neonProjectId);

  // 4. Get toolsets
  const toolsets = await getProjectToolsets(freestyleMcp, neonMcp);

  // 5. Create RuntimeContext with project data
  const runtimeContext = new RuntimeContext();
  runtimeContext.set("project", {
    projectId: project.id,
    projectName: project.name,
    neonProjectId: project.neonProjectId,
    repoId: project.repoId,
    userId: user.id
  });

  // 6. Get registered agent and call with toolsets & context
  const agent = mastra.getAgent("codegenAgent");
  const result = await agent.stream(messages, {
    toolsets,
    runtimeContext,
    format: "aisdk"
  });

  // 7. Return stream
  return result.toUIMessageStreamResponse();
}
```

**Key Points:**

- Uses the registered agent from the Mastra instance
- Creates project-specific MCP clients per request
- Passes toolsets and RuntimeContext to the agent
- Uses AI SDK v5 format for compatibility with assistant-ui

### 5. Assistant UI (`src/components/project-chat.tsx`)

The UI component that connects to the API route:

```typescript
const runtime = useChatRuntime({
  cloud,
  id: threadId,
  transport: new AssistantChatTransport({
    api: `/api/projects/${projectId}/chat`,
  }),
});
```

**Key Points:**

- Points to the Next.js API route (not Mastra server directly)
- Project ID is in the URL path
- No authorization header needed (uses session cookies)

## Testing in Mastra Playground

The refactored setup allows testing in the Mastra playground without project context:

### 1. Start the Mastra Dev Server

```bash
npm run mastra:dev
```

This starts the Mastra server on `http://localhost:4111`

### 2. Access the Playground

Open your browser to:

```
http://localhost:4111
```

### 3. Test the Agent

Navigate to the Agents section and select `codegen-agent`.

**Important**: When testing in the playground without project context:

- The agent won't have MCP tools available (no toolsets provided)
- Instructions will show the base instructions without project-specific context
- You can test the agent's general capabilities and instruction format

### 4. Test with RuntimeContext (Advanced)

To test with project context, you would need to:

1. Use the Mastra API directly (not the playground UI)
2. Create MCP clients and toolsets
3. Pass RuntimeContext with project data
4. This is essentially what the Next.js API route does

## Dynamic Tools Pattern

The setup uses the **dynamic tools pattern** from Mastra:

### Static Tools Pattern (Not Used)

```typescript
// Tools are registered with the agent at creation time
const agent = new Agent({
  tools: await mcpClient.getTools(),
});
```

### Dynamic Tools Pattern (Used)

```typescript
// Agent has no static tools
const agent = new Agent({
  // no tools property
});

// Tools are provided at call time
const result = await agent.stream(messages, {
  toolsets: await mcpClient.getToolsets(),
});
```

**Why Dynamic Tools?**

- Multi-tenant: Each project has its own MCP servers (different repoId, neonProjectId)
- Isolated: Projects can't access each other's tools
- Flexible: Tool configuration can change per request
- Scalable: New projects don't require creating new agent instances

## RuntimeContext Pattern

RuntimeContext allows injecting request-specific data into agents:

```typescript
// Define the context type
export type ProjectContext = {
  projectId: string;
  projectName: string;
  neonProjectId: string;
  repoId: string;
  userId: string;
};

// Create context and set data
const runtimeContext = new RuntimeContext();
runtimeContext.set("project", projectData);

// Access in agent instructions
instructions: ({ runtimeContext }) => {
  const project = runtimeContext.get("project") as ProjectContext;
  // Use project data in instructions
};
```

**Benefits:**

- Single agent definition for all projects
- Project-specific instructions without creating multiple agents
- Type-safe context data
- Can be used for user preferences, feature flags, etc.

## File Structure

```
src/mastra/
├── index.ts                    # Main Mastra instance
├── agents/
│   └── codegenAgent.ts        # Codegen agent definition
└── lib/
    ├── mcp-clients.ts         # MCP client utilities
    ├── middleware.ts          # Auth middleware (for reference)
    └── stackauth.ts           # Stack Auth utilities (for reference)

src/app/api/projects/[projectId]/chat/
└── route.ts                   # Next.js API route handler

src/components/
└── project-chat.tsx           # Assistant UI component
```

## Environment Variables

Required environment variables:

```bash
# Freestyle Sandboxes
FREESTYLE_API_KEY=your_freestyle_api_key

# Neon
NEON_API_KEY=your_neon_api_key

# Anthropic
ANTHROPIC_API_KEY=your_anthropic_api_key

# Stack Auth
STACK_SECRET_SERVER_KEY=your_stack_secret
NEXT_PUBLIC_STACK_PROJECT_ID=your_stack_project_id
NEXT_PUBLIC_STACK_PUBLISHABLE_CLIENT_KEY=your_stack_key

# Database
DATABASE_URL=your_postgres_url

# App
NEXT_PUBLIC_APP_URL=http://localhost:3000

# Assistant UI
NEXT_PUBLIC_ASSISTANT_BASE_URL=your_assistant_cloud_url
```

## Deployment Considerations

### Next.js App Deployment

The Next.js app (with API routes) can be deployed to:

- Vercel
- Any Node.js hosting platform
- Serverless platforms (with appropriate adapters)

### Mastra Server Deployment

The standalone Mastra server can be deployed to:

- Mastra Cloud (recommended for production)
- Any Node.js hosting platform
- Containerized environments

**Note**: For production, you may want to deploy the Mastra server separately and have the Next.js API route connect to it as a client. This setup currently has the Mastra instance in the Next.js app, which works but may not be ideal for all use cases.

## Troubleshooting

### Agent Has No Tools in Playground

**Issue**: When testing in the playground, the agent doesn't have access to MCP tools.
**Solution**: This is expected. MCP tools are provided dynamically via toolsets in the API route. Test the full flow through the Next.js app instead.

### RuntimeContext Data Not Available

**Issue**: Project data is undefined in agent instructions.
**Solution**: Ensure you're passing RuntimeContext with project data when calling the agent. Check the API route implementation.

### Type Errors with Toolsets

**Issue**: TypeScript errors about toolsets type.
**Solution**: Cast toolsets as `any` when passing to agent methods. The Mastra types for toolsets are still evolving.

### MCP Client Connection Issues

**Issue**: MCP clients fail to connect or timeout.
**Solution**:

- Check API keys are set correctly
- Verify network connectivity
- Freestyle dev servers may take 20-30 seconds on cold start
- Check timeout settings in MCP client configuration

## Next Steps

Potential improvements:

1. Add proper error handling and retry logic for MCP client creation
2. Implement caching for MCP client connections (per project)
3. Add telemetry and logging for monitoring
4. Consider deploying Mastra server separately for better scalability
5. Add more agents for specialized tasks (database agent, deployment agent, etc.)
6. Implement agent memory for conversation history
7. Add evaluation metrics using Mastra scorers

## References

- [Mastra Documentation](https://mastra.ai/docs)
- [MCP Overview](https://mastra.ai/docs/tools-mcp/mcp-overview)
- [Runtime Context](https://mastra.ai/docs/server-db/runtime-context)
- [Dynamic Tools with MCPClient](https://mastra.ai/docs/tools-mcp/mcp-overview#dynamic-tools)
- [Freestyle MCP Setup](./FREESTYLE_MCP_SETUP.md)
- [Agents Documentation](./MASTRA_AGENTS.md)
