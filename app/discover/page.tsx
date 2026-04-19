import Link from "next/link";
import { getWatchlist } from "@/lib/watchlist";
import DiscoverClient from "./client";

export const dynamic = "force-dynamic";

export default async function DiscoverPage() {
  const watchlist = await getWatchlist();
  const watchlistIds = watchlist.map((c) => c.id);

  return (
    <main className="mx-auto max-w-5xl px-6 py-16">
      <header className="mb-10 flex items-start justify-between gap-6">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Discover</h1>
          <p className="mt-2 text-sm text-neutral-400">
            Find pre-A SF startups without a designer, or add a company by domain.
          </p>
        </div>
        <Link
          href="/"
          className="rounded-md border border-neutral-800 bg-neutral-950 px-3 py-1.5 text-sm text-neutral-200 hover:border-neutral-700 hover:text-white"
        >
          ← Watchlist
        </Link>
      </header>

      <DiscoverClient initialWatchlistIds={watchlistIds} />
    </main>
  );
}
