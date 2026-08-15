import { NextResponse } from "next/server";
import { getBlockByNumber } from "@/lib/queries/blocks";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ number: string }> },
) {
  const { number } = await params;
  const block = await getBlockByNumber(Number(number));
  if (!block) return NextResponse.json({ error: "Block not found" }, { status: 404 });
  return NextResponse.json(block);
}
