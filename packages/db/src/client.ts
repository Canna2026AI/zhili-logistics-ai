import { drizzle, type PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import postgres, { type Sql } from 'postgres';
import * as schema from './schema';

let activeUrl: string | undefined;
let database: PostgresJsDatabase<typeof schema> | undefined;
let sqlClient: Sql | undefined;

function databaseUrl(): string {
  const value = process.env.DATABASE_URL?.trim();
  if (!value) throw new Error('DATABASE_URL is required');
  return value;
}

export function getDatabaseClient(): PostgresJsDatabase<typeof schema> {
  const url = databaseUrl();

  if (database && activeUrl !== url) {
    throw new Error('DATABASE_URL changed while the database client was active');
  }

  if (!database) {
    activeUrl = url;
    sqlClient = postgres(url);
    database = drizzle(sqlClient, { schema });
  }

  return database;
}

export async function closeDatabaseClient(): Promise<void> {
  await sqlClient?.end();
  activeUrl = undefined;
  database = undefined;
  sqlClient = undefined;
}
