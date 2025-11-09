"server-only";
import { z } from "zod";

// PreValidate is similar to Partial but with special handling for string enums
type PreValidate<ConfigData> = {
  [K in keyof ConfigData]: ConfigData[K] extends object
    ? PreValidate<ConfigData[K]> | undefined
    : ConfigData[K] extends string
      ? string | undefined // use string instead of enum values
      : ConfigData[K] | undefined;
};

class InvalidConfigurationError extends Error {
  constructor(issues: z.ZodError["issues"]) {
    let errorMessage =
      "Configuration validation error! Did you read the README.md and correctly set all required environment variables in .env file?";
    for (const issue of issues) {
      errorMessage = `${errorMessage}\n - ${issue.message} (at path: ${issue.path.join(".")})`;
    }
    super(errorMessage);
    this.name = "InvalidConfigurationError";
  }
}

const DatabaseSchema = z.object({
  url: z.string("DATABASE_URL must be defined."),
});

const NeonSchema = z.object({
  stackProjectId: z.string("NEXT_PUBLIC_STACK_PROJECT_ID must be defined."),
  stackPublishableClientKey: z.string(
    "NEXT_PUBLIC_STACK_PUBLISHABLE_CLIENT_KEY must be defined.",
  ),
  stackSecretServerKey: z.string("STACK_SECRET_SERVER_KEY must be defined."),
  apiKey: z.string(),
});

const AssistantUISchema = z.object({
  baseUrl: z.url("NEXT_PUBLIC_ASSISTANT_BASE_URL must be a valid URL."),
  apiKey: z.string("ASSISTANT_API_KEY must be defined."),
});

const FreestyleSchema = z.object({
  apiKey: z.string("FREESTYLE_API_KEY must be defined."),
});

const MastraSchema = z.object({
  apiUrl: z.url("NEXT_PUBLIC_MASTRA_API_URL must be a valid URL."),
});

const ConfigSchema = z.object({
  database: DatabaseSchema,
  neon: NeonSchema,
  mastra: MastraSchema,
  assistantUI: AssistantUISchema,
  freestyle: FreestyleSchema,
  encryptionKey: z
    .string("ENCRYPTION_KEY must be 32 characters long.")
    .length(
      64,
      "ENCRYPTION_KEY must be 64 characters long. Run `bun run scripts/get-encryption-key.ts` to generate a secure key.",
    ),
  public_url: z.url("NEXT_PUBLIC_APP_URL must be a valid URL."),
});
export type MainConfig = z.infer<typeof ConfigSchema>;

const config: PreValidate<MainConfig> = {
  database: {
    url: process.env.DATABASE_URL,
  },
  neon: {
    stackProjectId: process.env.NEXT_PUBLIC_STACK_PROJECT_ID,
    stackPublishableClientKey:
      process.env.NEXT_PUBLIC_STACK_PUBLISHABLE_CLIENT_KEY,
    stackSecretServerKey: process.env.STACK_SECRET_SERVER_KEY,
    apiKey: process.env.NEON_API_KEY,
  },
  assistantUI: {
    baseUrl: process.env.NEXT_PUBLIC_ASSISTANT_BASE_URL,
    apiKey: process.env.ASSISTANT_API_KEY,
  },
  mastra: {
    apiUrl: process.env.NEXT_PUBLIC_MASTRA_API_URL,
  },
  freestyle: {
    apiKey: process.env.FREESTYLE_API_KEY,
  },
  encryptionKey: process.env.ENCRYPTION_KEY,
  public_url: process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000",
};

const conf = ConfigSchema.safeParse(config);
if (!conf.success) {
  console.dir({ plop: conf }, { depth: null });
  throw new InvalidConfigurationError(conf.error.issues);
}

export const mainConfig = conf.data;
