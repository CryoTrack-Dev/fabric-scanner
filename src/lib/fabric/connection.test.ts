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
