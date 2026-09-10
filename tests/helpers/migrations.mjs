import { readFile, readdir } from "node:fs/promises";

export async function migrateTestDatabase(db) {
  const directory = new URL("../../migrations/", import.meta.url);
  const names = (await readdir(directory))
    .filter((name) => name.endsWith(".sql"))
    .sort();
  for (const name of names) {
    const sql = await readFile(new URL(name, directory), "utf8");
    const statements = sql
      .replace(/^--.*$/gm, "")
      .split(";")
      .map((sql) => sql.trim())
      .filter(Boolean);
    await db.batch(statements.map((sql) => db.prepare(sql)));
  }
}
