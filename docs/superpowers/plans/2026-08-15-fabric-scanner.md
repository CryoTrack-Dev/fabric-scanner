# CryoTrack Fabric Scanner Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build an internal, Etherscan-style block explorer for the CryoTrack Hyperledger Fabric network — browse blocks/transactions, inspect transaction detail (args, read/write set, endorsers, validation status), and search by block number or tx ID.

**Architecture:** A single Next.js 16 (App Router, TypeScript) project in `scanner/`. A standalone script (`pnpm indexer`) polls Fabric's `qscc` system chaincode, decodes raw block protobufs via `fabric-common`'s `BlockDecoder`, and persists blocks/transactions into a local SQLite DB via Prisma. Next.js Server Components and API routes read from that same SQLite DB through a shared query layer — no per-page-load round trip to the peer.

**Tech Stack:** Next.js 16.1.6, React 19.2.3, TypeScript (strict), Tailwind CSS 4, Prisma 7 + SQLite, `@hyperledger/fabric-gateway` + `@grpc/grpc-js` (peer connection), `fabric-common` + `fabric-protos` (block/tx decoding), Vitest (Node environment), pnpm.

**Spec:** [docs/superpowers/specs/2026-08-15-fabric-scanner-design.md](../specs/2026-08-15-fabric-scanner-design.md)

## Global Constraints

- Package manager: **pnpm** (matches `webapp/cryotrack`); enforce with `"preinstall": "npx only-allow pnpm"` in `package.json`.
- Next.js `16.1.6`, React `19.2.3` — pinned to match `webapp/cryotrack`'s versions exactly.
- **No authentication in v1** — runs locally / on the internal network only.
- Storage is **SQLite via Prisma `^7.7.0`**, one file (`scanner/scanner.db`), gitignored — fully regenerable by re-running the indexer from block 0.
- All Fabric reads go through `qscc` via `evaluateTransaction` **only** — the scanner never calls `submitTransaction` and never writes to the ledger.
- The indexer runs as a **separate process** (`pnpm indexer`, via `tsx scripts/indexer.ts`) — never inside a Next.js request/route handler, to avoid dev-mode hot-reload spawning duplicate poll loops.
- TypeScript `strict: true`, `esModuleInterop: true` — matches `webapp/cryotrack`'s `tsconfig.json`.
- `fabric-common`, `fabric-protos`, `@hyperledger/fabric-gateway`, and `@grpc/grpc-js` must be declared in Next's `serverExternalPackages` (they use native/dynamic requires that break when bundled).

---

## Task 1: Project scaffold + env config module

**Files:**
- Create: `scanner/package.json`
- Create: `scanner/tsconfig.json`
- Create: `scanner/next.config.ts`
- Create: `scanner/tailwind.config.ts`
- Create: `scanner/postcss.config.mjs`
- Create: `scanner/eslint.config.mjs`
- Create: `scanner/vitest.config.ts`
- Create: `scanner/.gitignore`
- Create: `scanner/.env.example`
- Create: `scanner/src/app/layout.tsx`
- Create: `scanner/src/app/page.tsx`
- Create: `scanner/src/app/globals.css`
- Create: `scanner/src/lib/env.ts`
- Test: `scanner/src/lib/env.test.ts`

**Interfaces:**
- Produces: `loadEnv(): ScannerEnv` from `src/lib/env.ts`, where
  ```ts
  interface ScannerEnv {
    fabricCryptoBase: string;
    peerAddress: string;
    peerName: string;
    mspId: string;
    channelName: string;
    orgDomain: string;
    userName: string;
    pollIntervalMs: number;
  }
  ```
  Later tasks (3, 7) import `loadEnv` and `ScannerEnv` from `../lib/env` (or `@/lib/env`).

- [ ] **Step 1: Create `package.json`**

```json
{
  "name": "cryotrack-scanner",
  "version": "0.1.0",
  "private": true,
  "scripts": {
    "dev": "next dev",
    "indexer": "tsx watch scripts/indexer.ts",
    "dev:all": "concurrently -n next,indexer -c blue,green \"pnpm dev\" \"pnpm indexer\"",
    "build": "next build",
    "start": "next start",
    "lint": "eslint",
    "test": "vitest run",
    "prisma:migrate": "prisma migrate dev",
    "prisma:generate": "prisma generate",
    "preinstall": "npx only-allow pnpm"
  },
  "dependencies": {
    "@grpc/grpc-js": "^1.14.3",
    "@hyperledger/fabric-gateway": "^1.10.1",
    "@prisma/client": "^7.7.0",
    "clsx": "^2.1.1",
    "fabric-common": "^2.2.20",
    "fabric-protos": "^2.2.20",
    "next": "16.1.6",
    "react": "19.2.3",
    "react-dom": "19.2.3"
  },
  "devDependencies": {
    "@tailwindcss/postcss": "^4",
    "@types/node": "^20",
    "@types/react": "^19",
    "@types/react-dom": "^19",
    "concurrently": "^9.1.2",
    "dotenv": "^16.4.5",
    "eslint": "^9",
    "eslint-config-next": "16.1.6",
    "prisma": "^7.7.0",
    "tailwindcss": "^4",
    "tsx": "^4.19.2",
    "typescript": "^5",
    "vitest": "^4.1.9"
  }
}
```

- [ ] **Step 2: Create `tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2017",
    "lib": ["dom", "dom.iterable", "esnext"],
    "allowJs": true,
    "skipLibCheck": true,
    "strict": true,
    "noEmit": true,
    "esModuleInterop": true,
    "module": "esnext",
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "jsx": "react-jsx",
    "incremental": true,
    "plugins": [{ "name": "next" }],
    "paths": { "@/*": ["./src/*"] }
  },
  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts", "scripts/**/*.ts"],
  "exclude": ["node_modules"]
}
```

- [ ] **Step 3: Create `next.config.ts`**

```ts
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: [
    "@hyperledger/fabric-gateway",
    "@grpc/grpc-js",
    "fabric-common",
    "fabric-protos",
  ],
};

export default nextConfig;
```

- [ ] **Step 4: Create `tailwind.config.ts`, `postcss.config.mjs`, `eslint.config.mjs`**

`tailwind.config.ts`:
```ts
import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/app/**/*.{ts,tsx}", "./src/components/**/*.{ts,tsx}"],
  theme: { extend: {} },
  plugins: [],
};

export default config;
```

`postcss.config.mjs`:
```js
const config = {
  plugins: { "@tailwindcss/postcss": {} },
};

export default config;
```

`eslint.config.mjs`:
```js
import { FlatCompat } from "@eslint/eslintrc";

const compat = new FlatCompat({ baseDirectory: import.meta.dirname });

export default [...compat.extends("next/core-web-vitals", "next/typescript")];
```

- [ ] **Step 5: Create `vitest.config.ts`**

```ts
import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    environment: "node",
    globals: true,
  },
  resolve: {
    alias: { "@": path.resolve(__dirname, "./src") },
  },
});
```

- [ ] **Step 6: Create `.gitignore`**

```
node_modules/
.next/
scanner.db
scanner.db-journal
*.db
*.db-journal
.env
.env.local
```

- [ ] **Step 7: Create `.env.example`**

```
# Path to the fabric/ monorepo's cryptogen output (peerOrganizations dir lives under this)
FABRIC_CRYPTO_BASE=/Users/manibrar/Documents/CryoTrack/fabric/packages/network/crypto-material

# Peer to connect to for qscc queries
PEER_ADDRESS=localhost:7051
PEER_NAME=peer0.exporter.cryotrack.com
PEER_MSP_ID=ExporterMSP
ORG_DOMAIN=exporter.cryotrack.com

CHANNEL_NAME=supplychain
FABRIC_USER_NAME=User1
POLL_INTERVAL_MS=3000

DATABASE_URL=file:./scanner.db
```

- [ ] **Step 8: Write the failing test for `src/lib/env.ts`**

```ts
// scanner/src/lib/env.test.ts
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { loadEnv } from "./env";

const REQUIRED_VARS = ["PEER_ADDRESS", "PEER_NAME", "PEER_MSP_ID", "ORG_DOMAIN"];

describe("loadEnv", () => {
  const savedEnv = { ...process.env };

  beforeEach(() => {
    for (const key of REQUIRED_VARS) process.env[key] = `test-${key}`;
    delete process.env.FABRIC_CRYPTO_BASE;
    delete process.env.CHANNEL_NAME;
    delete process.env.FABRIC_USER_NAME;
    delete process.env.POLL_INTERVAL_MS;
  });

  afterEach(() => {
    process.env = { ...savedEnv };
  });

  it("applies defaults for optional vars", () => {
    const env = loadEnv();
    expect(env.channelName).toBe("supplychain");
    expect(env.userName).toBe("User1");
    expect(env.pollIntervalMs).toBe(3000);
    expect(env.fabricCryptoBase).toContain("crypto-material");
  });

  it("reads required vars from process.env", () => {
    const env = loadEnv();
    expect(env.peerAddress).toBe("test-PEER_ADDRESS");
    expect(env.mspId).toBe("test-PEER_MSP_ID");
    expect(env.orgDomain).toBe("test-ORG_DOMAIN");
  });

  it("throws when a required var is missing", () => {
    delete process.env.PEER_ADDRESS;
    expect(() => loadEnv()).toThrow(/PEER_ADDRESS/);
  });
});
```

- [ ] **Step 9: Run test to verify it fails**

Run: `pnpm install && pnpm test -- src/lib/env.test.ts`
Expected: FAIL — `./env` module not found.

- [ ] **Step 10: Implement `src/lib/env.ts`**

```ts
// scanner/src/lib/env.ts
export interface ScannerEnv {
  fabricCryptoBase: string;
  peerAddress: string;
  peerName: string;
  mspId: string;
  channelName: string;
  orgDomain: string;
  userName: string;
  pollIntervalMs: number;
}

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required env var: ${name}`);
  return value;
}

