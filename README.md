# CryoTrack Fabric Scanner

Internal, Etherscan-style block explorer for the CryoTrack Hyperledger
Fabric network. Not customer-facing; no auth in v1.

## Setup

```bash
pnpm install
cp .env.example .env   # adjust paths if your fabric/ checkout differs
pnpm prisma:migrate
```

> **`FABRIC_CRYPTO_BASE` must point at the CA-enrolled identity directory**
> (`fabric/packages/ca/organizations`), **not** the older cryptogen-generated
> `fabric/packages/network/crypto-material` tree. Both directories share an
> identical substructure (`peerOrganizations/<org>/...`), but the keys inside
> are not interchangeable — pointing at the wrong one produces an opaque
> TLS/identity handshake failure rather than a clear "wrong directory" error.
> This is the single most valuable thing to get right when setting up your
> `.env`.

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

> **Restart `pnpm dev` after resetting the DB.** An already-running dev
> server holds a stale file handle to the deleted-and-recreated SQLite file
> and will keep serving from an effectively empty/stale view of the DB after
> a reset. Kill and restart the dev server (not just the indexer) whenever
> you reset `scanner.db`.

## Testing

```bash
pnpm test
```
