# CryoTrack Fabric Scanner — Design

## Purpose

An internal, Etherscan-style block explorer for the CryoTrack Hyperledger
Fabric network (`fabric/` monorepo, channel `supplychain`, chaincode
`cryotrack`). Lets the team browse blocks and transactions, inspect
transaction detail (args, read/write set, endorsers, validation status),
and search by block number or transaction ID — without needing `peer`
CLI calls or reading raw ledger dumps.

Not customer-facing. No production hosting requirement for v1; runs
locally against the local Fabric network alongside `fabric/`,
`cryo-backend`, and `webapp/cryotrack`.

## Why not the official Hyperledger Explorer

`hyperledger-labs/blockchain-explorer` was EOL'd by the TSC in 2022 and
its repo was archived (read-only) in Feb 2026. It's also a heavier stack
(Java/PostgreSQL/Angular) than this internal tool needs. Building a
small TypeScript-native scanner that reuses CryoTrack's existing Fabric
connection pattern is a better fit.

## Non-goals (v1)

- Multi-channel / multi-tenant support (only one tenant, `cryo-01`,
  exists today — see `cryo-backend/src/config/fabric-tenants.config.ts`).
  Config is still shaped so a second tenant could be added later, but
  no UI for switching between them.
- Auth/login. Runs locally / on the internal network only.
- Historical re-indexing tooling beyond "sync from block 0."

## Architecture

New standalone project: `scanner/` (own git repo, sibling to `fabric/`,
`cryo-backend/`, `webapp/cryotrack`), a single Next.js app (matching the
`webapp/cryotrack` stack: Next 16, React 19, TypeScript).

Two processes, one codebase:

1. **Indexer** (`pnpm indexer`) — a standalone Node script, *not* a
   Next.js API route. Runs a poll loop: calls `qscc.GetChainInfo` every
   few seconds, and for any new block numbers, calls
   `qscc.GetBlockByNumber`, decodes the protobuf `Block`/`Envelope` via
   `fabric-protos`, and writes rows to SQLite via Prisma. A standalone
   script avoids Next.js dev-mode hot-reload spawning duplicate
   background loops, which an in-route poller would risk.
2. **Next.js app** (`pnpm dev`) — API routes read only from SQLite (no
   live peer round-trip per page load); pages poll those routes
   (~3s) for a live-updating feel.

`pnpm start` (root script) runs both via `concurrently`.

### Fabric connection

Reuses the existing gRPC + TLS + identity pattern from
`cryo-backend/src/modules/fabric/fabric.service.ts` and
`fabric/packages/sdk/src/client.ts`: the ExporterOrg `User1` identity
under `fabric/packages/network/crypto-material`, read via
`FABRIC_CRYPTO_BASE` env var (same default path the backend uses).
Instead of the `cryotrack` application contract, the scanner targets
Fabric's built-in `qscc` system chaincode:

- `GetChainInfo` → current block height, current block hash
- `GetBlockByNumber` → raw block bytes for a given height
- `GetTransactionByID` → raw envelope bytes for a given txId (used for
  targeted lookups, e.g. from search)

All calls are `evaluateTransaction` (read-only, no endorsement) — the
scanner never calls `submitTransaction`, so there's no risk of it
writing to the ledger.

Configuration lives in `scanner/.env`, mirroring the shape of
`FABRIC_TENANT_CONFIGS` in `cryo-backend/src/config/fabric-tenants.config.ts`
(peer address, peer TLS name, MSP ID, channel, cert/key paths under
`FABRIC_CRYPTO_BASE`) so a second tenant could be added later without
restructuring.

### Block/transaction decoding

Raw protobuf bytes are decoded with the `fabric-protos` npm package
into a `Block` message, which contains one `Envelope` per transaction.
Each envelope decodes to: txId, timestamp, creator MSP ID, chaincode
name, invoked function + args, endorsing org MSPs, the read/write set
(key-version reads, key-value writes), and the block's per-tx
`TxValidationCode` (valid vs. one of Fabric's invalid reasons — Fabric
keeps invalid transactions in the ledger, and the scanner surfaces them
the way Etherscan shows failed transactions).

This decoding logic is pure (bytes in, typed objects out) and lives in
its own module so it can be unit-tested against fixture block bytes
without a running network.

## Data model (Prisma + SQLite)

```
model Block {
  number    Int      @id
  hash      String
  prevHash  String
  dataHash  String
  txCount   Int
  timestamp DateTime
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
  args            String   // JSON-encoded string[]
  validationCode  String   // e.g. "VALID", "MVCC_READ_CONFLICT"
  isValid         Boolean
  readSet         String   // JSON
  writeSet        String   // JSON
  block           Block    @relation(fields: [blockNumber], references: [number])

  @@index([blockNumber])
  @@index([chaincodeName, functionName])
}
```

Single SQLite file, committed to `.gitignore` (regeneratable by
re-running the indexer from block 0 — no need to preserve it across
clones).

## API routes

- `GET /api/status` — chain height (from qscc, live), last indexed
  block (from SQLite), indexer lag/health.
- `GET /api/blocks?cursor=&limit=` — paginated blocks, newest first.
- `GET /api/blocks/[number]` — block detail + its transactions.
- `GET /api/transactions?cursor=&limit=&chaincode=&function=&mspId=` —
  paginated/filterable transactions, newest first.
- `GET /api/transactions/[txId]` — transaction detail: args, read/write
  set, endorsers, validation status, block number.
- `GET /api/search?q=` — resolves `q` to a block number (numeric) or a
  transaction ID (exact match), returns a redirect target for the UI.

## Pages

- `/` — dashboard: chain height, last block time, tx count, latest
  blocks table, latest transactions table (auto-refreshing).
- `/blocks` — paginated block list.
- `/blocks/[number]` — block detail + table of its transactions.
- `/transactions` — paginated, filterable by chaincode function
  (e.g. `CommissionShipment`, `RecordHandoff`) and creator MSP.
- `/transactions/[txId]` — full transaction detail.
- Header search bar (block number or tx ID) on every page.

## Error handling

- Peer unreachable: indexer logs and retries with backoff;
  `/api/status` reflects "indexer stalled" so the UI can show a banner
  instead of silently going stale.
- Unparseable block (defensive, shouldn't happen on a healthy Fabric
  network): log and skip, continue indexing subsequent blocks — an
  internal tool doesn't need an elaborate dead-letter table for this.

## Testing

- Unit tests (Vitest, matching `webapp/cryotrack`) for the block/tx
  protobuf decoding module, using fixture block bytes captured from the
  local network — pure functions, no running peer required.
- API route tests against a seeded SQLite test DB.
- Manual/e2e verification against the actual local `fabric/` network
  (bring up the network, run the indexer, confirm blocks/txns appear)
  since a real Fabric network isn't practical to spin up in unit tests.
