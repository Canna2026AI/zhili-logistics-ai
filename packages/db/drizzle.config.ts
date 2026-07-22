import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  dialect: 'postgresql',
  out: './migrations',
  schema: './src/schema/index.ts',
  dbCredentials: {
    url: process.env.DATABASE_URL ?? 'postgresql://zhili_app@localhost:5432/zhili',
  },
  strict: true,
});
