import type { DecodedBlock } from "../fabric/blockDecoder";

export interface SyncDeps {
  getChainHeight(): Promise<number>;
  getCurrentBlockHash(): Promise<string>;
  getLastIndexedBlockNumber(): Promise<number | null>;
  fetchAndDecodeBlock(blockNumber: number): Promise<DecodedBlock>;
  persistBlock(block: DecodedBlock): Promise<void>;
  setBlockHash(blockNumber: number, hash: string): Promise<void>;
  /**
   * Called when a single block fails to index (e.g. a persistence error such
   * as a txId unique-constraint violation). The block is logged and skipped
   * so a single bad block can't wedge the indexer forever; subsequent blocks
   * in the same pass are still processed. Kept out of console.error directly
   * so this module stays pure/testable.
   */
  logSkippedBlock(blockNumber: number, error: unknown): void;
}

export interface SyncResult {
  indexedBlockNumbers: number[];
}

export async function syncOnce(deps: SyncDeps): Promise<SyncResult> {
  const height = await deps.getChainHeight();
  const lastIndexed = await deps.getLastIndexedBlockNumber();
  const nextToIndex = lastIndexed === null ? 0 : lastIndexed + 1;

  const indexedBlockNumbers: number[] = [];

  for (let blockNumber = nextToIndex; blockNumber < height; blockNumber++) {
    try {
      const block = await deps.fetchAndDecodeBlock(blockNumber);
      await deps.persistBlock(block);
      if (blockNumber > 0) {
        await deps.setBlockHash(blockNumber - 1, block.previousHash);
      }
      indexedBlockNumbers.push(blockNumber);
    } catch (error) {
      deps.logSkippedBlock(blockNumber, error);
      continue;
    }
  }

  if (indexedBlockNumbers.length > 0) {
    const tipBlockNumber = height - 1;
    const currentBlockHash = await deps.getCurrentBlockHash();
    await deps.setBlockHash(tipBlockNumber, currentBlockHash);
  }

  return { indexedBlockNumbers };
}
