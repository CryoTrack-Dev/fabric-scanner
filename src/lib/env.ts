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
