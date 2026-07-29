import { defineConfig } from "drizzle-kit";

export default defineConfig({
  schema: "./lib/db/schema.sqlite.ts",
  out: "./lib/db/migrations-sqlite",
  dialect: "sqlite",
  dbCredentials: {
    url: "./fp-erp.db",
  },
});
