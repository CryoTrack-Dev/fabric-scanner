import type { PrismaClient } from "@prisma/client";
import { prisma as defaultPrisma } from "../db/prisma";
import type { TransactionSummary } from "./transactions";

export interface BlockSummary {
  number: number;
  hash: string | null;
  txCount: number;
  timestamp: Date;
}

export interface BlockDetail extends BlockSummary {
  previousHash: string;
  dataHash: string;
  transactions: TransactionSummary[];
}

export async function listBlocks(
  opts: { cursor?: number; limit?: number },
  db: PrismaClient = defaultPrisma,
): Promise<{ items: BlockSummary[]; nextCursor: number | null }> {
  const limit = opts.limit ?? 20;
  const blocks = await db.block.findMany({
    take: limit + 1,
    ...(opts.cursor !== undefined ? { cursor: { number: opts.cursor }, skip: 1 } : {}),
    orderBy: { number: "desc" },
  });

  const hasMore = blocks.length > limit;
  const items = (hasMore ? blocks.slice(0, limit) : blocks).map((b) => ({
    number: b.number,
    hash: b.hash,
    txCount: b.txCount,
    timestamp: b.timestamp,
  }));

  return { items, nextCursor: hasMore ? items[items.length - 1].number : null };
}

export async function getBlockByNumber(
  number: number,
  db: PrismaClient = defaultPrisma,
): Promise<BlockDetail | null> {
  const block = await db.block.findUnique({
    where: { number },
    include: { transactions: { orderBy: { indexInBlock: "asc" } } },
  });
  if (!block) return null;

  return {
    number: block.number,
    hash: block.hash,
    previousHash: block.previousHash,
    dataHash: block.dataHash,
    txCount: block.txCount,
    timestamp: block.timestamp,
    transactions: block.transactions.map((tx) => ({
      txId: tx.txId,
      blockNumber: tx.blockNumber,
      chaincodeName: tx.chaincodeName,
      functionName: tx.functionName,
      isValid: tx.isValid,
      timestamp: tx.timestamp,
    })),
  };
}
