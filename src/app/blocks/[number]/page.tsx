import { notFound } from "next/navigation";
import { getBlockByNumber } from "@/lib/queries/blocks";
import { TransactionsTable } from "@/components/TransactionsTable";

export const dynamic = "force-dynamic";

export default async function BlockDetailPage({
  params,
}: {
  params: Promise<{ number: string }>;
}) {
  const { number } = await params;
  const block = await getBlockByNumber(Number(number));
  if (!block) notFound();

  return (
    <main>
      <h1 className="mb-4 text-xl font-semibold">Block #{block.number}</h1>
      <dl className="mb-8 grid grid-cols-[120px_1fr] gap-y-2 text-sm">
        <dt className="text-slate-400">Hash</dt>
        <dd className="font-mono text-xs">{block.hash ?? "pending (chain tip)"}</dd>
        <dt className="text-slate-400">Previous hash</dt>
        <dd className="font-mono text-xs">{block.previousHash}</dd>
        <dt className="text-slate-400">Data hash</dt>
        <dd className="font-mono text-xs">{block.dataHash}</dd>
        <dt className="text-slate-400">Timestamp</dt>
        <dd>{new Date(block.timestamp).toLocaleString()}</dd>
        <dt className="text-slate-400">Transactions</dt>
        <dd>{block.txCount}</dd>
      </dl>
      <h2 className="mb-3 text-lg font-semibold">Transactions</h2>
      <TransactionsTable transactions={block.transactions} />
    </main>
  );
}
