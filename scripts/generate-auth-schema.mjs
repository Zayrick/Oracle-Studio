import { randomBytes } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { convertV4MiniflareOptions, Miniflare } from "miniflare";
import { getMigrations } from "better-auth/db/migration";

import { createAuth } from "../app/features/auth/auth.server.ts";

// Generate against a disposable, empty D1 instance. Never touch an existing database.
const output = resolve(process.argv[2] ?? "migrations/0001_auth.sql");
const runtime = new Miniflare(
  convertV4MiniflareOptions({
    name: "auth-schema",
    modules: true,
    script:
      "export default { fetch() { return new Response(null, { status: 404 }); } }",
    compatibilityDate: "2026-08-14",
    d1Databases: ["AUTH_DB"],
  }),
);

try {
  const auth = createAuth({
    AUTH_DB: await runtime.getD1Database("AUTH_DB"),
    OPENROUTER_MANAGEMENT_KEY: "sk-or-schema-placeholder",
    OPENROUTER_WORKSPACE_ID: "b6bf575e-a29c-4fdd-bfca-c6c29a8b2356",
    AI_KEY_ENCRYPTION_SECRET: randomBytes(32).toString("base64"),
    // Schema inspection never invokes the email callback; no live credentials needed.
    RESEND_API_KEY: "re_schema_generation_placeholder",
    AUTH_EMAIL_FROM: "noreply@example.com",
    BETTER_AUTH_URL: "https://example.com",
    BETTER_AUTH_SECRET: randomBytes(32).toString("hex"),
    TURNSTILE_SITE_KEY: "1x00000000000000000000AA",
    TURNSTILE_SECRET_KEY: "1x0000000000000000000000000000000AA",
  });
  const migration = await getMigrations(auth.options);
  const sql = await migration.compileMigrations();
  await mkdir(dirname(output), { recursive: true });
  await writeFile(
    output,
    `-- Generated from Better Auth for Oracle Studio.\n-- Applied migrations are immutable; use a new migration for future changes.\n\n${sql}\n`,
    { flag: "wx" },
  );
  console.log(`Authentication schema written to ${output}`);
} finally {
  await runtime.dispose();
}
