import Link from "next/link";
import {
  getDashboardData,
  getRecentResponses,
} from "@/lib/dashboard-data";
import DashboardCompanies from "./companies";

export const dynamic = "force-dynamic";

function formatPct(rate: number | null): string {
  if (rate == null) return "—";
  return `${Math.round(rate * 100)}%`;
}

function KpiCard({
  label,
  value,
  sub,
}: {
  label: string;
  value: string | number;
  sub?: string;
}) {
  return (
    <div className="rounded-lg border border-neutral-800 bg-neutral-950 px-4 py-4">
      <p className="text-[10px] font-medium uppercase tracking-wider text-neutral-500">
        {label}
      </p>
      <p className="mt-2 text-2xl font-semibold tabular-nums text-neutral-100">
        {value}
      </p>
      {sub && <p className="mt-1 text-xs text-neutral-500">{sub}</p>}
    </div>
  );
}

export default async function DashboardPage() {
  const { overview, companies } = await getDashboardData();
  const recent = getRecentResponses(companies, 3);

  return (
    <main className="mx-auto max-w-5xl px-6 py-16">
      <header className="mb-10 flex flex-wrap items-start justify-between gap-6">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Dashboard</h1>
          <p className="mt-2 text-sm text-neutral-400">
            Simulated email opens and replies across your watchlist (per decision
            maker).
          </p>
        </div>
        <Link
          href="/"
          className="rounded-md border border-neutral-800 bg-neutral-950 px-3 py-1.5 text-sm text-neutral-200 hover:border-neutral-700 hover:text-white"
        >
          ← Watchlist
        </Link>
      </header>

      <section className="mb-10 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiCard label="Emails sent" value={overview.sent} />
        <KpiCard label="Delivered" value={overview.delivered} />
        <KpiCard
          label="Open rate"
          value={formatPct(overview.open_rate)}
          sub={
            overview.delivered > 0
              ? `${overview.opened} opened / ${overview.delivered} delivered`
              : overview.sent === 0
              ? "No sends yet"
              : "No delivered (all bounced)"
          }
        />
        <KpiCard
          label="Response rate"
          value={formatPct(overview.response_rate)}
          sub={
            overview.delivered > 0
              ? `${overview.replied} replies / ${overview.delivered} delivered`
              : overview.sent === 0
              ? "No sends yet"
              : "—"
          }
        />
      </section>

      {recent.length > 0 && (
        <section className="mb-10">
          <h2 className="mb-3 text-sm uppercase tracking-wider text-neutral-500">
            Recent responses
          </h2>
          <ul className="divide-y divide-neutral-900 rounded-lg border border-neutral-800 bg-neutral-950">
            {recent.map((r, i) => (
              <li key={`${r.company_id}-${r.replied_at}-${r.dm_name}-${i}`} className="px-4 py-3">
                <p className="text-sm font-medium text-neutral-200">
                  {r.company_name}
                  <span className="font-normal text-neutral-500">
                    {" "}
                    · {r.dm_name}
                  </span>
                </p>
                <p className="mt-1 text-sm text-neutral-400">{r.preview}</p>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section>
        <h2 className="mb-4 text-sm uppercase tracking-wider text-neutral-500">
          By company ({overview.total_companies})
        </h2>
        <DashboardCompanies rows={companies} />
      </section>
    </main>
  );
}
