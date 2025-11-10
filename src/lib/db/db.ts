import { drizzle } from "drizzle-orm/neon-http";
import { neon } from "@neondatabase/serverless";
import * as schema from "./schema";
import { mainConfig } from "../config";

const sql = neon(mainConfig.database.url);
export const db = drizzle({ client: sql, schema });
