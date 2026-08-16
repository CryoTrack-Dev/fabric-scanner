// scanner/scripts/indexer.ts
import "dotenv/config";
import type { Prisma } from "@prisma/client";
import { prisma } from "../src/lib/db/prisma";
import { loadEnv } from "../src/lib/env";
import { connectToFabric, closeFabricConnection } from "../src/lib/fabric/connection";
import { getChainInfo, getBlockByNumber } from "../src/lib/fabric/qscc";
import { decodeBlock } from "../src/lib/fabric/blockDecoder";
import { syncOnce, type SyncDeps } from "../src/lib/indexer/sync";

async function main() {
  const env = loadEnv();
  const connection = await connectToFabric(env);

  const deps: SyncDeps = {
    async getChainHeight() {
      const info = await getChainInfo(connection.qscc, env.channelName);
      return info.height;
    },
    async getCurrentBlockHash() {
      const info = await getChainInfo(connection.qscc, env.channelName);
      return info.currentBlockHash;
    },
    async getLastIndexedBlockNumber() {
      const latest = await prisma.block.findFirst({ orderBy: { number: "desc" } });
      return latest?.number ?? null;
    },
    async fetchAndDecodeBlock(blockNumber) {
      const raw = await getBlockByNumber(connection.qscc, env.channelName, blockNumber);
      return decodeBlock(raw);
    },
    async persistBlock(block) {
      await prisma.block.create({
        data: {
          number: block.number,
          previousHash: block.previousHash,
          dataHash: block.dataHash,
          txCount: block.transactions.length,
          timestamp: block.transactions[0]?.timestamp ?? new Date(),
          transactions: {
            create: block.transactions.map((tx) => ({
              txId: tx.txId,
              indexInBlock: tx.indexInBlock,
              timestamp: tx.timestamp,
              creatorMspId: tx.creatorMspId,
              chaincodeName: tx.chaincodeName,
              functionName: tx.functionName,
              // Cast to Prisma.InputJsonValue: these are plain, JSON-serializable
              // arrays/objects (no methods/undefined), but TS's structural check
              // against the generated InputJsonValue union doesn't recognize
              // concrete array/interface types as matching InputJsonArray.
              args: tx.args as unknown as Prisma.InputJsonValue,
              validationCode: tx.validationCode,
              isValid: tx.isValid,
              endorsingMspIds: tx.endorsingMspIds as unknown as Prisma.InputJsonValue,
              readSet: tx.readSet as unknown as Prisma.InputJsonValue,
              writeSet: tx.writeSet as unknown as Prisma.InputJsonValue,
            })),
          },
        },
      });
    },
    async setBlockHash(blockNumber, hash) {
      await prisma.block.update({ where: { number: blockNumber }, data: { hash } });
    },
    logSkippedBlock(blockNumber, error) {
      console.error(`Skipping block ${blockNumber} — failed to index:`, error);
    },
  };

  console.log(`CryoTrack Fabric scanner indexer started — polling every ${env.pollIntervalMs}ms`);

  let stopped = false;
  process.on("SIGINT", () => {
    stopped = true;
  });
  process.on("SIGTERM", () => {
    stopped = true;
  });

  while (!stopped) {
    try {
      const result = await syncOnce(deps);
      if (result.indexedBlockNumbers.length > 0) {
        const first = result.indexedBlockNumbers[0];
        const last = result.indexedBlockNumbers[result.indexedBlockNumbers.length - 1];
        console.log(`Indexed blocks ${first}–${last}`);
      }
    } catch (error) {
      console.error("Indexer sync pass failed, will retry:", error);
    }
    await new Promise((resolve) => setTimeout(resolve, env.pollIntervalMs));
  }

  closeFabricConnection(connection);
  await prisma.$disconnect();
}

main().catch((error) => {
  console.error("Indexer failed to start:", error);
  process.exit(1);
});
