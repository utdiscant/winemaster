import { defineConfig } from "drizzle-kit";

// Generates SQL migrations from shared/schema.ts; wrangler applies them to D1
export default defineConfig({
  out: "./migrations",
  schema: "./shared/schema.ts",
  dialect: "sqlite",
});
