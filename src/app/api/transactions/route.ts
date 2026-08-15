import { NextResponse } from "next/server";
import { listTransactions } from "@/lib/queries/transactions";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);

  const page = await listTransactions({
    cursor: searchParams.get("cursor") ?? undefined,
    limit: searchParams.get("limit") ? Number(searchParams.get("limit")) : undefined,
    chaincodeName: searchParams.get("chaincode") ?? undefined,
    functionName: searchParams.get("function") ?? undefined,
  });

  return NextResponse.json(page);
}
