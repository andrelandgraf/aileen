# AI Chat Template: Cloudflare, Assistant UI, Neon

A modern, production-ready template for building full-stack React applications using Next.js on Cloudflare with Assistant UI and Neon.

## Getting Started

### Environment Variables

Create a `.env` file in the root of the project by copying the `example.env` file:

```bash
cp example.env .env
```

### Set up Neon

We use Neon for Storage (Postgres) and Authentication. The schema is currently very simple and only includes the users_sync table but we can expand for agent memory and application data. [Drizzle](https://orm.drizzle.team/) is used for database schema management.

First, sign up for a Neon account and create a new project: [Neon](https://neon.com/signup)

Next, enable Neon Auth by navigating to Configuration > Environment Variables > Next.js and copy the variables to the `.env` file, replacing the placeholder values.

### Set up Assistant UI Cloud

We use Assistant UI for AI chat functionality and Assistant UI Cloud for persisting the chat history.

Sign up for a Assistant UI Cloud account and create a new project: [Assistant UI Cloud](https://cloud.assistant-ui.com/)

From there, copy the project base URL and project slug and add them to the `.env` file. Optionally, you can also generate an API key and add it to the `.env` file. This is not required for the base setup of this template but useful for additional features.

### Model Provider Setup

This template uses Vercel's AI SDK and Assistant UI for model serving. The `example.env` file has OpenAI set as the provider. Other providers are also supported. Refer to the [AI SDK Providers documentation](https://ai-sdk.dev/docs/foundations/providers-and-models) for more information.

Create a new API key for your preferred provider and add it to the `.env` file.

```txt
OPENAI_API_KEY=your_openai_api_key
```

### Installation

Install the dependencies:

```bash
npm install
```

### Development

Run the development server:

```bash
npm run dev
```

Your application will be available at `http://localhost:3000`.

## Building for Production

Create a production build:

```bash
npm run build
```

## Deployment

Deployment is done using the Wrangler CLI.

To build and deploy directly to production:

```sh
npm run deploy
```

## Styling

This template comes with [Shadcn UI](https://ui.shadcn.com/) and [Tailwind CSS](https://tailwindcss.com/) already configured for a simple default starting experience. You can use whatever CSS framework you prefer.
