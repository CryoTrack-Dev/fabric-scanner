import type { PrismaClient } from "@prisma/client";
import { prisma as defaultPrisma } from "../db/prisma";

export type SearchResult =
  | { type: "block"; number: number }
  | { type: "transaction"; txId: string }
  | { type: "not_found" };

export async function search(query: string, db: PrismaClient = defaultPrisma): Promise<SearchResult> {
  const trimmed = query.trim();
  if (trimmed === "") return { type: "not_found" };

  if (/^\d+$/.test(trimmed)) {
    const block = await db.block.findUnique({ where: { number: Number(trimmed) } });
    if (block) return { type: "block", number: block.number };
  }

  const tx = await db.transaction.findUnique({ where: { txId: trimmed } });
  if (tx) return { type: "transaction", txId: tx.txId };

  return { type: "not_found" };
}
