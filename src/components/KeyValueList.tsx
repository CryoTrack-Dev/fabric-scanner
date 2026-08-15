import type { ReadSetEntry, WriteSetEntry } from "@/lib/fabric/blockDecoder";

export function ReadSetList({ entries }: { entries: ReadSetEntry[] }) {
  if (entries.length === 0) return <p className="text-sm text-slate-500">No reads recorded.</p>;
  return (
    <ul className="space-y-1 text-sm">
      {entries.map((r, i) => (
        <li key={i} className="font-mono text-xs">
          <span className="text-slate-500">{r.namespace}/</span>
          {r.key}
          {r.version && <span className="text-slate-500"> @ block {r.version.blockNum}, tx {r.version.txNum}</span>}
        </li>
      ))}
    </ul>
  );
}

export function WriteSetList({ entries }: { entries: WriteSetEntry[] }) {
  if (entries.length === 0) return <p className="text-sm text-slate-500">No writes recorded.</p>;
  return (
    <ul className="space-y-2 text-sm">
      {entries.map((w, i) => (
        <li key={i} className="font-mono text-xs">
          <div>
            <span className="text-slate-500">{w.namespace}/</span>
            {w.key} {w.isDelete && <span className="text-red-400">(delete)</span>}
          </div>
          {!w.isDelete && <pre className="mt-1 whitespace-pre-wrap rounded bg-slate-900 p-2 text-slate-300">{w.value}</pre>}
        </li>
      ))}
    </ul>
  );
}