export function loadEnv(): ScannerEnv {
  return {
    fabricCryptoBase:
      process.env.FABRIC_CRYPTO_BASE ??
      "/Users/manibrar/Documents/CryoTrack/fabric/packages/network/crypto-material",
    peerAddress: required("PEER_ADDRESS"),
    peerName: required("PEER_NAME"),
    mspId: required("PEER_MSP_ID"),
    channelName: process.env.CHANNEL_NAME ?? "supplychain",
    orgDomain: required("ORG_DOMAIN"),
    userName: process.env.FABRIC_USER_NAME ?? "User1",
    pollIntervalMs: Number(process.env.POLL_INTERVAL_MS ?? 3000),
  };
}
```

- [ ] **Step 11: Run test to verify it passes**

Run: `pnpm test -- src/lib/env.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 12: Create minimal `layout.tsx`, `page.tsx`, `globals.css` so `pnpm dev` renders something**

`src/app/globals.css`:
```css
@import "tailwindcss";
```

`src/app/layout.tsx`:
```tsx
import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "CryoTrack Fabric Scanner",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="bg-slate-950 text-slate-100 antialiased">{children}</body>
    </html>
  );
}
```

`src/app/page.tsx` (placeholder — replaced in Task 11):
```tsx
export default function DashboardPage() {
  return <main className="p-8">CryoTrack Fabric Scanner — coming up.</main>;
}
```

- [ ] **Step 13: Verify dev server boots**

Run: `pnpm dev` (then Ctrl+C after confirming `http://localhost:3000` renders the placeholder text)
Expected: page loads with no console errors.

- [ ] **Step 14: Commit**

```bash
cd scanner
git add -A
git commit -m "Scaffold Next.js project with env config module"
```

---

## Task 2: Prisma schema + client singleton

**Files:**
- Create: `scanner/prisma.config.ts`
- Create: `scanner/prisma/schema.prisma`
- Create: `scanner/src/lib/db/prisma.ts`
- Modify: `scanner/.env.example` (already has `DATABASE_URL`, no change needed)
- Create: `scanner/.env` (local, gitignored — for running migrations)

**Interfaces:**
- Produces: `prisma` (singleton `PrismaClient`) from `src/lib/db/prisma.ts`, and the generated `@prisma/client` `Block`/`Transaction` model types. Tasks 6, 7, 8 depend on this.

- [ ] **Step 1: Create `prisma.config.ts`**

```ts
// scanner/prisma.config.ts
import "dotenv/config";
import { defineConfig, env } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: { path: "prisma/migrations" },
  datasource: { url: env("DATABASE_URL") },
});
```

- [ ] **Step 2: Create `prisma/schema.prisma`**

```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "sqlite"
  url      = env("DATABASE_URL")
}

model Block {
  number       Int           @id
  hash         String?
  previousHash String
  dataHash     String
  txCount      Int
  timestamp    DateTime
  transactions Transaction[]
}

model Transaction {
  txId            String   @id
  blockNumber     Int
  indexInBlock    Int
  timestamp       DateTime
  creatorMspId    String
  chaincodeName   String
  functionName    String
  args            Json
  validationCode  String
  isValid         Boolean
  endorsingMspIds Json
  readSet         Json
  writeSet        Json
  block           Block    @relation(fields: [blockNumber], references: [number])

  @@index([blockNumber])
  @@index([chaincodeName, functionName])
}
```

- [ ] **Step 3: Create local `.env` and run the first migration**

```bash
cd scanner
cp .env.example .env
# .env's DATABASE_URL=file:./scanner.db is already correct for local dev — no edit needed.
pnpm prisma:migrate --name init
```

Expected: creates `prisma/migrations/<timestamp>_init/migration.sql` and `scanner.db`, prints "Your database is now in sync with your schema."

- [ ] **Step 4: Create the Prisma client singleton**

```ts
// scanner/src/lib/db/prisma.ts
import { PrismaClient } from "@prisma/client";

declare global {
  // eslint-disable-next-line no-var
  var __prisma: PrismaClient | undefined;
}

export const prisma = globalThis.__prisma ?? new PrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalThis.__prisma = prisma;
}
```

- [ ] **Step 5: Verify the client works**

```bash
pnpm prisma:generate
node -e "
const { prisma } = require('./src/lib/db/prisma.ts');
" 2>&1 || true
```

