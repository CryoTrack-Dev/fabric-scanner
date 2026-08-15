"use client";

import { useEffect, useState } from "react";

interface IndexerStatus {
  chainHeight: number;
  lastIndexedBlock: number | null;
  isStalled: boolean;
}

export function LiveStatusBanner() {
  const [status, setStatus] = useState<IndexerStatus | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function poll() {
      try {
        const res = await fetch("/api/status");
        const data: IndexerStatus = await res.json();
        if (!cancelled) setStatus(data);
      } catch {
        // transient — next poll will retry
      }
    }
    poll();
    const interval = setInterval(poll, 3000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  if (!status) return null;

  return (
    <div className="mb-6 flex items-center gap-6 rounded border border-slate-800 bg-slate-900/50 px-4 py-3 text-sm">
      <span>
        Chain height: <strong>{status.chainHeight}</strong>
      </span>
      <span>
        Last indexed: <strong>{status.lastIndexedBlock ?? "—"}</strong>
      </span>
      {status.isStalled && <span className="text-amber-400">⚠ Indexer appears stalled</span>}
    </div>
  );
}
