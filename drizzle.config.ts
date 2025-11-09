import { defineConfig } from "drizzle-kit";
import { mainConfig } from "@/lib/config";

export default defineConfig({
  schema: "./src/lib/db/schema.ts",
  out: "./migrations",
  dialect: "postgresql",
  dbCredentials: {
    url: mainConfig.database.url,
  },
});
