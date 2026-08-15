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
