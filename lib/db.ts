import { Pool } from "pg";
import { getDatabaseConfig } from "./db-config";

const globalForPg = globalThis as unknown as {
  pgPool?: Pool;
};

export const pool =
  globalForPg.pgPool ??
  new Pool(getDatabaseConfig());

if (process.env.NODE_ENV !== "production") {
  globalForPg.pgPool = pool;
}
