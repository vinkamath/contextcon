import { DEMO_COMPANIES } from "@/lib/demo-companies";
import CompanyCard from "./company-card";

export default function Home() {
  return (
    <main className="mx-auto max-w-5xl px-6 py-16">
      <header className="mb-12">
        <h1 className="text-4xl font-semibold tracking-tight">Riffle</h1>
        <p className="mt-3 text-neutral-400">
          Pre-A startups hiring engineers without designers. We find the founding
          designers worth meeting.
        </p>
      </header>

      <section className="space-y-4">
        <h2 className="text-sm uppercase tracking-wider text-neutral-500">
          Watchlist
        </h2>
        {DEMO_COMPANIES.map((company) => (
          <CompanyCard key={company.id} company={company} />
        ))}
      </section>
    </main>
  );
}
