"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

interface ConnectedStatus {
  peerReachable: true;
  chainHeight: number;
  lastIndexedBlock: number | null;
  isStalled: boolean;
}

interface UnreachableStatus {
  peerReachable: false;
  error: string;
}

type IndexerStatus = ConnectedStatus | UnreachableStatus;

export function LiveStatusBanner() {
  const router = useRouter();
  const [status, setStatus] = useState<IndexerStatus | null>(null);
  // Tracks the previously observed lastIndexedBlock so we only call
  // router.refresh() when it actually changes, not on every 3s poll.
  const previousBlockRef = useRef<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function poll() {
      try {
        const res = await fetch("/api/status");
        const data: IndexerStatus = await res.json();
        if (cancelled) return;
        setStatus(data);
        if (data.peerReachable && data.lastIndexedBlock !== previousBlockRef.current) {
          previousBlockRef.current = data.lastIndexedBlock;
          router.refresh();
        }
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
  }, [router]);

  if (!status) return null;

  if (!status.peerReachable) {
    return (
      <div className="mb-6 flex items-center gap-2 rounded border border-amber-800 bg-amber-950/40 px-4 py-3 text-sm text-amber-400">
        <span>⚠ Fabric peer unreachable</span>
        <span className="text-amber-500/70">— {status.error}</span>
      </div>
    );
  }

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
