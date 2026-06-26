import { Pool } from "pg";

const globalForPg = globalThis as unknown as {
  pgPool?: Pool;
};

export const pool =
  globalForPg.pgPool ??
  new Pool({
    host: "localhost",
    port: 5432,
    database: "linea_db",
    user: "linea",
    password: "linea_password",
  });

if (process.env.NODE_ENV !== "production") {
  globalForPg.pgPool = pool;
}