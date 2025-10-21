# Aileen - AI something something... get it?

An AI-powered development platform that helps developers build and deploy full-stack Next.js applications with automated infrastructure setup.

## Services Used

### Platform Services (Aileen itself)

- **Neon** - Postgres database for storing projects, versions, and secrets
- **Stack Auth** - Authentication for platform users
- **Assistant UI** - AI chat interface and conversation persistence
- **Mastra** - AI agents and workflow orchestration
- **Inngest** - Background job processing and workflow automation

### Provisioned Per-App (for each project created)

- **Neon** - Dedicated Postgres database with branching support
- **Stack Auth** - Authentication provider (auto-configured via Neon Auth)
- **Freestyle.sh** - Cloud development server with git integration

## What Does It Do?

- Creates projects with automated database, auth, and dev server setup
- Manages project versions with database snapshots and git commits
- Provides AI chat interface for development guidance
- Orchestrates complex initialization workflows with Inngest
- Tracks and manages environment secrets per project version

## Getting Started

### Environment Variables

Copy the example environment file and fill in your API keys:

```bash
cp example.env .env
```

All required environment variables are documented in `example.env`.

### Installation

```bash
npm install
```

### Development

```bash
npm run dev
```

Your application will be available at `http://localhost:3000`.
