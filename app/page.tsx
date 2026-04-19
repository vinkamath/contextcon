import Link from "next/link";
import { getWatchlist } from "@/lib/watchlist";
import CompanyCard from "./company-card";

export const dynamic = "force-dynamic";

export default async function Home() {
  const watchlist = await getWatchlist();

  return (
    <main className="mx-auto max-w-5xl px-6 py-16">
      <header className="mb-12 flex items-end justify-between gap-6">
        <div>
          <h1 className="text-4xl font-semibold tracking-tight">Riffle</h1>
          <div className="mt-3 space-y-1 text-neutral-400">
            <p>
              We find companies that are about to look for product designers—using
              hiring and growth signals, not job-board noise.
            </p>
            <p>
              That shortlist feeds cold email so we reach the right teams before the
              search gets crowded.
            </p>
          </div>
        </div>
        <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
          <Link
            href="/dashboard"
            className="rounded-md border border-neutral-800 bg-neutral-950 px-3 py-1.5 text-sm font-medium text-neutral-200 hover:border-neutral-700 hover:text-white"
          >
            Dashboard →
          </Link>
          <Link
            href="/discover"
            className="rounded-md border border-neutral-800 bg-neutral-950 px-3 py-1.5 text-sm font-medium text-neutral-200 hover:border-neutral-700 hover:text-white"
          >
            Discover companies →
          </Link>
        </div>
      </header>

      <section className="space-y-4">
        <h2 className="text-sm uppercase tracking-wider text-neutral-500">
          Watchlist ({watchlist.length})
        </h2>
        {watchlist.length === 0 ? (
          <EmptyState />
        ) : (
          watchlist.map((company) => (
            <CompanyCard key={company.id} company={company} />
          ))
        )}
      </section>
    </main>
  );
}

function EmptyState() {
  return (
    <div className="rounded-lg border border-dashed border-neutral-800 bg-neutral-950 p-8 text-center">
      <p className="text-sm text-neutral-400">
        Your watchlist is empty.
      </p>
      <Link
        href="/discover"
        className="mt-3 inline-block rounded-md bg-white px-3 py-1.5 text-sm font-medium text-black"
      >
        Find companies →
      </Link>
    </div>
  );
}
