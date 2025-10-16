# Freestyle MCP Server Integration

This document explains how the Freestyle MCP server is integrated into the Mastra agent system.

## Overview

The application uses **dynamic MCP client configuration** to provide each project with its own isolated development environment through Freestyle Sandboxes. Each request creates a project-specific MCP client that connects to:

1. **Freestyle Dev Server MCP** - Provides git operations, file system access, and development tools
2. **Neon MCP** - Provides database management and query tools

## Architecture

```
User Request → Mastra Cloud API
            → Middleware (Auth)
            → Create Project Agent:
                1. Request Freestyle Dev Server (per project repoId)
                2. Create Freestyle MCP Client (connects to dev server)
                3. Create Neon MCP Client (connects to Neon)
                4. Load & normalize tools from both MCP servers
                5. Create Agent with combined tools
            → Stream Response
```

## File Structure

### `src/mastra/lib/mcp-clients.ts`

Contains all MCP client setup logic:

#### `createFreestyleMcpClient(repoId: string)`

- Requests a Freestyle dev server for the given repository
- Returns ephemeral URLs (preview, MCP endpoint, code server)
- Creates and returns an `MCPClient` configured to connect to the dev server's MCP endpoint
- Timeout: 45 seconds for dev server request, 5 minutes for MCP operations

**Key Features:**

- **Cold start handling**: First request may take 20-30 seconds
- **Timeout protection**: Fails fast if dev server doesn't respond
- **Ephemeral URLs**: Each session gets unique, temporary URLs

#### `createNeonMcpClient(neonProjectId: string)`

- Creates an MCP client connected to Neon's hosted MCP server
- Authenticates using `NEON_API_KEY` environment variable
- Provides database management tools (branches, queries, schema operations)

#### `getAndNormalizeTools(mcpClient, serverName)`

- Fetches tools from an MCP client using `.getTools()`
- Normalizes tool schemas to ensure Anthropic compatibility
- Filters out invalid tools
- Returns a record of validated, normalized tools

#### `normalizeToolSchema(tool, toolName)`

- Ensures all tools have valid JSON Schema for parameters
- Adds missing `type: "object"` fields
- Filters tools with invalid schema types
- Returns `null` for tools that can't be normalized

### `src/mastra/lib/agent-handler.ts`

Main agent creation logic:

#### `createProjectAgent(project)`

1. **Validates environment variables** (`FREESTYLE_API_KEY`, `NEON_API_KEY`)
2. **Creates MCP clients** for both Freestyle and Neon
3. **Loads and normalizes tools** from both servers
4. **Combines tools** into a single record
5. **Creates dynamic agent** with:
   - Project-specific instructions (includes project name, repoId, neonProjectId)
   - Combined tools from both MCP servers
   - Anthropic Claude Sonnet model
6. **Returns agent** ready to stream responses

## MCP Configuration

### Freestyle MCP Server

```typescript
{
  id: `freestyle-dev-${repoId}`,
  timeout: 300000, // 5 minutes
  servers: {
    freestyleDevServer: {
      url: new URL(mcpEphemeralUrl), // Ephemeral URL from dev server
      timeout: 300000
    }
  }
}
```

**Available Tools** (from Freestyle MCP):

- Git operations (add, commit, push, pull, status)
- File system operations (read, write, list, delete)
- Terminal commands
- Code server access
- Development environment management

### Neon MCP Server

```typescript
{
  id: `neon-${neonProjectId}`,
  timeout: 300000, // 5 minutes
  servers: {
    neon: {
      url: new URL("https://mcp.neon.tech/mcp"),
      timeout: 300000,
      requestInit: {
        headers: {
          Authorization: `Bearer ${process.env.NEON_API_KEY}`
        }
      }
    }
  }
}
```

**Available Tools** (from Neon MCP):

- Database branch management (create, delete, list)
- SQL query execution
- Schema operations
- Connection string management
- Database snapshots

## Dynamic vs Static Tools

The implementation uses the **dynamic tools pattern** from Mastra:

- ✅ **Dynamic**: Each request gets its own MCP client instance
- ✅ **Per-project**: Configuration is project-specific (repoId, neonProjectId)
- ✅ **Multi-tenant**: Different users can work on different projects simultaneously
- ✅ **Isolated**: Each project has its own dev server and database

This is different from **static tools** where:

- ❌ MCP client is created once globally
- ❌ Same configuration for all requests
- ❌ Not suitable for multi-tenant applications

## Environment Variables

### Required in Mastra Cloud

