# Aileen - AI Code Generation Platform

Full stack application codegen platform.

## About

Aileen is a vibe-coding/code-generation platform that builds Next.js applications with Neon databases based on natural language prompts.

Each Aileen project is a standalone, version-controlled Next.js application with its own Neon database that is fully developed and managed by the Aileen agent.

### Key Features

- Creates projects with automated database, authentication, and development server setup
- Manages project versions with database snapshots and version control
- Provides an AI chat interface for collaborative development
- Orchestrates complex initialization workflows using Vercel Workflows
- Tracks and manages environment secrets per project version

### Platform Services

- **Neon** - Serverless Postgres database for storing users, projects, project versions, and project secrets
- **Neon Auth** - Platform user authentication powered by Stack Auth
- **Assistant UI** - AI chat interface with conversation persistence
- **Mastra** - AI agents and workflow orchestration
- **Vercel** - Platform hosting provider (Next.js hosting and Workflow Development Kit for background tasks)

### Per-Project Provisioned Services

Each created project includes the following:

- **Neon Database** - Dedicated Postgres instance
- **Neon Auth** - Authentication configured by default
- **Freestyle** - Development server (sandbox) and git repository

## Getting Started

Follow these steps to run Aileen locally:

### Prerequisites

Before starting, you must create accounts with the following services and obtain the required API credentials:

- **Assistant UI Cloud** - Required for the chat interface and conversation management
- **Neon** (with Neon Auth) - Required for database provisioning and platform authentication
- **Anthropic** - Required for inference (Claude Haiku 4.5)
- **OpenAI** - Optional, backup model

You can change the model provider by changing the `@ai-sdk` configuration in `src/mastra/agents/codegenAgent.ts`.

### Environment Variables

Copy the example environment file and fill in your API keys from the services above:

```bash
cp example.env .env
```

All required environment variables are documented in `example.env`.

### Installation

```bash
bun install
```

### Initialize Database

Use Drizzle ORM to initialize the platform database:

```bash
bun run db:migrate
```

### Development

Aileen runs on two separate servers in development. The Mastra server must be running concurrently for code-generation capabilities.

Run the web server:

```bash
bun run dev
```

Run the Mastra agent server:

```bash
bun run mastra:dev
```

Your application will be available at `http://localhost:3000`.

## Deployment

Aileen requires deployment to two separate cloud platforms:

### Mastra Cloud (Agent Deployment)

Deploy the Mastra agent to Mastra Cloud for production agent execution. Add all required environment variables to your Mastra Cloud project configuration.

### Vercel (Next.js Deployment)

Deploy the Next.js application to Vercel. Ensure all environment variables from your `.env` file are added to the Vercel project environment settings.

For complete deployment instructions, refer to the official documentation for [Mastra Cloud](https://mastra.ai) and [Vercel](https://vercel.com/docs).
