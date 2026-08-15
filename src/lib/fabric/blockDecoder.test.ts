import { describe, it, expect } from "vitest";
import { decodeBlock } from "./blockDecoder";
import { buildFixtureBlock } from "./testFixtures";

describe("decodeBlock", () => {
  it("decodes block header fields", () => {
    const block = decodeBlock(buildFixtureBlock({ blockNumber: 42 }));
    expect(block.number).toBe(42);
    expect(block.previousHash).toBe(Buffer.from("prevhash").toString("hex"));
    expect(block.dataHash).toBe(Buffer.from("datahash").toString("hex"));
    expect(block.transactions).toHaveLength(1);
  });

  it("decodes an endorser transaction's identity, chaincode invocation, and validation status", () => {
    const block = decodeBlock(
      buildFixtureBlock({
        txId: "tx-abc",
        chaincodeName: "cryotrack",
        functionName: "CommissionShipment",
        args: ["urn:epc:id:sscc:123"],
        creatorMspId: "ExporterMSP",
        validationCode: 0,
      }),
    );
    const tx = block.transactions[0];

    expect(tx.txId).toBe("tx-abc");
    expect(tx.indexInBlock).toBe(0);
    expect(tx.creatorMspId).toBe("ExporterMSP");
    expect(tx.chaincodeName).toBe("cryotrack");
    expect(tx.functionName).toBe("CommissionShipment");
    expect(tx.args).toEqual(["urn:epc:id:sscc:123"]);
    expect(tx.validationCode).toBe("VALID");
    expect(tx.isValid).toBe(true);
    expect(tx.endorsingMspIds).toEqual(["ExporterMSP"]);
  });

  it("decodes the read/write set", () => {
    const block = decodeBlock(buildFixtureBlock());
    const tx = block.transactions[0];

    expect(tx.readSet).toEqual([
      { namespace: "cryotrack", key: "facility:F1", version: { blockNum: 1, txNum: 0 } },
    ]);
    expect(tx.writeSet).toEqual([
      {
        namespace: "cryotrack",
        key: "shipment:urn:epc:id:sscc:123",
        isDelete: false,
        value: '{"status":"active"}',
      },
    ]);
  });

  it("maps a non-zero validation code to isValid: false", () => {
    const block = decodeBlock(buildFixtureBlock({ validationCode: 11 })); // MVCC_READ_CONFLICT
    expect(block.transactions[0].validationCode).toBe("MVCC_READ_CONFLICT");
    expect(block.transactions[0].isValid).toBe(false);
  });
});
