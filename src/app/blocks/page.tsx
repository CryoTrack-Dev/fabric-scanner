import { listBlocks } from "@/lib/queries/blocks";
import { BlocksTable } from "@/components/BlocksTable";
import { Pagination } from "@/components/Pagination";

export const dynamic = "force-dynamic";

export default async function BlocksPage({
  searchParams,
}: {
  searchParams: Promise<{ cursor?: string }>;
}) {
  const { cursor } = await searchParams;
  const page = await listBlocks({ cursor: cursor ? Number(cursor) : undefined, limit: 25 });

  return (
    <main>
      <h1 className="mb-4 text-xl font-semibold">Blocks</h1>
      <BlocksTable blocks={page.items} />
      <Pagination nextCursor={page.nextCursor} basePath="/blocks" />
    </main>
  );
}
