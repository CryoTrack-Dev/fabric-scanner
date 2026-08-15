-- CreateTable
CREATE TABLE "Block" (
    "number" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "hash" TEXT,
    "previousHash" TEXT NOT NULL,
    "dataHash" TEXT NOT NULL,
    "txCount" INTEGER NOT NULL,
    "timestamp" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "Transaction" (
    "txId" TEXT NOT NULL PRIMARY KEY,
    "blockNumber" INTEGER NOT NULL,
    "indexInBlock" INTEGER NOT NULL,
    "timestamp" DATETIME NOT NULL,
    "creatorMspId" TEXT NOT NULL,
    "chaincodeName" TEXT NOT NULL,
    "functionName" TEXT NOT NULL,
    "args" JSONB NOT NULL,
    "validationCode" TEXT NOT NULL,
    "isValid" BOOLEAN NOT NULL,
    "endorsingMspIds" JSONB NOT NULL,
    "readSet" JSONB NOT NULL,
    "writeSet" JSONB NOT NULL,
    CONSTRAINT "Transaction_blockNumber_fkey" FOREIGN KEY ("blockNumber") REFERENCES "Block" ("number") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "Transaction_blockNumber_idx" ON "Transaction"("blockNumber");

-- CreateIndex
CREATE INDEX "Transaction_chaincodeName_functionName_idx" ON "Transaction"("chaincodeName", "functionName");
