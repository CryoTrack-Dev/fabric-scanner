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
    expect(env.fabricCryptoBase).toContain("organizations");
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
