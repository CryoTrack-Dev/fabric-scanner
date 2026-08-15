import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { PrismaClient } from "@prisma/client";
import { createTestPrismaClient } from "./testDb";
import { listBlocks, getBlockByNumber } from "./blocks";

let prisma: PrismaClient;
let cleanup: () => void;

beforeAll(async () => {
  ({ prisma, cleanup } = createTestPrismaClient());
  for (let i = 0; i < 5; i++) {
    await prisma.block.create({
      data: {
        number: i,
        hash: `hash-${i}`,
        previousHash: i === 0 ? "" : `hash-${i - 1}`,
        dataHash: `data-${i}`,
        txCount: 1,
        timestamp: new Date(2026, 0, i + 1),
        transactions: {
          create: [
            {
              txId: `tx-${i}`,
              indexInBlock: 0,
              timestamp: new Date(2026, 0, i + 1),
              creatorMspId: "ExporterMSP",
              chaincodeName: "cryotrack",
              functionName: "CommissionShipment",
              args: [`arg-${i}`],
              validationCode: "VALID",
              isValid: true,
              endorsingMspIds: ["ExporterMSP"],
              readSet: [],
              writeSet: [],
            },
          ],
        },
      },
    });
  }
});

afterAll(async () => {
  await prisma.$disconnect();
  cleanup();
});

describe("listBlocks", () => {
  it("returns blocks newest-first with a cursor for the next page", async () => {
    const page1 = await listBlocks({ limit: 2 }, prisma);
    expect(page1.items.map((b) => b.number)).toEqual([4, 3]);
    expect(page1.nextCursor).toBe(3);

    const page2 = await listBlocks({ cursor: page1.nextCursor!, limit: 2 }, prisma);
    expect(page2.items.map((b) => b.number)).toEqual([2, 1]);
  });

  it("returns null nextCursor on the last page", async () => {
    const page = await listBlocks({ cursor: 1, limit: 10 }, prisma);
    expect(page.items.map((b) => b.number)).toEqual([0]);
    expect(page.nextCursor).toBeNull();
  });
});

describe("getBlockByNumber", () => {
  it("returns block detail with its transactions", async () => {
    const block = await getBlockByNumber(2, prisma);
    expect(block?.number).toBe(2);
    expect(block?.transactions).toHaveLength(1);
    expect(block?.transactions[0].txId).toBe("tx-2");
  });

  it("returns null for a non-existent block", async () => {
    expect(await getBlockByNumber(999, prisma)).toBeNull();
  });
});
