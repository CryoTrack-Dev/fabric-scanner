"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function SearchBar() {
  const router = useRouter();
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const res = await fetch(`/api/search?q=${encodeURIComponent(value)}`);
    const result = await res.json();

    if (result.type === "block") router.push(`/blocks/${result.number}`);
    else if (result.type === "transaction") router.push(`/transactions/${result.txId}`);
    else setError("No block or transaction found");
  }

  return (
    <form onSubmit={onSubmit} className="flex items-center gap-2">
      <input
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="Search by block number or transaction ID"
        className="w-96 rounded border border-slate-700 bg-slate-900 px-3 py-1.5 text-sm text-slate-100 placeholder:text-slate-500"
      />
      <button type="submit" className="rounded bg-blue-600 px-3 py-1.5 text-sm font-medium text-white">
        Search
      </button>
      {error && <span className="text-sm text-red-400">{error}</span>}
    </form>
  );
}
