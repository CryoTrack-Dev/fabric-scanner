import type { DecodedBlock } from "../fabric/blockDecoder";

export interface SyncDeps {
  getChainHeight(): Promise<number>;
  getCurrentBlockHash(): Promise<string>;
  getLastIndexedBlockNumber(): Promise<number | null>;
  fetchAndDecodeBlock(blockNumber: number): Promise<DecodedBlock>;
  persistBlock(block: DecodedBlock): Promise<void>;
  setBlockHash(blockNumber: number, hash: string): Promise<void>;
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
    const block = await deps.fetchAndDecodeBlock(blockNumber);
    await deps.persistBlock(block);
    if (blockNumber > 0) {
      await deps.setBlockHash(blockNumber - 1, block.previousHash);
    }
    indexedBlockNumbers.push(blockNumber);
  }

  if (indexedBlockNumbers.length > 0) {
    const tipBlockNumber = height - 1;
    const currentBlockHash = await deps.getCurrentBlockHash();
    await deps.setBlockHash(tipBlockNumber, currentBlockHash);
  }

  return { indexedBlockNumbers };
}
