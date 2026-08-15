import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { PrismaClient } from "@prisma/client";
import { createTestPrismaClient } from "./testDb";
import { listTransactions, getTransactionById } from "./transactions";

let prisma: PrismaClient;
let cleanup: () => void;

beforeAll(async () => {
  ({ prisma, cleanup } = createTestPrismaClient());
  await prisma.block.create({
    data: { number: 0, hash: "h0", previousHash: "", dataHash: "d0", txCount: 2, timestamp: new Date() },
  });
  // Note: args/endorsingMspIds/readSet/writeSet are Prisma `Json` fields —
  // pass plain JS values directly (arrays/objects), not JSON.stringify'd
  // strings, or they'll be stored as double-encoded strings instead of
  // JSON arrays and the reads below will return strings, not arrays.
  await prisma.transaction.create({
    data: {
      txId: "tx-a",
      blockNumber: 0,
      indexInBlock: 0,
      timestamp: new Date(),
      creatorMspId: "ExporterMSP",
      chaincodeName: "cryotrack",
      functionName: "CommissionShipment",
      args: ["a1"],
      validationCode: "VALID",
      isValid: true,
      endorsingMspIds: ["ExporterMSP"],
      readSet: [],
      writeSet: [{ namespace: "cryotrack", key: "k1", isDelete: false, value: "v1" }],
    },
  });
  await prisma.transaction.create({
    data: {
      txId: "tx-b",
      blockNumber: 0,
      indexInBlock: 1,
      timestamp: new Date(),
      creatorMspId: "ExporterMSP",
      chaincodeName: "cryotrack",
      functionName: "RecordHandoff",
      args: [],
      validationCode: "VALID",
      isValid: true,
      endorsingMspIds: ["ExporterMSP"],
      readSet: [],
      writeSet: [],
    },
  });
});

afterAll(async () => {
  await prisma.$disconnect();
  cleanup();
});

describe("listTransactions", () => {
  it("returns transactions newest-first within a block by indexInBlock", async () => {
    const page = await listTransactions({}, prisma);
    expect(page.items.map((t) => t.txId)).toEqual(["tx-b", "tx-a"]);
  });

  it("filters by functionName", async () => {
    const page = await listTransactions({ functionName: "RecordHandoff" }, prisma);
    expect(page.items.map((t) => t.txId)).toEqual(["tx-b"]);
  });
});

describe("getTransactionById", () => {
  it("returns full detail including parsed args and writeSet", async () => {
    const tx = await getTransactionById("tx-a", prisma);
    expect(tx?.args).toEqual(["a1"]);
    expect(tx?.writeSet).toEqual([{ namespace: "cryotrack", key: "k1", isDelete: false, value: "v1" }]);
  });

  it("returns null for an unknown txId", async () => {
    expect(await getTransactionById("nope", prisma)).toBeNull();
  });
});
