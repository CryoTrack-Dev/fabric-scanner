import { NextResponse } from "next/server";
import { listBlocks } from "@/lib/queries/blocks";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const cursor = searchParams.get("cursor");
  const limit = searchParams.get("limit");

  const page = await listBlocks({
    cursor: cursor ? Number(cursor) : undefined,
    limit: limit ? Number(limit) : undefined,
  });

  return NextResponse.json(page);
}
