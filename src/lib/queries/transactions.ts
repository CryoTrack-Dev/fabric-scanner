import type { PrismaClient } from "@prisma/client";
import { prisma as defaultPrisma } from "../db/prisma";
import type { ReadSetEntry, WriteSetEntry } from "../fabric/blockDecoder";

export interface TransactionSummary {
  txId: string;
  blockNumber: number;
  chaincodeName: string;
  functionName: string;
  isValid: boolean;
  timestamp: Date;
}

export interface TransactionDetail extends TransactionSummary {
  creatorMspId: string;
  args: string[];
  validationCode: string;
  endorsingMspIds: string[];
  readSet: ReadSetEntry[];
  writeSet: WriteSetEntry[];
}

export async function listTransactions(
  opts: { cursor?: string; limit?: number; chaincodeName?: string; functionName?: string },
  db: PrismaClient = defaultPrisma,
): Promise<{ items: TransactionSummary[]; nextCursor: string | null }> {
  const limit = opts.limit ?? 20;
  const where = {
    ...(opts.chaincodeName ? { chaincodeName: opts.chaincodeName } : {}),
    ...(opts.functionName ? { functionName: opts.functionName } : {}),
  };

  const txs = await db.transaction.findMany({
    take: limit + 1,
    ...(opts.cursor ? { cursor: { txId: opts.cursor }, skip: 1 } : {}),
    where,
    orderBy: [{ blockNumber: "desc" }, { indexInBlock: "desc" }],
  });

  const hasMore = txs.length > limit;
  const rows = hasMore ? txs.slice(0, limit) : txs;
  const items = rows.map((tx) => ({
    txId: tx.txId,
    blockNumber: tx.blockNumber,
    chaincodeName: tx.chaincodeName,
    functionName: tx.functionName,
    isValid: tx.isValid,
    timestamp: tx.timestamp,
  }));

  return { items, nextCursor: hasMore ? items[items.length - 1].txId : null };
}

export async function getTransactionById(
  txId: string,
  db: PrismaClient = defaultPrisma,
): Promise<TransactionDetail | null> {
  const tx = await db.transaction.findUnique({ where: { txId } });
  if (!tx) return null;

  return {
    txId: tx.txId,
    blockNumber: tx.blockNumber,
    chaincodeName: tx.chaincodeName,
    functionName: tx.functionName,
    isValid: tx.isValid,
    timestamp: tx.timestamp,
    creatorMspId: tx.creatorMspId,
    args: tx.args as unknown as string[],
    validationCode: tx.validationCode,
    endorsingMspIds: tx.endorsingMspIds as unknown as string[],
    readSet: tx.readSet as unknown as ReadSetEntry[],
    writeSet: tx.writeSet as unknown as WriteSetEntry[],
  };
}