(This is a TS file so a plain `node -e` require won't run it directly — instead verify via a throwaway script.)

```bash
cat > /tmp/prisma-smoke.mjs <<'EOF'
import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();
const block = await prisma.block.create({
  data: { number: 0, previousHash: "", dataHash: "abc", txCount: 0, timestamp: new Date() },
});
console.log("created block", block.number);
await prisma.block.delete({ where: { number: 0 } });
console.log("cleaned up");
await prisma.$disconnect();
EOF
DATABASE_URL="file:$(pwd)/scanner.db" node /tmp/prisma-smoke.mjs
```

Expected: prints `created block 0` then `cleaned up`.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "Add Prisma schema (SQLite) and client singleton"
```

---

## Task 3: Fabric identity path resolution + connection module

**Files:**
- Create: `scanner/src/lib/fabric/connection.ts`
- Test: `scanner/src/lib/fabric/connection.test.ts`

**Interfaces:**
- Consumes: `ScannerEnv` from `src/lib/env.ts` (Task 1).
- Produces:
  ```ts
  interface IdentityPaths {
    tlsCertPath: string;
    certDir: string;
    keyDir: string;
  }
  function resolveIdentityPaths(env: ScannerEnv): IdentityPaths;

  interface FabricConnection {
    gateway: import("@hyperledger/fabric-gateway").Gateway;
    grpcClient: import("@grpc/grpc-js").Client;
    qscc: import("@hyperledger/fabric-gateway").Contract;
  }
  async function connectToFabric(env: ScannerEnv): Promise<FabricConnection>;
  function closeFabricConnection(connection: FabricConnection): void;
  ```
  Tasks 4 and 7 use `connectToFabric`/`closeFabricConnection`; Task 4's tests use `resolveIdentityPaths` indirectly (via the same module) but mainly consume `qscc: Contract`.

- [ ] **Step 1: Write the failing test for `resolveIdentityPaths` (the pure, testable part)**

```ts
// scanner/src/lib/fabric/connection.test.ts
import { describe, it, expect } from "vitest";
import path from "node:path";
import { resolveIdentityPaths } from "./connection";
import type { ScannerEnv } from "../env";

const env: ScannerEnv = {
  fabricCryptoBase: "/crypto-material",
  peerAddress: "localhost:7051",
  peerName: "peer0.exporter.cryotrack.com",
  mspId: "ExporterMSP",
  channelName: "supplychain",
  orgDomain: "exporter.cryotrack.com",
  userName: "User1",
  pollIntervalMs: 3000,
};

describe("resolveIdentityPaths", () => {
  it("builds paths under peerOrganizations/<orgDomain>", () => {
    const paths = resolveIdentityPaths(env);
    expect(paths.tlsCertPath).toBe(
      path.join("/crypto-material", "peerOrganizations", "exporter.cryotrack.com", "peers", "peer0.exporter.cryotrack.com", "tls", "ca.crt"),
    );
    expect(paths.certDir).toBe(
      path.join("/crypto-material", "peerOrganizations", "exporter.cryotrack.com", "users", "User1@exporter.cryotrack.com", "msp", "signcerts"),
    );
    expect(paths.keyDir).toBe(
      path.join("/crypto-material", "peerOrganizations", "exporter.cryotrack.com", "users", "User1@exporter.cryotrack.com", "msp", "keystore"),
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test -- src/lib/fabric/connection.test.ts`
Expected: FAIL — `./connection` module not found.

- [ ] **Step 3: Implement `src/lib/fabric/connection.ts`**

```ts
// scanner/src/lib/fabric/connection.ts
import * as grpc from "@grpc/grpc-js";
import { connect, Contract, Gateway, Identity, Signer, signers } from "@hyperledger/fabric-gateway";
import * as crypto from "node:crypto";
import { promises as fs } from "node:fs";
import * as path from "node:path";
import type { ScannerEnv } from "../env";

export interface IdentityPaths {
  tlsCertPath: string;
  certDir: string;
  keyDir: string;
}

export function resolveIdentityPaths(env: ScannerEnv): IdentityPaths {
  const orgDir = path.join(env.fabricCryptoBase, "peerOrganizations", env.orgDomain);
  const userMspDir = path.join(orgDir, "users", `${env.userName}@${env.orgDomain}`, "msp");

  return {
    tlsCertPath: path.join(orgDir, "peers", env.peerName, "tls", "ca.crt"),
    certDir: path.join(userMspDir, "signcerts"),
    keyDir: path.join(userMspDir, "keystore"),
  };
}

export interface FabricConnection {
  gateway: Gateway;
  grpcClient: grpc.Client;
  qscc: Contract;
}

export async function connectToFabric(env: ScannerEnv): Promise<FabricConnection> {
  const paths = resolveIdentityPaths(env);

  const tlsRootCert = await fs.readFile(paths.tlsCertPath);
  const grpcClient = new grpc.Client(env.peerAddress, grpc.credentials.createSsl(tlsRootCert), {
    "grpc.ssl_target_name_override": env.peerName,
  });

  const certFile = (await fs.readdir(paths.certDir)).find((f) => f.endsWith(".pem"));
  if (!certFile) throw new Error(`No signing cert found under ${paths.certDir}`);
  const certPem = await fs.readFile(path.join(paths.certDir, certFile));
  const identity: Identity = { mspId: env.mspId, credentials: certPem };

  const keyFile = (await fs.readdir(paths.keyDir))[0];
  if (!keyFile) throw new Error(`No private key found under ${paths.keyDir}`);
  const keyPem = await fs.readFile(path.join(paths.keyDir, keyFile));
  const signer: Signer = signers.newPrivateKeySigner(crypto.createPrivateKey(keyPem));

  const gateway = connect({
    client: grpcClient,
    identity,
    signer,
    evaluateOptions: () => ({ deadline: Date.now() + 5000 }),
  });

  const qscc = gateway.getNetwork(env.channelName).getContract("qscc");

  return { gateway, grpcClient, qscc };
}

export function closeFabricConnection(connection: FabricConnection): void {
  connection.gateway.close();
  connection.grpcClient.close();
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test -- src/lib/fabric/connection.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "Add Fabric gateway connection module targeting qscc"
```

---

## Task 4: qscc query wrapper

**Files:**
- Create: `scanner/src/lib/fabric/qscc.ts`
- Test: `scanner/src/lib/fabric/qscc.test.ts`

**Interfaces:**
- Consumes: `Contract` type from `@hyperledger/fabric-gateway` (a `qscc` contract, as produced by `connectToFabric` in Task 3).
- Produces:
  ```ts
  interface ChainInfo { height: number; currentBlockHash: string; }
  async function getChainInfo(qscc: Contract, channelName: string): Promise<ChainInfo>;
  async function getBlockByNumber(qscc: Contract, channelName: string, blockNumber: number): Promise<Buffer>;
  async function getTransactionByID(qscc: Contract, channelName: string, txId: string): Promise<Buffer>;
  ```
  Task 5 consumes the raw `Buffer` from `getBlockByNumber` as input to `decodeBlock`. Task 7 (indexer entrypoint) and Task 9 (API routes) call all three functions.

- [ ] **Step 1: Write the failing test**

This test builds a real encoded `BlockchainInfo` protobuf message (using `fabric-protos` directly — the same package the wrapper decodes with) and a fake `Contract` whose `evaluateTransaction` returns those bytes, so the test exercises the real decode path without a live peer.

```ts
// scanner/src/lib/fabric/qscc.test.ts
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test -- src/lib/fabric/qscc.test.ts`
Expected: FAIL — `./qscc` module not found.

- [ ] **Step 3: Implement `src/lib/fabric/qscc.ts`**

```ts
// scanner/src/lib/fabric/qscc.ts
import type { Contract } from "@hyperledger/fabric-gateway";
import { common } from "fabric-protos";

export interface ChainInfo {
  height: number;
  currentBlockHash: string;
}

function toNum(value: number | { toNumber(): number }): number {
  return typeof value === "number" ? value : value.toNumber();
}

export async function getChainInfo(qscc: Contract, channelName: string): Promise<ChainInfo> {
  const result = await qscc.evaluateTransaction("GetChainInfo", channelName);
  const decoded = common.BlockchainInfo.decode(Buffer.from(result));
  return {
    height: toNum(decoded.height),
    currentBlockHash: Buffer.from(decoded.currentBlockHash).toString("hex"),
  };
}

export async function getBlockByNumber(
  qscc: Contract,
  channelName: string,
  blockNumber: number,
): Promise<Buffer> {
  const result = await qscc.evaluateTransaction("GetBlockByNumber", channelName, blockNumber.toString());
  return Buffer.from(result);
}

export async function getTransactionByID(
  qscc: Contract,
  channelName: string,
  txId: string,
): Promise<Buffer> {
  const result = await qscc.evaluateTransaction("GetTransactionByID", channelName, txId);
  return Buffer.from(result);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test -- src/lib/fabric/qscc.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "Add qscc query wrapper (GetChainInfo/GetBlockByNumber/GetTransactionByID)"
```

---

## Task 5: Block decoder

This is the core of the scanner: turning raw `qscc.GetBlockByNumber` bytes into typed block/transaction data. It wraps `fabric-common`'s `BlockDecoder` (the same decoder Hyperledger's own SDK and the archived Explorer tool use) rather than hand-rolling protobuf parsing.

**Files:**
- Create: `scanner/src/lib/fabric/blockDecoder.ts`
- Test: `scanner/src/lib/fabric/blockDecoder.test.ts`
- Test fixture helper: `scanner/src/lib/fabric/testFixtures.ts`

**Interfaces:**
- Consumes: `Buffer` (raw block bytes, as produced by `getBlockByNumber` from Task 4).
- Produces:
  ```ts
  interface ReadSetEntry {
    namespace: string;
    key: string;
    version: { blockNum: number; txNum: number } | null;
  }
  interface WriteSetEntry {
    namespace: string;
    key: string;
    isDelete: boolean;
    value: string;
  }
  interface DecodedTransaction {
    txId: string;
    indexInBlock: number;
    timestamp: Date;
    creatorMspId: string;
    chaincodeName: string;
    functionName: string;
    args: string[];
    validationCode: string;
    isValid: boolean;
    endorsingMspIds: string[];
    readSet: ReadSetEntry[];
    writeSet: WriteSetEntry[];
  }
  interface DecodedBlock {
    number: number;
    previousHash: string;
    dataHash: string;
    transactions: DecodedTransaction[];
  }
  function decodeBlock(blockBuf: Buffer): DecodedBlock;
  ```
  Tasks 6 and 7 consume `DecodedBlock`/`DecodedTransaction` and `decodeBlock`.

- [ ] **Step 1: Create the fixture-building helper**

This builds a real, wire-format-correct encoded block (one `ENDORSER_TRANSACTION` envelope invoking `CommissionShipment` with a read and a write) using `fabric-protos` directly. The exact nesting (which fields are raw `bytes` vs. nested messages) was verified by round-tripping this construction through `BlockDecoder.decode()` before writing this plan — see the field-by-field notes inline.

```ts
// scanner/src/lib/fabric/testFixtures.ts
import { common, protos, msp, rwset, kvrwset } from "fabric-protos";

function identityBytes(mspid: string, cert: string): Uint8Array {
  return msp.SerializedIdentity.encode({ mspid, id_bytes: Buffer.from(cert) }).finish();
}

export interface FixtureOptions {
  blockNumber?: number;
  txId?: string;
  chaincodeName?: string;
  functionName?: string;
  args?: string[];
  creatorMspId?: string;
  validationCode?: number;
}

/**
 * Builds a real encoded common.Block with a single ENDORSER_TRANSACTION
 * envelope, for exercising decodeBlock() without a live Fabric network.
 */
export function buildFixtureBlock(options: FixtureOptions = {}): Buffer {
  const {
    blockNumber = 42,
    txId = "tx1",
    chaincodeName = "cryotrack",
    functionName = "CommissionShipment",
    args = ["urn:epc:id:sscc:123"],
    creatorMspId = "ExporterMSP",
    validationCode = 0,
  } = options;

  const creator = identityBytes(creatorMspId, "creator-cert");
  const endorser = identityBytes(creatorMspId, "endorser-cert");

  const channelHeaderBytes = common.ChannelHeader.encode({
    type: 3, // ENDORSER_TRANSACTION
    version: 0,
    timestamp: { seconds: 1765000000, nanos: 0 },
    channel_id: "supplychain",
    tx_id: txId,
    epoch: 0,
  }).finish();

  const signatureHeaderBytes = common.SignatureHeader.encode({
    creator,
    nonce: Buffer.from("nonce"),
  }).finish();

  // Payload.header is a NESTED MESSAGE (common.Header), not bytes — pass
  // channel_header/signature_header as already-encoded bytes fields on it.
  const chaincodeSpecBytes = protos.ChaincodeSpec.encode({
    type: 2, // NODE
    chaincode_id: { name: chaincodeName, version: "1.0" },
    input: { args: [Buffer.from(functionName), ...args.map((a) => Buffer.from(a))] },
  }).finish();

  const chaincodeInvocationSpecBytes = protos.ChaincodeInvocationSpec.encode({
    chaincode_spec: protos.ChaincodeSpec.decode(chaincodeSpecBytes),
  }).finish();

  const chaincodeProposalPayloadBytes = protos.ChaincodeProposalPayload.encode({
    input: chaincodeInvocationSpecBytes,
  }).finish();

  const kvrwsetBytes = kvrwset.KVRWSet.encode({
    reads: [{ key: "facility:F1", version: { block_num: 1, tx_num: 0 } }],
    writes: [{ key: `shipment:${args[0]}`, is_delete: false, value: Buffer.from('{"status":"active"}') }],
  }).finish();

  const rwsetBytes = rwset.TxReadWriteSet.encode({
    data_model: 0,
    ns_rwset: [{ namespace: chaincodeName, rwset: kvrwsetBytes }],
  }).finish();

  const chaincodeActionBytes = protos.ChaincodeAction.encode({
    results: rwsetBytes,
    chaincode_id: { name: chaincodeName, version: "1.0" },
    response: { status: 200, message: "", payload: Buffer.alloc(0) },
  }).finish();

  const proposalResponsePayloadBytes = protos.ProposalResponsePayload.encode({
    proposal_hash: Buffer.alloc(32),
    extension: chaincodeActionBytes,
  }).finish();

  // ChaincodeActionPayload.action is a NESTED MESSAGE (ChaincodeEndorsedAction),
  // not bytes — pass it as a plain object, not pre-encoded bytes.
  const chaincodeActionPayloadBytes = protos.ChaincodeActionPayload.encode({
    chaincode_proposal_payload: chaincodeProposalPayloadBytes,
    action: {
      proposal_response_payload: proposalResponsePayloadBytes,
      endorsements: [{ endorser, signature: Buffer.alloc(64) }],
    },
  }).finish();

  const transactionBytes = protos.Transaction.encode({
    actions: [{ header: signatureHeaderBytes, payload: chaincodeActionPayloadBytes }],
  }).finish();

  const payloadBytes = common.Payload.encode({
    header: { channel_header: channelHeaderBytes, signature_header: signatureHeaderBytes },
    data: transactionBytes,
  }).finish();

  const envelopeBytes = common.Envelope.encode({
    signature: Buffer.from("sig"),
    payload: payloadBytes,
  }).finish();

  const blockBytes = common.Block.encode({
    header: {
      number: blockNumber,
      previous_hash: Buffer.from("prevhash"),
      data_hash: Buffer.from("datahash"),
    },
    data: { data: [envelopeBytes] },
    metadata: {
      metadata: [
        Buffer.alloc(0),
        Buffer.alloc(0),
        Buffer.from([validationCode]), // TRANSACTIONS_FILTER — one byte per tx
        Buffer.alloc(0),
        Buffer.alloc(0),
      ],
    },
  }).finish();

  return Buffer.from(blockBytes);
}
```

- [ ] **Step 2: Write the failing test**

```ts
// scanner/src/lib/fabric/blockDecoder.test.ts
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
```

- [ ] **Step 3: Run test to verify it fails**

Run: `pnpm test -- src/lib/fabric/blockDecoder.test.ts`
Expected: FAIL — `./blockDecoder` module not found.

- [ ] **Step 4: Implement `src/lib/fabric/blockDecoder.ts`**

```ts
// scanner/src/lib/fabric/blockDecoder.ts
import * as fabricCommon from "fabric-common";

const TX_VALIDATION_CODES: Record<number, string> = {
  0: "VALID",
  1: "NIL_ENVELOPE",
  2: "BAD_PAYLOAD",
  3: "BAD_COMMON_HEADER",
  4: "BAD_CREATOR_SIGNATURE",
  5: "INVALID_ENDORSER_TRANSACTION",
  6: "INVALID_CONFIG_TRANSACTION",
  7: "UNSUPPORTED_TX_PAYLOAD",
  8: "BAD_PROPOSAL_TXID",
  9: "DUPLICATE_TXID",
  10: "ENDORSEMENT_POLICY_FAILURE",
  11: "MVCC_READ_CONFLICT",
  12: "PHANTOM_READ_CONFLICT",
  13: "UNKNOWN_TX_TYPE",
  14: "TARGET_CHAIN_NOT_FOUND",
  15: "MARSHAL_TX_ERROR",
  16: "NIL_TXACTION",
  17: "EXPIRED_CHAINCODE",
  18: "CHAINCODE_VERSION_CONFLICT",
  19: "BAD_HEADER_EXTENSION",
  20: "BAD_CHANNEL_HEADER",
  21: "BAD_RESPONSE_PAYLOAD",
  22: "BAD_RWSET",
  23: "ILLEGAL_WRITESET",
  24: "INVALID_WRITESET",
  25: "INVALID_CHAINCODE",
  254: "NOT_VALIDATED",
  255: "INVALID_OTHER_REASON",
};

export interface ReadSetEntry {
  namespace: string;
  key: string;
  version: { blockNum: number; txNum: number } | null;
}

export interface WriteSetEntry {
  namespace: string;
  key: string;
  isDelete: boolean;
  value: string;
}

export interface DecodedTransaction {
  txId: string;
  indexInBlock: number;
  timestamp: Date;
  creatorMspId: string;
  chaincodeName: string;
  functionName: string;
  args: string[];
  validationCode: string;
  isValid: boolean;
  endorsingMspIds: string[];
  readSet: ReadSetEntry[];
  writeSet: WriteSetEntry[];
}

export interface DecodedBlock {
  number: number;
  previousHash: string;
  dataHash: string;
  transactions: DecodedTransaction[];
}

// Minimal shape of what fabric-common's BlockDecoder.decode() returns —
// only the fields this module reads. Field names (snake_case) match
// fabric-common/lib/BlockDecoder.js exactly; verified by round-tripping a
// synthetic encoded block through the real decoder while writing this module.
interface RawVersion {
  block_num: number | { toNumber(): number };
  tx_num: number | { toNumber(): number };
}
interface RawRead {
  key: string;
  version: RawVersion | null;
}
interface RawWrite {
  key: string;
  is_delete: boolean;
  value: Buffer;
}
interface RawNsRwset {
  namespace: string;
  rwset: { reads: RawRead[]; writes: RawWrite[] };
}
interface RawAction {
  payload: {
    chaincode_proposal_payload: {
      input: { chaincode_spec: { chaincode_id: { name: string }; input: { args: Buffer[] } } };
    };
    action: {
      endorsements: { endorser: { mspid: string } }[];
      proposal_response_payload: {
        extension: { results?: { ns_rwset: RawNsRwset[] } };
      };
    };
  };
}
interface RawEnvelope {
  payload: {
    header: {
      channel_header: { type: number; tx_id: string; timestamp: Date };
      signature_header: { creator: { mspid: string } };
    };
    data: { actions?: RawAction[] };
  };
}
interface RawDecodedBlock {
  header: {
    number: number | { toNumber(): number };
    previous_hash: Buffer;
    data_hash: Buffer;
  };
  data: { data: RawEnvelope[] };
  metadata: { metadata: unknown[][] };
}

const BlockDecoder = (fabricCommon as unknown as {
  BlockDecoder: { decode(buf: Buffer): RawDecodedBlock };
}).BlockDecoder;

function toNum(value: number | { toNumber(): number }): number {
  return typeof value === "number" ? value : value.toNumber();
}

function toHex(value: Buffer): string {
  return Buffer.isBuffer(value) ? value.toString("hex") : "";
}

export function decodeBlock(blockBuf: Buffer): DecodedBlock {
  const raw = BlockDecoder.decode(blockBuf);
  const validationCodes = (raw.metadata.metadata[2] ?? []) as number[];

  const transactions: DecodedTransaction[] = raw.data.data.map((envelope, index) => {
    const channelHeader = envelope.payload.header.channel_header;
    const creatorMspId = envelope.payload.header.signature_header.creator.mspid;
    const code = validationCodes[index] ?? 254;
    const validationCode = TX_VALIDATION_CODES[code] ?? String(code);

    if (channelHeader.type !== 3) {
      return {
        txId: channelHeader.tx_id,
        indexInBlock: index,
        timestamp: channelHeader.timestamp,
        creatorMspId,
        chaincodeName: "_config",
        functionName: channelHeader.type === 1 ? "CONFIG" : "CONFIG_UPDATE",
        args: [],
        validationCode,
        isValid: code === 0,
        endorsingMspIds: [],
        readSet: [],
        writeSet: [],
      };
    }

    const action = envelope.payload.data.actions?.[0];
    if (!action) {
      return {
        txId: channelHeader.tx_id,
        indexInBlock: index,
        timestamp: channelHeader.timestamp,
        creatorMspId,
        chaincodeName: "_unknown",
        functionName: "",
        args: [],
        validationCode,
        isValid: code === 0,
        endorsingMspIds: [],
        readSet: [],
        writeSet: [],
      };
    }

    const chaincodeSpec = action.payload.chaincode_proposal_payload.input.chaincode_spec;
    const rawArgs = chaincodeSpec.input.args ?? [];
    const extension = action.payload.action.proposal_response_payload.extension;
    const endorsingMspIds = action.payload.action.endorsements.map((e) => e.endorser.mspid);

    const readSet: ReadSetEntry[] = [];
    const writeSet: WriteSetEntry[] = [];
    for (const ns of extension.results?.ns_rwset ?? []) {
      for (const read of ns.rwset.reads) {
        readSet.push({
          namespace: ns.namespace,
          key: read.key,
          version: read.version
            ? { blockNum: toNum(read.version.block_num), txNum: toNum(read.version.tx_num) }
            : null,
        });
      }
      for (const write of ns.rwset.writes) {
        writeSet.push({
          namespace: ns.namespace,
          key: write.key,
          isDelete: write.is_delete,
          value: Buffer.isBuffer(write.value) ? write.value.toString("utf8") : "",
        });
      }
    }

    return {
      txId: channelHeader.tx_id,
      indexInBlock: index,
      timestamp: channelHeader.timestamp,
      creatorMspId,
      chaincodeName: chaincodeSpec.chaincode_id.name,
      functionName: rawArgs[0] ? rawArgs[0].toString("utf8") : "",
      args: rawArgs.slice(1).map((a) => a.toString("utf8")),
      validationCode,
      isValid: code === 0,
      endorsingMspIds,
      readSet,
      writeSet,
    };
  });

  return {
    number: toNum(raw.header.number),
    previousHash: toHex(raw.header.previous_hash),
    dataHash: toHex(raw.header.data_hash),
    transactions,
  };
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm test -- src/lib/fabric/blockDecoder.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "Add block decoder wrapping fabric-common BlockDecoder"
```

---

## Task 6: Indexer sync logic (pure, testable)

**Files:**
- Create: `scanner/src/lib/indexer/sync.ts`
- Test: `scanner/src/lib/indexer/sync.test.ts`

**Interfaces:**
- Consumes: `DecodedBlock` from `src/lib/fabric/blockDecoder.ts` (Task 5).
- Produces:
  ```ts
  interface SyncDeps {
    getChainHeight(): Promise<number>;
    getCurrentBlockHash(): Promise<string>;
    getLastIndexedBlockNumber(): Promise<number | null>;
    fetchAndDecodeBlock(blockNumber: number): Promise<DecodedBlock>;
    persistBlock(block: DecodedBlock): Promise<void>;
    setBlockHash(blockNumber: number, hash: string): Promise<void>;
  }
  interface SyncResult { indexedBlockNumbers: number[]; }
  async function syncOnce(deps: SyncDeps): Promise<SyncResult>;
  ```
  Task 7 (indexer entrypoint) implements `SyncDeps` with real Prisma + Fabric calls and calls `syncOnce` in its poll loop.

**Design note:** a block's own hash isn't stored on the block itself in Fabric — it's derived from the *next* block's `previousHash`. So after indexing block N+1, we backfill block N's `hash` with block N+1's `previousHash`. The chain tip (the block with no successor yet) gets its hash set directly from `GetChainInfo().currentBlockHash`.

- [ ] **Step 1: Write the failing test**

```ts
// scanner/src/lib/indexer/sync.test.ts
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test -- src/lib/indexer/sync.test.ts`
Expected: FAIL — `./sync` module not found.

- [ ] **Step 3: Implement `src/lib/indexer/sync.ts`**

```ts
// scanner/src/lib/indexer/sync.ts
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test -- src/lib/indexer/sync.test.ts`
Expected: PASS (5 tests)

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "Add pure indexer sync logic"
```

---

## Task 7: Indexer entrypoint script

**Files:**
- Create: `scanner/scripts/indexer.ts`

**Interfaces:**
- Consumes: `loadEnv` (Task 1), `connectToFabric`/`closeFabricConnection` (Task 3), `getChainInfo`/`getBlockByNumber` (Task 4), `decodeBlock` (Task 5), `syncOnce`/`SyncDeps` (Task 6), `prisma` (Task 2).
- Produces: the `pnpm indexer` process. No other task consumes this module (it's the composition root for indexing).

- [ ] **Step 1: Implement `scripts/indexer.ts`**

```ts
// scanner/scripts/indexer.ts
import "dotenv/config";
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
              args: tx.args,
              validationCode: tx.validationCode,
              isValid: tx.isValid,
              endorsingMspIds: tx.endorsingMspIds,
              readSet: tx.readSet,
              writeSet: tx.writeSet,
            })),
          },
        },
      });
    },
    async setBlockHash(blockNumber, hash) {
      await prisma.block.update({ where: { number: blockNumber }, data: { hash } });
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
```

- [ ] **Step 2: Verify it starts against the local Fabric network**

This requires the local network to be up (per `fabric/README.md`'s quick start). If it's not already running:

```bash
cd /Users/manibrar/Documents/CryoTrack/fabric
yarn workspace @cryotrack/orderer run start
yarn workspace @cryotrack/peer run start:exporter
```

Then:

```bash
cd /Users/manibrar/Documents/CryoTrack/scanner
pnpm indexer
```

Expected: logs `CryoTrack Fabric scanner indexer started...` then, if the channel has committed blocks already, `Indexed blocks 0–N`. Ctrl+C to stop; verify no unhandled exceptions.

Check the DB was populated:

```bash
sqlite3 scanner.db "select number, txCount from Block order by number;"
sqlite3 scanner.db "select txId, chaincodeName, functionName, validationCode from \"Transaction\" limit 5;"
```

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "Add indexer entrypoint script"
```

---

## Task 8: Query layer

Shared read functions used by both Server Components (Task 11-13 pages) and API routes (Task 9) — avoids duplicating Prisma query logic or making pages round-trip through their own API.

**Files:**
- Create: `scanner/src/lib/queries/status.ts`
- Create: `scanner/src/lib/queries/blocks.ts`
- Create: `scanner/src/lib/queries/transactions.ts`
- Create: `scanner/src/lib/queries/search.ts`
- Test: `scanner/src/lib/queries/blocks.test.ts`
- Test: `scanner/src/lib/queries/transactions.test.ts`
- Test helper: `scanner/src/lib/queries/testDb.ts`

**Interfaces:**
- Consumes: `prisma` singleton (Task 2), plus a test-only `createTestPrismaClient()` helper.
- Produces:
  ```ts
  // status.ts
  interface IndexerStatus { chainHeight: number; lastIndexedBlock: number | null; isStalled: boolean; }
  async function getIndexerStatus(chainHeight: number): Promise<IndexerStatus>;

  // blocks.ts
  interface BlockSummary { number: number; hash: string | null; txCount: number; timestamp: Date; }
  interface BlockDetail extends BlockSummary { previousHash: string; dataHash: string; transactions: TransactionSummary[]; }
  async function listBlocks(opts: { cursor?: number; limit?: number }): Promise<{ items: BlockSummary[]; nextCursor: number | null }>;
  async function getBlockByNumber(number: number): Promise<BlockDetail | null>;

  // transactions.ts
  interface TransactionSummary { txId: string; blockNumber: number; chaincodeName: string; functionName: string; isValid: boolean; timestamp: Date; }
  interface TransactionDetail extends TransactionSummary { creatorMspId: string; args: string[]; validationCode: string; endorsingMspIds: string[]; readSet: unknown; writeSet: unknown; }
  async function listTransactions(opts: { cursor?: string; limit?: number; chaincodeName?: string; functionName?: string }): Promise<{ items: TransactionSummary[]; nextCursor: string | null }>;
  async function getTransactionById(txId: string): Promise<TransactionDetail | null>;

  // search.ts
  type SearchResult = { type: "block"; number: number } | { type: "transaction"; txId: string } | { type: "not_found" };
  async function search(query: string): Promise<SearchResult>;
  ```
  Task 9 (API routes) and Tasks 11-13 (pages) import all of the above.

- [ ] **Step 1: Create the test DB helper**

```ts
// scanner/src/lib/queries/testDb.ts
import { execSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import path from "node:path";
import fs from "node:fs";
import { PrismaClient } from "@prisma/client";

export function createTestPrismaClient(): { prisma: PrismaClient; cleanup: () => void } {
  const dbPath = path.join(process.cwd(), `test-${randomUUID()}.db`);
  const databaseUrl = `file:${dbPath}`;

  execSync("npx prisma db push --skip-generate", {
    env: { ...process.env, DATABASE_URL: databaseUrl },
    stdio: "inherit",
  });

  const prisma = new PrismaClient({ datasources: { db: { url: databaseUrl } } });

  return {
    prisma,
    cleanup: () => {
      fs.rmSync(dbPath, { force: true });
      fs.rmSync(`${dbPath}-journal`, { force: true });
    },
  };
}
```

- [ ] **Step 2: Write the failing test for `blocks.ts`**

```ts
// scanner/src/lib/queries/blocks.test.ts
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
```

- [ ] **Step 3: Run test to verify it fails**

Run: `pnpm test -- src/lib/queries/blocks.test.ts`
Expected: FAIL — `./blocks` module not found.

- [ ] **Step 4: Implement `src/lib/queries/blocks.ts`**

```ts
// scanner/src/lib/queries/blocks.ts
import type { PrismaClient } from "@prisma/client";
import { prisma as defaultPrisma } from "../db/prisma";
import type { TransactionSummary } from "./transactions";

export interface BlockSummary {
  number: number;
  hash: string | null;
  txCount: number;
  timestamp: Date;
}

export interface BlockDetail extends BlockSummary {
  previousHash: string;
  dataHash: string;
  transactions: TransactionSummary[];
}

export async function listBlocks(
  opts: { cursor?: number; limit?: number },
  db: PrismaClient = defaultPrisma,
): Promise<{ items: BlockSummary[]; nextCursor: number | null }> {
  const limit = opts.limit ?? 20;
  const blocks = await db.block.findMany({
    take: limit + 1,
    ...(opts.cursor !== undefined ? { cursor: { number: opts.cursor }, skip: 1 } : {}),
    orderBy: { number: "desc" },
  });

  const hasMore = blocks.length > limit;
  const items = (hasMore ? blocks.slice(0, limit) : blocks).map((b) => ({
    number: b.number,
    hash: b.hash,
    txCount: b.txCount,
    timestamp: b.timestamp,
  }));

  return { items, nextCursor: hasMore ? items[items.length - 1].number : null };
}

export async function getBlockByNumber(
  number: number,
  db: PrismaClient = defaultPrisma,
): Promise<BlockDetail | null> {
  const block = await db.block.findUnique({
    where: { number },
    include: { transactions: { orderBy: { indexInBlock: "asc" } } },
  });
  if (!block) return null;

  return {
    number: block.number,
    hash: block.hash,
    previousHash: block.previousHash,
    dataHash: block.dataHash,
    txCount: block.txCount,
    timestamp: block.timestamp,
    transactions: block.transactions.map((tx) => ({
      txId: tx.txId,
      blockNumber: tx.blockNumber,
      chaincodeName: tx.chaincodeName,
      functionName: tx.functionName,
      isValid: tx.isValid,
      timestamp: tx.timestamp,
    })),
  };
}
```

- [ ] **Step 5: Implement `src/lib/queries/transactions.ts`** (write this alongside — `blocks.ts` imports its `TransactionSummary` type)

```ts
// scanner/src/lib/queries/transactions.ts
import type { PrismaClient } from "@prisma/client";
import { prisma as defaultPrisma } from "../db/prisma";
import type { ReadSetEntry, WriteSetEntry } from "../fabric/blockDecoder";

export interface TransactionSummary {
  txId: string;
  blockNumber: number;
  chaincodeName: string;
  functionName: string;
  isValid: boolean;
  timestamp: Date;
}

export interface TransactionDetail extends TransactionSummary {
  creatorMspId: string;
  args: string[];
  validationCode: string;
  endorsingMspIds: string[];
  readSet: ReadSetEntry[];
  writeSet: WriteSetEntry[];
}

export async function listTransactions(
  opts: { cursor?: string; limit?: number; chaincodeName?: string; functionName?: string },
  db: PrismaClient = defaultPrisma,
): Promise<{ items: TransactionSummary[]; nextCursor: string | null }> {
  const limit = opts.limit ?? 20;
  const where = {
    ...(opts.chaincodeName ? { chaincodeName: opts.chaincodeName } : {}),
    ...(opts.functionName ? { functionName: opts.functionName } : {}),
  };

  const txs = await db.transaction.findMany({
    take: limit + 1,
    ...(opts.cursor ? { cursor: { txId: opts.cursor }, skip: 1 } : {}),
    where,
    orderBy: [{ blockNumber: "desc" }, { indexInBlock: "desc" }],
  });

  const hasMore = txs.length > limit;
  const rows = hasMore ? txs.slice(0, limit) : txs;
  const items = rows.map((tx) => ({
    txId: tx.txId,
    blockNumber: tx.blockNumber,
    chaincodeName: tx.chaincodeName,
    functionName: tx.functionName,
    isValid: tx.isValid,
    timestamp: tx.timestamp,
  }));

  return { items, nextCursor: hasMore ? items[items.length - 1].txId : null };
}

export async function getTransactionById(
  txId: string,
  db: PrismaClient = defaultPrisma,
): Promise<TransactionDetail | null> {
  const tx = await db.transaction.findUnique({ where: { txId } });
  if (!tx) return null;

  return {
    txId: tx.txId,
    blockNumber: tx.blockNumber,
    chaincodeName: tx.chaincodeName,
    functionName: tx.functionName,
    isValid: tx.isValid,
    timestamp: tx.timestamp,
    creatorMspId: tx.creatorMspId,
    args: tx.args as unknown as string[],
    validationCode: tx.validationCode,
    endorsingMspIds: tx.endorsingMspIds as unknown as string[],
    readSet: tx.readSet as unknown as ReadSetEntry[],
    writeSet: tx.writeSet as unknown as WriteSetEntry[],
  };
}
```

- [ ] **Step 6: Run the blocks test to verify it passes**

Run: `pnpm test -- src/lib/queries/blocks.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 7: Write and run the failing-then-passing test for `transactions.ts`**

```ts
// scanner/src/lib/queries/transactions.test.ts
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
```

Run: `pnpm test -- src/lib/queries/transactions.test.ts`
Expected: PASS (4 tests) — the implementation was already written in Step 5.

- [ ] **Step 8: Implement `src/lib/queries/status.ts`** (no live Fabric call — chain height is passed in by the caller, who already has it from `getChainInfo`)

```ts
// scanner/src/lib/queries/status.ts
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
```

- [ ] **Step 9: Implement `src/lib/queries/search.ts`**

```ts
// scanner/src/lib/queries/search.ts
import type { PrismaClient } from "@prisma/client";
import { prisma as defaultPrisma } from "../db/prisma";

export type SearchResult =
  | { type: "block"; number: number }
  | { type: "transaction"; txId: string }
  | { type: "not_found" };

export async function search(query: string, db: PrismaClient = defaultPrisma): Promise<SearchResult> {
  const trimmed = query.trim();
  if (trimmed === "") return { type: "not_found" };

  if (/^\d+$/.test(trimmed)) {
    const block = await db.block.findUnique({ where: { number: Number(trimmed) } });
    if (block) return { type: "block", number: block.number };
  }

  const tx = await db.transaction.findUnique({ where: { txId: trimmed } });
  if (tx) return { type: "transaction", txId: tx.txId };

  return { type: "not_found" };
}
```

- [ ] **Step 10: Commit**

```bash
git add -A
git commit -m "Add query layer (blocks, transactions, status, search)"
```

---

## Task 9: API routes

**Files:**
- Create: `scanner/src/app/api/status/route.ts`
- Create: `scanner/src/app/api/blocks/route.ts`
- Create: `scanner/src/app/api/blocks/[number]/route.ts`
- Create: `scanner/src/app/api/transactions/route.ts`
- Create: `scanner/src/app/api/transactions/[txId]/route.ts`
- Create: `scanner/src/app/api/search/route.ts`
- Create: `scanner/src/lib/fabric/statusConnection.ts` (shared read-only Fabric connection for API routes)

**Interfaces:**
- Consumes: everything from Task 8's query layer, plus `connectToFabric`/`getChainInfo` (Tasks 3-4) for the live chain height in `/api/status`.
- Produces: JSON endpoints consumed by Task 10-13's client-side polling components.

- [ ] **Step 1: Create a lazily-initialized shared Fabric connection for API routes**

Route handlers run per-request in Next's Node runtime but the process stays warm — a single long-lived connection avoids reconnecting to the peer on every `/api/status` poll.

```ts
// scanner/src/lib/fabric/statusConnection.ts
import { loadEnv } from "../env";
import { connectToFabric, type FabricConnection } from "./connection";

// Guarded on globalThis the same way src/lib/db/prisma.ts guards its
// PrismaClient singleton — without this, Next dev-mode hot-reload would
// open a fresh gRPC connection on every module reload without closing
// the old one.
declare global {
  // eslint-disable-next-line no-var
  var __fabricConnectionPromise: Promise<FabricConnection> | undefined;
}

export function getSharedFabricConnection(): Promise<FabricConnection> {
  if (!globalThis.__fabricConnectionPromise) {
    globalThis.__fabricConnectionPromise = connectToFabric(loadEnv());
  }
  return globalThis.__fabricConnectionPromise;
}
```

- [ ] **Step 2: Implement `/api/status`**

```ts
// scanner/src/app/api/status/route.ts
import { NextResponse } from "next/server";
import { loadEnv } from "@/lib/env";
import { getSharedFabricConnection } from "@/lib/fabric/statusConnection";
import { getChainInfo } from "@/lib/fabric/qscc";
import { getIndexerStatus } from "@/lib/queries/status";

export async function GET() {
  const env = loadEnv();
  const connection = await getSharedFabricConnection();
  const chainInfo = await getChainInfo(connection.qscc, env.channelName);
  const status = await getIndexerStatus(chainInfo.height);
  return NextResponse.json(status);
}
```

- [ ] **Step 3: Implement `/api/blocks` and `/api/blocks/[number]`**

```ts
// scanner/src/app/api/blocks/route.ts
import { NextResponse } from "next/server";
import { listBlocks } from "@/lib/queries/blocks";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const cursor = searchParams.get("cursor");
  const limit = searchParams.get("limit");

  const page = await listBlocks({
    cursor: cursor ? Number(cursor) : undefined,
    limit: limit ? Number(limit) : undefined,
  });

  return NextResponse.json(page);
}
```

```ts
// scanner/src/app/api/blocks/[number]/route.ts
import { NextResponse } from "next/server";
import { getBlockByNumber } from "@/lib/queries/blocks";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ number: string }> },
) {
  const { number } = await params;
  const block = await getBlockByNumber(Number(number));
  if (!block) return NextResponse.json({ error: "Block not found" }, { status: 404 });
  return NextResponse.json(block);
}
```

- [ ] **Step 4: Implement `/api/transactions` and `/api/transactions/[txId]`**

```ts
// scanner/src/app/api/transactions/route.ts
import { NextResponse } from "next/server";
import { listTransactions } from "@/lib/queries/transactions";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);

  const page = await listTransactions({
    cursor: searchParams.get("cursor") ?? undefined,
    limit: searchParams.get("limit") ? Number(searchParams.get("limit")) : undefined,
    chaincodeName: searchParams.get("chaincode") ?? undefined,
    functionName: searchParams.get("function") ?? undefined,
  });

  return NextResponse.json(page);
}
```

```ts
// scanner/src/app/api/transactions/[txId]/route.ts
import { NextResponse } from "next/server";
import { getTransactionById } from "@/lib/queries/transactions";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ txId: string }> },
) {
  const { txId } = await params;
  const tx = await getTransactionById(txId);
  if (!tx) return NextResponse.json({ error: "Transaction not found" }, { status: 404 });
  return NextResponse.json(tx);
}
```

- [ ] **Step 5: Implement `/api/search`**

```ts
// scanner/src/app/api/search/route.ts
import { NextResponse } from "next/server";
import { search } from "@/lib/queries/search";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const q = searchParams.get("q") ?? "";
  const result = await search(q);
  return NextResponse.json(result);
}
```

- [ ] **Step 6: Manually verify the routes** (requires the indexer to have populated at least one block — see Task 7 Step 2)

```bash
pnpm dev &
sleep 2
curl -s http://localhost:3000/api/status | head -c 300; echo
curl -s http://localhost:3000/api/blocks?limit=5 | head -c 500; echo
curl -s "http://localhost:3000/api/search?q=0" | head -c 200; echo
kill %1
```

Expected: each returns JSON (not a 500), `/api/status` shows `chainHeight` and `lastIndexedBlock`.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "Add API routes for status, blocks, transactions, and search"
```

---

## Task 10: Shared UI components + layout

**Files:**
- Modify: `scanner/src/app/layout.tsx`
- Create: `scanner/src/components/SearchBar.tsx`
- Create: `scanner/src/components/Pagination.tsx`
- Create: `scanner/src/components/ValidationBadge.tsx`
- Create: `scanner/src/components/BlocksTable.tsx`
- Create: `scanner/src/components/TransactionsTable.tsx`

**Interfaces:**
- Consumes: `BlockSummary` (Task 8's `blocks.ts`), `TransactionSummary` (Task 8's `transactions.ts`).
- Produces: `<SearchBar />`, `<Pagination nextCursor={...} basePath={...} />`, `<ValidationBadge isValid={...} />`, `<BlocksTable blocks={...} />`, `<TransactionsTable transactions={...} />` — all consumed by Tasks 11-13's pages.

- [ ] **Step 1: `ValidationBadge`**

```tsx
// scanner/src/components/ValidationBadge.tsx
export function ValidationBadge({ isValid }: { isValid: boolean }) {
  return (
    <span
      className={
        isValid
          ? "rounded-full bg-emerald-500/15 px-2 py-0.5 text-xs font-medium text-emerald-400"
          : "rounded-full bg-red-500/15 px-2 py-0.5 text-xs font-medium text-red-400"
      }
    >
      {isValid ? "Valid" : "Invalid"}
    </span>
  );
}
```

- [ ] **Step 2: `Pagination`** (client component — reads/writes the `cursor` query param)

```tsx
// scanner/src/components/Pagination.tsx
"use client";

import { useRouter, useSearchParams } from "next/navigation";

export function Pagination({ nextCursor, basePath }: { nextCursor: string | number | null; basePath: string }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const currentCursor = searchParams.get("cursor");

  return (
    <div className="flex items-center justify-between py-4 text-sm text-slate-400">
      <button
        disabled={!currentCursor}
        onClick={() => router.push(basePath)}
        className="rounded border border-slate-700 px-3 py-1 disabled:opacity-40"
      >
        Newest
      </button>
      <button
        disabled={nextCursor === null}
        onClick={() => router.push(`${basePath}?cursor=${nextCursor}`)}
        className="rounded border border-slate-700 px-3 py-1 disabled:opacity-40"
      >
        Older →
      </button>
    </div>
  );
}
```

- [ ] **Step 3: `SearchBar`** (client component — resolves via `/api/search` then navigates)

```tsx
// scanner/src/components/SearchBar.tsx
"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function SearchBar() {
  const router = useRouter();
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const res = await fetch(`/api/search?q=${encodeURIComponent(value)}`);
    const result = await res.json();

    if (result.type === "block") router.push(`/blocks/${result.number}`);
    else if (result.type === "transaction") router.push(`/transactions/${result.txId}`);
    else setError("No block or transaction found");
  }

  return (
    <form onSubmit={onSubmit} className="flex items-center gap-2">
      <input
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="Search by block number or transaction ID"
        className="w-96 rounded border border-slate-700 bg-slate-900 px-3 py-1.5 text-sm text-slate-100 placeholder:text-slate-500"
      />
      <button type="submit" className="rounded bg-blue-600 px-3 py-1.5 text-sm font-medium text-white">
        Search
      </button>
      {error && <span className="text-sm text-red-400">{error}</span>}
    </form>
  );
}
```

- [ ] **Step 4: `BlocksTable` and `TransactionsTable`**

```tsx
// scanner/src/components/BlocksTable.tsx
import Link from "next/link";
import type { BlockSummary } from "@/lib/queries/blocks";

export function BlocksTable({ blocks }: { blocks: BlockSummary[] }) {
  return (
    <table className="w-full text-left text-sm">
      <thead className="text-slate-400">
        <tr>
          <th className="py-2">Block</th>
          <th className="py-2">Hash</th>
          <th className="py-2">Txns</th>
          <th className="py-2">Timestamp</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-slate-800">
        {blocks.map((b) => (
          <tr key={b.number}>
            <td className="py-2">
              <Link href={`/blocks/${b.number}`} className="text-blue-400 hover:underline">
                {b.number}
              </Link>
            </td>
            <td className="py-2 font-mono text-xs text-slate-400">{b.hash ? `${b.hash.slice(0, 16)}…` : "pending"}</td>
            <td className="py-2">{b.txCount}</td>
            <td className="py-2 text-slate-400">{new Date(b.timestamp).toLocaleString()}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
```

```tsx
// scanner/src/components/TransactionsTable.tsx
import Link from "next/link";
import type { TransactionSummary } from "@/lib/queries/transactions";
import { ValidationBadge } from "./ValidationBadge";

export function TransactionsTable({ transactions }: { transactions: TransactionSummary[] }) {
  return (
    <table className="w-full text-left text-sm">
      <thead className="text-slate-400">
        <tr>
          <th className="py-2">Tx ID</th>
          <th className="py-2">Block</th>
          <th className="py-2">Function</th>
          <th className="py-2">Status</th>
          <th className="py-2">Timestamp</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-slate-800">
        {transactions.map((tx) => (
          <tr key={tx.txId}>
            <td className="py-2">
              <Link href={`/transactions/${tx.txId}`} className="text-blue-400 hover:underline">
                {tx.txId.slice(0, 12)}…
              </Link>
            </td>
            <td className="py-2">
              <Link href={`/blocks/${tx.blockNumber}`} className="text-blue-400 hover:underline">
                {tx.blockNumber}
              </Link>
            </td>
            <td className="py-2">
              {tx.chaincodeName}.{tx.functionName}
            </td>
            <td className="py-2">
              <ValidationBadge isValid={tx.isValid} />
            </td>
            <td className="py-2 text-slate-400">{new Date(tx.timestamp).toLocaleString()}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
```

- [ ] **Step 5: Update the root layout with a header + nav + search bar**

```tsx
// scanner/src/app/layout.tsx
import type { Metadata } from "next";
import Link from "next/link";
import { SearchBar } from "@/components/SearchBar";
import "./globals.css";

export const metadata: Metadata = {
  title: "CryoTrack Fabric Scanner",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="bg-slate-950 text-slate-100 antialiased">
        <header className="border-b border-slate-800 px-6 py-4">
          <div className="mx-auto flex max-w-6xl items-center justify-between gap-6">
            <nav className="flex items-center gap-6 text-sm font-medium">
              <Link href="/">CryoTrack Scanner</Link>
              <Link href="/blocks" className="text-slate-400 hover:text-slate-100">
                Blocks
              </Link>
              <Link href="/transactions" className="text-slate-400 hover:text-slate-100">
                Transactions
              </Link>
            </nav>
            <SearchBar />
          </div>
        </header>
        <div className="mx-auto max-w-6xl px-6 py-8">{children}</div>
      </body>
    </html>
  );
}
```

- [ ] **Step 6: Verify the app still builds**

Run: `pnpm build`
Expected: builds successfully (no type errors) — `/blocks` and `/transactions` pages don't exist yet, so the build only needs to succeed for `/` and the API routes; no `pnpm dev` visual check needed here since Task 11 replaces the placeholder homepage.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "Add shared UI components (search, pagination, tables) and header layout"
```

---

## Task 11: Dashboard page

**Files:**
- Modify: `scanner/src/app/page.tsx`
- Create: `scanner/src/components/LiveStatusBanner.tsx`

**Interfaces:**
- Consumes: `listBlocks`, `listTransactions` (Task 8, direct server-side call for initial render), `/api/status` (Task 9, client-side poll).

- [ ] **Step 1: `LiveStatusBanner`** (client component, polls `/api/status` every 3s)

```tsx
// scanner/src/components/LiveStatusBanner.tsx
"use client";

import { useEffect, useState } from "react";

interface IndexerStatus {
  chainHeight: number;
  lastIndexedBlock: number | null;
  isStalled: boolean;
}

export function LiveStatusBanner() {
  const [status, setStatus] = useState<IndexerStatus | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function poll() {
      try {
        const res = await fetch("/api/status");
        const data: IndexerStatus = await res.json();
        if (!cancelled) setStatus(data);
      } catch {
        // transient — next poll will retry
      }
    }
    poll();
    const interval = setInterval(poll, 3000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  if (!status) return null;

  return (
    <div className="mb-6 flex items-center gap-6 rounded border border-slate-800 bg-slate-900/50 px-4 py-3 text-sm">
      <span>
        Chain height: <strong>{status.chainHeight}</strong>
      </span>
      <span>
        Last indexed: <strong>{status.lastIndexedBlock ?? "—"}</strong>
      </span>
      {status.isStalled && <span className="text-amber-400">⚠ Indexer appears stalled</span>}
    </div>
  );
}
```

- [ ] **Step 2: Replace the placeholder `page.tsx` with the dashboard**

```tsx
// scanner/src/app/page.tsx
import { listBlocks } from "@/lib/queries/blocks";
import { listTransactions } from "@/lib/queries/transactions";
import { BlocksTable } from "@/components/BlocksTable";
import { TransactionsTable } from "@/components/TransactionsTable";
import { LiveStatusBanner } from "@/components/LiveStatusBanner";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const [blocks, transactions] = await Promise.all([
    listBlocks({ limit: 10 }),
    listTransactions({ limit: 10 }),
  ]);

  return (
    <main>
      <LiveStatusBanner />
      <section className="mb-10">
        <h2 className="mb-3 text-lg font-semibold">Latest blocks</h2>
        <BlocksTable blocks={blocks.items} />
      </section>
      <section>
        <h2 className="mb-3 text-lg font-semibold">Latest transactions</h2>
        <TransactionsTable transactions={transactions.items} />
      </section>
    </main>
  );
}
```

- [ ] **Step 3: Verify manually**

```bash
pnpm dev
```

Visit `http://localhost:3000`. If the indexer (Task 7) has run at least once, confirm blocks/transactions appear and the status banner updates. If not yet run, confirm the page still renders with empty tables (no crash).

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "Add dashboard page with live status banner"
```

---

## Task 12: Blocks pages

**Files:**
- Create: `scanner/src/app/blocks/page.tsx`
- Create: `scanner/src/app/blocks/[number]/page.tsx`

**Interfaces:**
- Consumes: `listBlocks`, `getBlockByNumber` (Task 8), `BlocksTable`, `TransactionsTable`, `Pagination`, `ValidationBadge` (Tasks 10-11).

- [ ] **Step 1: `/blocks` list page**

```tsx
// scanner/src/app/blocks/page.tsx
import { listBlocks } from "@/lib/queries/blocks";
import { BlocksTable } from "@/components/BlocksTable";
import { Pagination } from "@/components/Pagination";

export const dynamic = "force-dynamic";

export default async function BlocksPage({
  searchParams,
}: {
  searchParams: Promise<{ cursor?: string }>;
}) {
  const { cursor } = await searchParams;
  const page = await listBlocks({ cursor: cursor ? Number(cursor) : undefined, limit: 25 });

  return (
    <main>
      <h1 className="mb-4 text-xl font-semibold">Blocks</h1>
      <BlocksTable blocks={page.items} />
      <Pagination nextCursor={page.nextCursor} basePath="/blocks" />
    </main>
  );
}
```

- [ ] **Step 2: `/blocks/[number]` detail page**

```tsx
// scanner/src/app/blocks/[number]/page.tsx
import { notFound } from "next/navigation";
import { getBlockByNumber } from "@/lib/queries/blocks";
import { TransactionsTable } from "@/components/TransactionsTable";

export const dynamic = "force-dynamic";

export default async function BlockDetailPage({
  params,
}: {
  params: Promise<{ number: string }>;
}) {
  const { number } = await params;
  const block = await getBlockByNumber(Number(number));
  if (!block) notFound();

  return (
    <main>
      <h1 className="mb-4 text-xl font-semibold">Block #{block.number}</h1>
      <dl className="mb-8 grid grid-cols-[120px_1fr] gap-y-2 text-sm">
        <dt className="text-slate-400">Hash</dt>
        <dd className="font-mono text-xs">{block.hash ?? "pending (chain tip)"}</dd>
        <dt className="text-slate-400">Previous hash</dt>
        <dd className="font-mono text-xs">{block.previousHash}</dd>
        <dt className="text-slate-400">Data hash</dt>
        <dd className="font-mono text-xs">{block.dataHash}</dd>
        <dt className="text-slate-400">Timestamp</dt>
        <dd>{new Date(block.timestamp).toLocaleString()}</dd>
        <dt className="text-slate-400">Transactions</dt>
        <dd>{block.txCount}</dd>
      </dl>
      <h2 className="mb-3 text-lg font-semibold">Transactions</h2>
      <TransactionsTable transactions={block.transactions} />
    </main>
  );
}
```

- [ ] **Step 3: Verify manually**

```bash
pnpm dev
```

Visit `/blocks`, click into a block, confirm detail renders and pagination works (with ≥26 indexed blocks; if fewer, confirm "Older →" is disabled instead of erroring).

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "Add blocks list and detail pages"
```

---

## Task 13: Transactions pages

**Files:**
- Create: `scanner/src/app/transactions/page.tsx`
- Create: `scanner/src/app/transactions/[txId]/page.tsx`
- Create: `scanner/src/components/KeyValueList.tsx`

**Interfaces:**
- Consumes: `listTransactions`, `getTransactionById` (Task 8), `TransactionsTable`, `Pagination`, `ValidationBadge` (Tasks 10-11), `ReadSetEntry`/`WriteSetEntry` types (Task 5).

- [ ] **Step 1: `KeyValueList`** — renders read/write set entries

```tsx
// scanner/src/components/KeyValueList.tsx
import type { ReadSetEntry, WriteSetEntry } from "@/lib/fabric/blockDecoder";

export function ReadSetList({ entries }: { entries: ReadSetEntry[] }) {
  if (entries.length === 0) return <p className="text-sm text-slate-500">No reads recorded.</p>;
  return (
    <ul className="space-y-1 text-sm">
      {entries.map((r, i) => (
        <li key={i} className="font-mono text-xs">
          <span className="text-slate-500">{r.namespace}/</span>
          {r.key}
          {r.version && <span className="text-slate-500"> @ block {r.version.blockNum}, tx {r.version.txNum}</span>}
        </li>
      ))}
    </ul>
  );
}

export function WriteSetList({ entries }: { entries: WriteSetEntry[] }) {
  if (entries.length === 0) return <p className="text-sm text-slate-500">No writes recorded.</p>;
  return (
    <ul className="space-y-2 text-sm">
      {entries.map((w, i) => (
        <li key={i} className="font-mono text-xs">
          <div>
            <span className="text-slate-500">{w.namespace}/</span>
            {w.key} {w.isDelete && <span className="text-red-400">(delete)</span>}
          </div>
          {!w.isDelete && <pre className="mt-1 whitespace-pre-wrap rounded bg-slate-900 p-2 text-slate-300">{w.value}</pre>}
        </li>
      ))}
    </ul>
  );
}
```

- [ ] **Step 2: `/transactions` list page**

```tsx
// scanner/src/app/transactions/page.tsx
import { listTransactions } from "@/lib/queries/transactions";
import { TransactionsTable } from "@/components/TransactionsTable";
import { Pagination } from "@/components/Pagination";

export const dynamic = "force-dynamic";

export default async function TransactionsPage({
  searchParams,
}: {
  searchParams: Promise<{ cursor?: string; chaincode?: string; function?: string }>;
}) {
  const { cursor, chaincode, function: functionName } = await searchParams;
  const page = await listTransactions({
    cursor,
    limit: 25,
    chaincodeName: chaincode,
    functionName,
  });

  return (
    <main>
      <h1 className="mb-4 text-xl font-semibold">Transactions</h1>
      <TransactionsTable transactions={page.items} />
      <Pagination nextCursor={page.nextCursor} basePath="/transactions" />
    </main>
  );
}
```

- [ ] **Step 3: `/transactions/[txId]` detail page**

```tsx
// scanner/src/app/transactions/[txId]/page.tsx
import { notFound } from "next/navigation";
import { getTransactionById } from "@/lib/queries/transactions";
import { ValidationBadge } from "@/components/ValidationBadge";
import { ReadSetList, WriteSetList } from "@/components/KeyValueList";

export const dynamic = "force-dynamic";

export default async function TransactionDetailPage({
  params,
}: {
  params: Promise<{ txId: string }>;
}) {
  const { txId } = await params;
  const tx = await getTransactionById(txId);
  if (!tx) notFound();

  return (
    <main>
      <h1 className="mb-4 flex items-center gap-3 text-xl font-semibold">
        Transaction <ValidationBadge isValid={tx.isValid} />
      </h1>
      <dl className="mb-8 grid grid-cols-[140px_1fr] gap-y-2 text-sm">
        <dt className="text-slate-400">Tx ID</dt>
        <dd className="font-mono text-xs">{tx.txId}</dd>
        <dt className="text-slate-400">Block</dt>
        <dd>{tx.blockNumber}</dd>
        <dt className="text-slate-400">Timestamp</dt>
        <dd>{new Date(tx.timestamp).toLocaleString()}</dd>
        <dt className="text-slate-400">Creator MSP</dt>
        <dd>{tx.creatorMspId}</dd>
        <dt className="text-slate-400">Chaincode</dt>
        <dd>{tx.chaincodeName}</dd>
        <dt className="text-slate-400">Function</dt>
        <dd>{tx.functionName}</dd>
        <dt className="text-slate-400">Args</dt>
        <dd className="font-mono text-xs">{JSON.stringify(tx.args)}</dd>
        <dt className="text-slate-400">Validation code</dt>
        <dd>{tx.validationCode}</dd>
        <dt className="text-slate-400">Endorsed by</dt>
        <dd>{tx.endorsingMspIds.join(", ") || "—"}</dd>
      </dl>

      <h2 className="mb-2 text-lg font-semibold">Read set</h2>
      <div className="mb-8">
        <ReadSetList entries={tx.readSet} />
      </div>

      <h2 className="mb-2 text-lg font-semibold">Write set</h2>
      <WriteSetList entries={tx.writeSet} />
    </main>
  );
}
```

- [ ] **Step 4: Verify manually**

```bash
pnpm dev
```

Visit `/transactions`, filter with `?function=CommissionShipment`, click into a transaction, confirm args/read set/write set render correctly against real indexed data.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "Add transactions list and detail pages"
```

---

## Task 14: Final wiring, docs, and end-to-end verification

**Files:**
- Create: `scanner/README.md`
- Modify: `scanner/package.json` (only if issues surface in Step 2 below)

- [ ] **Step 1: Write `README.md`**

```markdown
# CryoTrack Fabric Scanner

Internal, Etherscan-style block explorer for the CryoTrack Hyperledger
Fabric network. Not customer-facing; no auth in v1.

## Setup

\`\`\`bash
pnpm install
cp .env.example .env   # adjust paths if your fabric/ checkout differs
pnpm prisma:migrate
\`\`\`

## Running

Requires the local Fabric network up (see `../fabric/README.md`).

Two processes:

\`\`\`bash
pnpm dev       # Next.js app — http://localhost:3000
pnpm indexer   # background sync loop, polls qscc and writes to scanner.db
\`\`\`

Or both together: `pnpm dev:all`.

## Resetting the index

The SQLite DB is fully derived from the ledger — delete and re-migrate to
resync from block 0:

\`\`\`bash
rm scanner.db scanner.db-journal
pnpm prisma:migrate
pnpm indexer
\`\`\`
```

- [ ] **Step 2: Full end-to-end verification against the live local network**

```bash
cd /Users/manibrar/Documents/CryoTrack/fabric
yarn workspace @cryotrack/orderer run start
yarn workspace @cryotrack/peer run start:exporter
yarn workspace @cryotrack/peer run start:logistics
# (skip channel create/deploy if already done in a prior session)

cd /Users/manibrar/Documents/CryoTrack/scanner
rm -f scanner.db scanner.db-journal
pnpm prisma:migrate
pnpm dev:all
```

In another terminal, submit a real transaction through the existing backend (or `fabric/packages/sdk`) to produce at least one fresh block, then:

- Confirm the dashboard at `http://localhost:3000` shows the new block/tx within ~3s (poll interval) without a manual refresh.
- Confirm `/blocks/<number>` for that block shows the correct transaction, and its `hash` field is populated once a subsequent block commits.
- Confirm `/transactions/<txId>` shows correct args, chaincode/function, endorsers, and read/write set matching what was actually submitted.
- Search by that block's number and by the tx ID in the header search bar; confirm both navigate correctly.
- Stop the indexer (Ctrl+C), submit another transaction, confirm `/api/status` reports growing lag, then restart the indexer and confirm it catches up and `isStalled` clears.

- [ ] **Step 3: Run the full test suite one more time**

```bash
pnpm test
```

Expected: all tests pass.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "Add README and complete end-to-end verification"
```
