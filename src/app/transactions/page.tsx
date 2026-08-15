import { listTransactions } from "@/lib/queries/transactions";
import { TransactionsTable } from "@/components/TransactionsTable";
import { Pagination } from "@/components/Pagination";

export const dynamic = "force-dynamic";

export default async function TransactionsPage({
  searchParams,
}: {
  searchParams: Promise<{ cursor?: string; chaincode?: string; function?: string }>;
}) {
  const { cursor, chaincode, function: functionName } = await searchParams;
  const page = await listTransactions({
    cursor,
    limit: 25,
    chaincodeName: chaincode,
    functionName,
  });

  return (
    <main>
      <h1 className="mb-4 text-xl font-semibold">Transactions</h1>
      <TransactionsTable transactions={page.items} />
      <Pagination nextCursor={page.nextCursor} basePath="/transactions" />
    </main>
  );
}
