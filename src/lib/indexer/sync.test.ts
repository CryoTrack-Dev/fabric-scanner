import { describe, it, expect, vi } from "vitest";
import { syncOnce, type SyncDeps } from "./sync";
import type { DecodedBlock } from "../fabric/blockDecoder";

function fakeBlock(number: number): DecodedBlock {
  return {
    number,
    previousHash: `hash-of-${number - 1}`,
    dataHash: `data-${number}`,
    transactions: [],
  };
}

function makeDeps(overrides: Partial<SyncDeps> = {}): SyncDeps {
  return {
    getChainHeight: vi.fn().mockResolvedValue(0),
    getCurrentBlockHash: vi.fn().mockResolvedValue("tip-hash"),
    getLastIndexedBlockNumber: vi.fn().mockResolvedValue(null),
    fetchAndDecodeBlock: vi.fn(async (n: number) => fakeBlock(n)),
    persistBlock: vi.fn().mockResolvedValue(undefined),
    setBlockHash: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

describe("syncOnce", () => {
  it("does nothing when already caught up", async () => {
    const deps = makeDeps({
      getChainHeight: vi.fn().mockResolvedValue(3),
      getLastIndexedBlockNumber: vi.fn().mockResolvedValue(2),
    });

    const result = await syncOnce(deps);

    expect(result.indexedBlockNumbers).toEqual([]);
    expect(deps.fetchAndDecodeBlock).not.toHaveBeenCalled();
    expect(deps.setBlockHash).not.toHaveBeenCalled();
  });

  it("indexes from block 0 when nothing is indexed yet", async () => {
    const deps = makeDeps({
      getChainHeight: vi.fn().mockResolvedValue(3),
      getLastIndexedBlockNumber: vi.fn().mockResolvedValue(null),
    });

    const result = await syncOnce(deps);

    expect(result.indexedBlockNumbers).toEqual([0, 1, 2]);
    expect(deps.fetchAndDecodeBlock).toHaveBeenNthCalledWith(1, 0);
    expect(deps.fetchAndDecodeBlock).toHaveBeenNthCalledWith(2, 1);
    expect(deps.fetchAndDecodeBlock).toHaveBeenNthCalledWith(3, 2);
    expect(deps.persistBlock).toHaveBeenCalledTimes(3);
  });

  it("indexes only new blocks since the last indexed one", async () => {
    const deps = makeDeps({
      getChainHeight: vi.fn().mockResolvedValue(5),
      getLastIndexedBlockNumber: vi.fn().mockResolvedValue(2),
    });

    const result = await syncOnce(deps);

    expect(result.indexedBlockNumbers).toEqual([3, 4]);
  });

  it("backfills each indexed block's hash from the next block's previousHash", async () => {
    const deps = makeDeps({
      getChainHeight: vi.fn().mockResolvedValue(3),
      getLastIndexedBlockNumber: vi.fn().mockResolvedValue(null),
    });

    await syncOnce(deps);

    // block 0 has no predecessor to backfill via this mechanism (guarded by blockNumber > 0)
    expect(deps.setBlockHash).toHaveBeenCalledWith(0, "hash-of-0");
    expect(deps.setBlockHash).toHaveBeenCalledWith(1, "hash-of-1");
  });

  it("sets the chain tip's hash from GetChainInfo's currentBlockHash", async () => {
    const deps = makeDeps({
      getChainHeight: vi.fn().mockResolvedValue(3),
      getLastIndexedBlockNumber: vi.fn().mockResolvedValue(null),
      getCurrentBlockHash: vi.fn().mockResolvedValue("tip-hash"),
    });

    await syncOnce(deps);

    expect(deps.setBlockHash).toHaveBeenCalledWith(2, "tip-hash");
  });
});
