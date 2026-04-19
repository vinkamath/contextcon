"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { CompanySearchResult } from "@/lib/crustdata";
import type { DiscoverEvent } from "@/lib/find-target-companies";

type SearchPhase = "idle" | "running" | "done" | "error";

type DiscoverPreset = "sf-seed" | "nyc-fintech-seed";

export default function DiscoverClient({
  initialWatchlistIds,
}: {
  initialWatchlistIds: string[];
}) {
  const router = useRouter();
  const [addedIds, setAddedIds] = useState<Set<string>>(
    () => new Set(initialWatchlistIds)
  );

  return (
    <div className="space-y-12">
      <ManualAdd
        onAdded={(id) => setAddedIds((s) => new Set(s).add(id))}
        onNavigate={() => router.refresh()}
      />

      <DiscoverPresetSection
        title="SF seed-stage, no designer"
        description="Headquarters in San Francisco, last round seed. Paginates Crustdata and skips companies with design headcount."
        preset="sf-seed"
        addedIds={addedIds}
        onAddToWatchlist={(id) =>
          setAddedIds((s) => new Set(s).add(id))
        }
      />

      <DiscoverPresetSection
        title="NYC fintech, seed, under 20 people, no designer"
        description="Financial Services industry, HQ in New York, seed stage, fewer than 20 employees, no product designer on staff."
        preset="nyc-fintech-seed"
        addedIds={addedIds}
        onAddToWatchlist={(id) =>
          setAddedIds((s) => new Set(s).add(id))
        }
      />
    </div>
  );
}

function DiscoverPresetSection({
  title,
  description,
  preset,
  addedIds,
  onAddToWatchlist,
}: {
  title: string;
  description: string;
  preset: DiscoverPreset;
  addedIds: Set<string>;
  onAddToWatchlist: (crustdataId: string) => void;
}) {
  const [phase, setPhase] = useState<SearchPhase>("idle");
  const [status, setStatus] = useState<string>("");
  const [matches, setMatches] = useState<CompanySearchResult[]>([]);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  function apply(event: DiscoverEvent) {
    switch (event.type) {
      case "start":
        setStatus(`Searching for up to ${event.limit} companies…`);
        return;
      case "page":
        setStatus(
          `Page ${event.page} · fetched ${event.fetched} · ${event.running_total} matches so far`
        );
        return;
      case "match":
        setMatches((m) => [...m, event.company]);
        return;
      case "skip":
        return;
      case "done":
        setStatus(`${event.total} companies found`);
        setPhase("done");
        return;
      case "error":
        setError(event.error);
        setPhase("error");
        return;
    }
  }

  async function runSearch() {
    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;

    setPhase("running");
    setStatus("Starting search…");
    setMatches([]);
    setError(null);

    try {
      const res = await fetch(
        `/api/discover?limit=20&preset=${encodeURIComponent(preset)}`,
        {
          method: "POST",
          signal: ac.signal,
        }
      );
      if (!res.ok) {
        const text = await res.text();
        let msg = text;
        try {
          const j = JSON.parse(text) as { error?: string };
          if (j.error) msg = j.error;
        } catch {
          /* use raw */
        }
        throw new Error(msg || `HTTP ${res.status}`);
      }
      if (!res.body) throw new Error("No response body");

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            apply(JSON.parse(line) as DiscoverEvent);
          } catch {
            /* ignore malformed line */
          }
        }
      }
      if (buffer.trim()) {
        try {
          apply(JSON.parse(buffer) as DiscoverEvent);
        } catch {
          /* ignore */
        }
      }
    } catch (err) {
      if (ac.signal.aborted) return;
      setError(err instanceof Error ? err.message : String(err));
      setPhase("error");
    }
  }

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h2 className="text-sm uppercase tracking-wider text-neutral-500">
            {title}
          </h2>
          <p className="mt-1 text-xs text-neutral-500">{description}</p>
        </div>
        <button
          type="button"
          onClick={runSearch}
          disabled={phase === "running"}
          className="rounded-md bg-white px-3 py-1.5 text-sm font-medium text-black disabled:opacity-50"
        >
          {phase === "running"
            ? "Searching…"
            : phase === "done"
              ? "Run again"
              : "Run search"}
        </button>
      </div>

      {(phase === "running" || phase === "done") && status && (
        <p className="flex items-center gap-2 text-xs text-neutral-400">
          {phase === "running" && (
            <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-blue-400" />
          )}
          {status}
        </p>
      )}

      {error && (
        <pre className="whitespace-pre-wrap rounded-md bg-red-950/40 p-3 text-xs text-red-300">
          {error}
        </pre>
      )}

      {matches.length > 0 && (
        <ul className="divide-y divide-neutral-900 overflow-hidden rounded-lg border border-neutral-800 bg-neutral-950">
          {matches.map((c) => (
            <MatchRow
              key={c.crustdata_company_id}
              company={c}
              added={addedIds.has(String(c.crustdata_company_id))}
              onAdd={() => onAddToWatchlist(String(c.crustdata_company_id))}
            />
          ))}
        </ul>
      )}
    </section>
  );
}

