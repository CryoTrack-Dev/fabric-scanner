import { NextResponse } from "next/server";
import { search } from "@/lib/queries/search";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const q = searchParams.get("q") ?? "";
  const result = await search(q);
  return NextResponse.json(result);
}
