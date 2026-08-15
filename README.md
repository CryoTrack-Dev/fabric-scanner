# CryoTrack Fabric Scanner

Internal, Etherscan-style block explorer for the CryoTrack Hyperledger
Fabric network. Not customer-facing; no auth in v1.

## Setup

```bash
pnpm install
cp .env.example .env   # adjust paths if your fabric/ checkout differs
pnpm prisma:migrate
```

## Running

Requires the local Fabric network up (see `../fabric/README.md`).

Two processes:

```bash
pnpm dev       # Next.js app — http://localhost:3000
pnpm indexer   # background sync loop, polls qscc and writes to scanner.db
```

Or both together: `pnpm dev:all`.

## Resetting the index

The SQLite DB is fully derived from the ledger — delete and re-migrate to
resync from block 0:

```bash
rm scanner.db scanner.db-journal
pnpm prisma:migrate
pnpm indexer
```
