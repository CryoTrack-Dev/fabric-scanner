import type { PrismaClient } from "@prisma/client";
import { prisma as defaultPrisma } from "../db/prisma";

export interface IndexerStatus {
  chainHeight: number;
  lastIndexedBlock: number | null;
  isStalled: boolean;
}

const STALL_THRESHOLD_BLOCKS = 3;

export async function getIndexerStatus(
  chainHeight: number,
  db: PrismaClient = defaultPrisma,
): Promise<IndexerStatus> {
  const latest = await db.block.findFirst({ orderBy: { number: "desc" } });
  const lastIndexedBlock = latest?.number ?? null;
  const lag = chainHeight - (lastIndexedBlock === null ? 0 : lastIndexedBlock + 1);

  return {
    chainHeight,
    lastIndexedBlock,
    isStalled: lag > STALL_THRESHOLD_BLOCKS,
  };
}
