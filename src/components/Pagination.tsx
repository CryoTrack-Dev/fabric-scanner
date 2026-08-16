"use client";

import { useRouter, useSearchParams } from "next/navigation";

function buildUrl(basePath: string, params: URLSearchParams, cursor: string | number | null): string {
  const next = new URLSearchParams(params);
  if (cursor === null) {
    next.delete("cursor");
  } else {
    next.set("cursor", String(cursor));
  }
  const qs = next.toString();
  return qs ? `${basePath}?${qs}` : basePath;
}

export function Pagination({ nextCursor, basePath }: { nextCursor: string | number | null; basePath: string }) {
  const router = useRouter();
  // Relies on the host page having `export const dynamic = "force-dynamic"`,
  // which avoids Next.js's static-shell Suspense-boundary requirement for
  // useSearchParams().
  const searchParams = useSearchParams();
  const currentCursor = searchParams.get("cursor");

  return (
    <div className="flex items-center justify-between py-4 text-sm text-slate-400">
      <button
        disabled={!currentCursor}
        onClick={() => router.push(buildUrl(basePath, searchParams, null))}
        className="rounded border border-slate-700 px-3 py-1 disabled:opacity-40"
      >
        Newest
      </button>
      <button
        disabled={nextCursor === null}
        onClick={() => router.push(buildUrl(basePath, searchParams, nextCursor))}
        className="rounded border border-slate-700 px-3 py-1 disabled:opacity-40"
      >
        Older →
      </button>
    </div>
  );
}
