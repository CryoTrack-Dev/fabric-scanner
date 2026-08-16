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
    globalThis.__fabricConnectionPromise = connectToFabric(loadEnv()).catch((error) => {
      // Clear the cache on failure so the next call retries fresh instead of
      // re-awaiting a permanently-rejected promise forever (e.g. after a
      // transient peer outage).
      globalThis.__fabricConnectionPromise = undefined;
      throw error;
    });
  }
  return globalThis.__fabricConnectionPromise;
}
