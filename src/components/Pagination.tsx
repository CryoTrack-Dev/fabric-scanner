"use client";

import { useRouter, useSearchParams } from "next/navigation";

export function Pagination({ nextCursor, basePath }: { nextCursor: string | number | null; basePath: string }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const currentCursor = searchParams.get("cursor");

  return (
    <div className="flex items-center justify-between py-4 text-sm text-slate-400">
      <button
        disabled={!currentCursor}
        onClick={() => router.push(basePath)}
        className="rounded border border-slate-700 px-3 py-1 disabled:opacity-40"
      >
        Newest
      </button>
      <button
        disabled={nextCursor === null}
        onClick={() => router.push(`${basePath}?cursor=${nextCursor}`)}
        className="rounded border border-slate-700 px-3 py-1 disabled:opacity-40"
      >
        Older →
      </button>
    </div>
  );
}