```bash
# Freestyle
FREESTYLE_API_KEY=your_freestyle_api_key

# Neon
NEON_API_KEY=your_neon_api_key

# Anthropic
ANTHROPIC_API_KEY=your_anthropic_api_key

# Database
DATABASE_URL=your_database_connection_string

# Stack Auth (for middleware)
NEXT_PUBLIC_STACK_PROJECT_ID=your_stack_project_id
NEXT_PUBLIC_STACK_PUBLISHABLE_CLIENT_KEY=your_publishable_key
STACK_SECRET_SERVER_KEY=your_secret_server_key

# CORS
NEXT_PUBLIC_APP_URL=https://your-vercel-app.vercel.app
```

## Tool Normalization

Tools from MCP servers may have inconsistent schemas. The normalization process:

1. **Adds missing fields**: If `parameters` is missing, adds empty object schema
2. **Sets default type**: If `type` is missing, sets to `"object"`
3. **Filters invalid tools**: Skips tools with non-object parameter types
4. **Ensures compatibility**: Makes tools compatible with Anthropic's requirements

Example:

```typescript
// Before normalization
{
  description: "Read a file",
  parameters: {
    properties: { path: { type: "string" } }
    // Missing: type, required
  }
}

// After normalization
{
  description: "Read a file",
  parameters: {
    type: "object", // Added
    properties: { path: { type: "string" } },
    required: [] // Added
  }
}
```

## Performance Considerations

### Cold Start

- First request to a dev server: **20-30 seconds**
- Subsequent requests (warm): **< 5 seconds**
- MCP connection overhead: **~2 seconds**

### Timeouts

- Dev server request: **45 seconds** (fails if exceeded)
- MCP operations: **5 minutes** (allows for slow git/database operations)

### Caching

- Freestyle caches dev servers for ~10-15 minutes of inactivity
- Warm servers respond much faster
- No caching of MCP clients (created per request)

## Error Handling

The system handles several error scenarios:

1. **Missing API keys**: Throws immediately with clear error message
2. **Dev server timeout**: Fails after 45 seconds with timeout error
3. **Invalid tools**: Logs warning and skips tool, continues with valid tools
4. **MCP connection failure**: Propagates error to client with details

## Testing Locally

To test the MCP integration locally:

```bash
# 1. Set environment variables
export FREESTYLE_API_KEY=your_key
export NEON_API_KEY=your_key
export ANTHROPIC_API_KEY=your_key
# ... other vars

# 2. Run Mastra dev server
npm run mastra:dev

# 3. In another terminal, run Next.js
npm run dev

# 4. Create a project and send a chat message
# Check logs to see MCP client creation and tool loading
```

## Monitoring

Key log messages to watch:

```
[MCP Client] Requesting Freestyle dev server...
[MCP Client] Dev server request completed successfully
[MCP Client] Creating Freestyle MCP client...
[MCP Client] Getting tools from Freestyle MCP...
[MCP Client] Freestyle MCP raw tools loaded: X
[MCP Client] Freestyle MCP valid tools: Y
[MCP Client] Creating Neon MCP client...
[MCP Client] Getting tools from Neon MCP...
[MCP Client] Neon MCP raw tools loaded: X
[MCP Client] Neon MCP valid tools: Y
[Agent Handler] Total valid tools: Z
[Agent Handler] Agent created successfully
```

## Troubleshooting

### Dev server timeout

**Symptom**: Error after 45 seconds
**Cause**: Freestyle sandbox taking too long to start
**Solution**: Retry request, or increase timeout in `mcp-clients.ts`

### No tools loaded

**Symptom**: Agent has 0 tools
**Cause**: MCP server connection failed or returned invalid schemas
**Solution**: Check API keys, verify MCP server is accessible

### Invalid tool schema

**Symptom**: Warning logs about tool normalization
**Cause**: MCP server returned non-standard tool schema
**Solution**: Tools are automatically filtered, agent continues with valid tools

### Authentication failed

**Symptom**: 401 error from Neon MCP
**Cause**: Invalid or missing `NEON_API_KEY`
**Solution**: Verify API key is set correctly in environment

## Related Documentation

- [Mastra MCP Overview](./MASTRA_MCP.md)
- [Mastra Agents Guide](./MASTRA_AGENTS.md)
- [Freestyle Sandboxes Docs](https://freestyle.sh/docs)
- [Neon MCP Server](https://neon.tech/docs/mcp)
- [Model Context Protocol](https://modelcontextprotocol.io/)
