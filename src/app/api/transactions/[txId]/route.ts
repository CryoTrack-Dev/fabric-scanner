import { NextResponse } from "next/server";
import { getTransactionById } from "@/lib/queries/transactions";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ txId: string }> },
) {
  const { txId } = await params;
  const tx = await getTransactionById(txId);
  if (!tx) return NextResponse.json({ error: "Transaction not found" }, { status: 404 });
  return NextResponse.json(tx);
}
