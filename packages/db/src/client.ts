import { drizzle, type PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import postgres, { type Sql } from 'postgres';
import * as schema from './schema';

let activeUrl: string | undefined;
let closingPromise: Promise<void> | undefined;
let database: PostgresJsDatabase<typeof schema> | undefined;
let sqlClient: Sql | undefined;

function databaseUrl(): string {
  const value = process.env.DATABASE_URL?.trim();
  if (!value) throw new Error('DATABASE_URL is required');
  return value;
}

export function getDatabaseClient(): PostgresJsDatabase<typeof schema> {
  if (closingPromise) throw new Error('Database client is closing');

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

export function closeDatabaseClient(): Promise<void> {
  if (closingPromise) return closingPromise;
  if (!sqlClient) return Promise.resolve();

  const clientToClose = sqlClient;
  let resolveClose!: () => void;
  let rejectClose!: (reason: unknown) => void;
  const closePromise = new Promise<void>((resolve, reject) => {
    resolveClose = resolve;
    rejectClose = reject;
  });
  closingPromise = closePromise;

  void (async () => {
    try {
      await clientToClose.end();
      resolveClose();
    } catch (error) {
      rejectClose(error);
    } finally {
      activeUrl = undefined;
      closingPromise = undefined;
      database = undefined;
      sqlClient = undefined;
    }
  })();

  return closePromise;
}
