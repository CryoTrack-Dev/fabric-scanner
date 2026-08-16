import { NextResponse } from "next/server";
import { loadEnv } from "@/lib/env";
import { getSharedFabricConnection } from "@/lib/fabric/statusConnection";
import { getChainInfo } from "@/lib/fabric/qscc";
import { getIndexerStatus } from "@/lib/queries/status";

export async function GET() {
  const env = loadEnv();

  let chainHeight: number;
  try {
    const connection = await getSharedFabricConnection();
    const chainInfo = await getChainInfo(connection.qscc, env.channelName);
    chainHeight = chainInfo.height;
  } catch (error) {
    return NextResponse.json(
      { peerReachable: false, error: error instanceof Error ? error.message : String(error) },
      { status: 200 },
    );
  }

  const status = await getIndexerStatus(chainHeight);
  return NextResponse.json({ ...status, peerReachable: true });
}
