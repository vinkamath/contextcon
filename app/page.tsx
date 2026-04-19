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
          <p className="mt-3 text-neutral-400">
            Pre-A startups hiring engineers without designers. We find the founding
            designers worth meeting.
          </p>
        </div>
        <Link
          href="/discover"
          className="rounded-md border border-neutral-800 bg-neutral-950 px-3 py-1.5 text-sm font-medium text-neutral-200 hover:border-neutral-700 hover:text-white"
        >
          Discover companies →
        </Link>
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
