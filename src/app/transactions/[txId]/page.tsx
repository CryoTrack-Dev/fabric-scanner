import { notFound } from "next/navigation";
import { getTransactionById } from "@/lib/queries/transactions";
import { ValidationBadge } from "@/components/ValidationBadge";
import { ReadSetList, WriteSetList } from "@/components/KeyValueList";

export const dynamic = "force-dynamic";

export default async function TransactionDetailPage({
  params,
}: {
  params: Promise<{ txId: string }>;
}) {
  const { txId } = await params;
  const tx = await getTransactionById(txId);
  if (!tx) notFound();

  return (
    <main>
      <h1 className="mb-4 flex items-center gap-3 text-xl font-semibold">
        Transaction <ValidationBadge isValid={tx.isValid} />
      </h1>
      <dl className="mb-8 grid grid-cols-[140px_1fr] gap-y-2 text-sm">
        <dt className="text-slate-400">Tx ID</dt>
        <dd className="font-mono text-xs">{tx.txId}</dd>
        <dt className="text-slate-400">Block</dt>
        <dd>{tx.blockNumber}</dd>
        <dt className="text-slate-400">Timestamp</dt>
        <dd>{new Date(tx.timestamp).toLocaleString()}</dd>
        <dt className="text-slate-400">Creator MSP</dt>
        <dd>{tx.creatorMspId}</dd>
        <dt className="text-slate-400">Chaincode</dt>
        <dd>{tx.chaincodeName}</dd>
        <dt className="text-slate-400">Function</dt>
        <dd>{tx.functionName}</dd>
        <dt className="text-slate-400">Args</dt>
        <dd className="font-mono text-xs">{JSON.stringify(tx.args)}</dd>
        <dt className="text-slate-400">Validation code</dt>
        <dd>{tx.validationCode}</dd>
        <dt className="text-slate-400">Endorsed by</dt>
        <dd>{tx.endorsingMspIds.join(", ") || "—"}</dd>
      </dl>

      <h2 className="mb-2 text-lg font-semibold">Read set</h2>
      <div className="mb-8">
        <ReadSetList entries={tx.readSet} />
      </div>

      <h2 className="mb-2 text-lg font-semibold">Write set</h2>
      <WriteSetList entries={tx.writeSet} />
    </main>
  );
}
