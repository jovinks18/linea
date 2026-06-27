import type { PoolConfig } from "pg";

const localDatabaseConfig: PoolConfig = {
  host: "localhost",
  port: 5432,
  database: "linea_db",
  user: "linea",
  password: "linea_password",
};

export function getDatabaseConfig(
  environment: NodeJS.ProcessEnv = process.env
): PoolConfig {
  const connectionString = environment.DATABASE_URL?.trim();

  return connectionString
    ? { connectionString }
    : { ...localDatabaseConfig };
}
