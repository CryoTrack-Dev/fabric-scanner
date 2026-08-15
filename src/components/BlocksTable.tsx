import Link from "next/link";
import type { BlockSummary } from "@/lib/queries/blocks";

export function BlocksTable({ blocks }: { blocks: BlockSummary[] }) {
  return (
    <table className="w-full text-left text-sm">
      <thead className="text-slate-400">
        <tr>
          <th className="py-2">Block</th>
          <th className="py-2">Hash</th>
          <th className="py-2">Txns</th>
          <th className="py-2">Timestamp</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-slate-800">
        {blocks.map((b) => (
          <tr key={b.number}>
            <td className="py-2">
              <Link href={`/blocks/${b.number}`} className="text-blue-400 hover:underline">
                {b.number}
              </Link>
            </td>
            <td className="py-2 font-mono text-xs text-slate-400">{b.hash ? `${b.hash.slice(0, 16)}…` : "pending"}</td>
            <td className="py-2">{b.txCount}</td>
            <td className="py-2 text-slate-400">{new Date(b.timestamp).toLocaleString()}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