function MatchRow({
  company,
  added,
  onAdd,
}: {
  company: CompanySearchResult;
  added: boolean;
  onAdd: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const id = String(company.crustdata_company_id);
  const name = company.basic_info?.name ?? `#${id}`;
  const domain = company.basic_info?.primary_domain;
  const headcount = company.headcount?.total;
  const industry = company.taxonomy?.professional_network_industry;
  const funded = company.funding?.last_fundraise_date?.slice(0, 10);

  async function addNow() {
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch("/api/watchlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          crustdata_id: id,
          name,
          domain: domain ?? null,
          funding_stage: company.funding?.last_round_type ?? null,
          headcount: headcount ?? null,
        }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error ?? `HTTP ${res.status}`);
      }
      onAdd();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <li className="flex items-start justify-between gap-4 px-4 py-3 text-sm">
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2">
          <span className="font-medium">{name}</span>
          {domain && (
            <span className="text-xs text-neutral-500">{domain}</span>
          )}
        </div>
        <div className="mt-0.5 flex flex-wrap gap-x-2 text-xs text-neutral-500">
          {industry && <span>{industry}</span>}
          {headcount != null && <span>· {headcount} people</span>}
          {funded && <span>· seed {funded}</span>}
        </div>
        {err && <div className="mt-1 text-xs text-red-400">{err}</div>}
      </div>
      <button
        onClick={addNow}
        disabled={busy || added}
        className={`shrink-0 rounded-md px-2.5 py-1 text-xs font-medium ${
          added
            ? "bg-emerald-950/60 text-emerald-300"
            : "bg-white text-black disabled:opacity-50"
        }`}
      >
        {added ? "On watchlist" : busy ? "Adding…" : "Add"}
      </button>
    </li>
  );
}

function ManualAdd({
  onAdded,
  onNavigate,
}: {
  onAdded: (id: string) => void;
  onNavigate: () => void;
}) {
  const [domain, setDomain] = useState("");
  const [isPending, startTransition] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const [lastAdded, setLastAdded] = useState<string | null>(null);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const value = domain.trim();
    if (!value) return;

    startTransition(async () => {
      setErr(null);
      try {
        const res = await fetch("/api/watchlist", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ domain: value }),
        });
        const body = (await res.json().catch(() => ({}))) as {
          ok?: boolean;
          company?: { id: string; name: string };
          error?: string;
        };
        if (!res.ok || !body.ok || !body.company) {
          throw new Error(body.error ?? `HTTP ${res.status}`);
        }
        onAdded(body.company.id);
        setLastAdded(body.company.name);
        setDomain("");
        onNavigate();
      } catch (e) {
        setErr(e instanceof Error ? e.message : String(e));
      }
    });
  }

  return (
    <section className="rounded-lg border border-neutral-800 bg-neutral-950 p-5">
      <h2 className="text-sm uppercase tracking-wider text-neutral-500">
        Add by domain
      </h2>
      <form onSubmit={submit} className="mt-3 flex gap-2">
        <input
          type="text"
          value={domain}
          onChange={(e) => setDomain(e.target.value)}
          placeholder="e.g. crustdata.com"
          disabled={isPending}
          className="flex-1 rounded-md border border-neutral-800 bg-neutral-900 px-3 py-1.5 text-sm text-neutral-100 placeholder-neutral-600 focus:border-neutral-600 focus:outline-none disabled:opacity-50"
        />
        <button
          type="submit"
          disabled={isPending || !domain.trim()}
          className="rounded-md bg-white px-3 py-1.5 text-sm font-medium text-black disabled:opacity-50"
        >
          {isPending ? "Adding…" : "Add"}
        </button>
      </form>
      {err && <p className="mt-2 text-xs text-red-400">{err}</p>}
      {lastAdded && !err && (
        <p className="mt-2 text-xs text-emerald-400">
          Added {lastAdded} to watchlist.
        </p>
      )}
    </section>
  );
}
