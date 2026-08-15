import Link from "next/link";
import type { TransactionSummary } from "@/lib/queries/transactions";
import { ValidationBadge } from "./ValidationBadge";

export function TransactionsTable({ transactions }: { transactions: TransactionSummary[] }) {
  return (
    <table className="w-full text-left text-sm">
      <thead className="text-slate-400">
        <tr>
          <th className="py-2">Tx ID</th>
          <th className="py-2">Block</th>
          <th className="py-2">Function</th>
          <th className="py-2">Status</th>
          <th className="py-2">Timestamp</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-slate-800">
        {transactions.map((tx) => (
          <tr key={tx.txId}>
            <td className="py-2">
              <Link href={`/transactions/${tx.txId}`} className="text-blue-400 hover:underline">
                {tx.txId.slice(0, 12)}…
              </Link>
            </td>
            <td className="py-2">
              <Link href={`/blocks/${tx.blockNumber}`} className="text-blue-400 hover:underline">
                {tx.blockNumber}
              </Link>
            </td>
            <td className="py-2">
              {tx.chaincodeName}.{tx.functionName}
            </td>
            <td className="py-2">
              <ValidationBadge isValid={tx.isValid} />
            </td>
            <td className="py-2 text-slate-400">{new Date(tx.timestamp).toLocaleString()}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
