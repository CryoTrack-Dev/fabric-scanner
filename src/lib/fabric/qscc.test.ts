import { describe, it, expect, vi } from "vitest";
import { common } from "fabric-protos";
import type { Contract } from "@hyperledger/fabric-gateway";
import { getChainInfo, getBlockByNumber, getTransactionByID } from "./qscc";

function fakeContract(returnValue: Uint8Array): Contract {
  return {
    evaluateTransaction: vi.fn().mockResolvedValue(returnValue),
  } as unknown as Contract;
}

describe("getChainInfo", () => {
  it("decodes BlockchainInfo bytes and calls qscc.GetChainInfo with the channel name", async () => {
    const bytes = common.BlockchainInfo.encode({
      height: 7,
      currentBlockHash: Buffer.from("curhash"),
      previousBlockHash: Buffer.from("prevhash"),
    }).finish();
    const contract = fakeContract(bytes);

    const info = await getChainInfo(contract, "supplychain");

    expect(info.height).toBe(7);
    expect(info.currentBlockHash).toBe(Buffer.from("curhash").toString("hex"));
    expect(contract.evaluateTransaction).toHaveBeenCalledWith("GetChainInfo", "supplychain");
  });
});

describe("getBlockByNumber", () => {
  it("calls qscc.GetBlockByNumber with channel and decimal block number, returns raw bytes", async () => {
    const raw = Buffer.from("raw-block-bytes");
    const contract = fakeContract(raw);

    const result = await getBlockByNumber(contract, "supplychain", 42);

    expect(result).toEqual(raw);
    expect(contract.evaluateTransaction).toHaveBeenCalledWith("GetBlockByNumber", "supplychain", "42");
  });
});

describe("getTransactionByID", () => {
  it("calls qscc.GetTransactionByID with channel and tx id, returns raw bytes", async () => {
    const raw = Buffer.from("raw-tx-bytes");
    const contract = fakeContract(raw);

    const result = await getTransactionByID(contract, "supplychain", "tx1");

    expect(result).toEqual(raw);
    expect(contract.evaluateTransaction).toHaveBeenCalledWith("GetTransactionByID", "supplychain", "tx1");
  });
});
