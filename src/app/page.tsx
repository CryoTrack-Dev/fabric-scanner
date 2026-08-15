import { listBlocks } from "@/lib/queries/blocks";
import { listTransactions } from "@/lib/queries/transactions";
import { BlocksTable } from "@/components/BlocksTable";
import { TransactionsTable } from "@/components/TransactionsTable";
import { LiveStatusBanner } from "@/components/LiveStatusBanner";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const [blocks, transactions] = await Promise.all([
    listBlocks({ limit: 10 }),
    listTransactions({ limit: 10 }),
  ]);

  return (
    <main>
      <LiveStatusBanner />
      <section className="mb-10">
        <h2 className="mb-3 text-lg font-semibold">Latest blocks</h2>
        <BlocksTable blocks={blocks.items} />
      </section>
      <section>
        <h2 className="mb-3 text-lg font-semibold">Latest transactions</h2>
        <TransactionsTable transactions={transactions.items} />
      </section>
    </main>
  );
}
