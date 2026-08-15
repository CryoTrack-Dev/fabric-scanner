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
