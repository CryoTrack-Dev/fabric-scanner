import { execSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import path from "node:path";
import fs from "node:fs";
import { PrismaClient } from "@prisma/client";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";

export function createTestPrismaClient(): { prisma: PrismaClient; cleanup: () => void } {
  const dbPath = path.join(process.cwd(), `test-${randomUUID()}.db`);
  const databaseUrl = `file:${dbPath}`;

  execSync("npx prisma db push", {
    env: { ...process.env, DATABASE_URL: databaseUrl },
    stdio: "inherit",
  });

  const adapter = new PrismaBetterSqlite3({ url: databaseUrl });
  const prisma = new PrismaClient({ adapter });

  return {
    prisma,
    cleanup: () => {
      fs.rmSync(dbPath, { force: true });
      fs.rmSync(`${dbPath}-journal`, { force: true });
    },
  };
}
