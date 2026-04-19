"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { WatchlistCompany } from "@/lib/watchlist";
import type { Candidate, DecisionMaker } from "@/lib/types";
import {
  STAGES,
  type PipelineEvent,
  type StageId,
} from "@/lib/pipeline-events";

type StageStatus = "pending" | "running" | "done" | "skipped" | "error";

type StageState = {
  status: StageStatus;
  cache: "hit" | "miss" | null;
  cacheDetail: string | null;
  logs: string[];
  summary: string | null;
  error: string | null;
};

type PipelinePhase = "idle" | "running" | "done" | "error";

const initialStages = (): Record<StageId, StageState> => ({
  decision_makers: emptyStage(),
  sourcing: emptyStage(),
  qualification: emptyStage(),
  brief: emptyStage(),
});

function emptyStage(): StageState {
  return {
    status: "pending",
    cache: null,
    cacheDetail: null,
    logs: [],
    summary: null,
    error: null,
  };
}

export default function CompanyCard({ company }: { company: WatchlistCompany }) {
  const router = useRouter();
  const [phase, setPhase] = useState<PipelinePhase>("idle");
  const [stages, setStages] = useState<Record<StageId, StageState>>(initialStages);
  const [activeStage, setActiveStage] = useState<StageId | null>(null);
  const [decisionMakers, setDecisionMakers] = useState<DecisionMaker[]>([]);
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [fatalError, setFatalError] = useState<string | null>(null);
  const [isRemoving, startRemove] = useTransition();
  const abortRef = useRef<AbortController | null>(null);

  function handleRemove() {
    if (!confirm(`Remove ${company.name} from watchlist?`)) return;
    startRemove(async () => {
      const res = await fetch(`/api/watchlist?id=${encodeURIComponent(company.id)}`, {
        method: "DELETE",
      });
      if (res.ok) router.refresh();
    });
  }

  function apply(event: PipelineEvent) {
    switch (event.type) {
      case "pipeline_start":
        return;
      case "stage_start":
        setActiveStage(event.stage);
        setStages((s) => ({
          ...s,
          [event.stage]: { ...s[event.stage], status: "running" },
        }));
        return;
      case "log":
        setStages((s) => ({
          ...s,
          [event.stage]: {
            ...s[event.stage],
            logs: [...s[event.stage].logs, event.message].slice(-50),
          },
        }));
        return;
      case "cache":
        setStages((s) => ({
          ...s,
          [event.stage]: {
            ...s[event.stage],
            cache: event.hit ? "hit" : "miss",
            cacheDetail: event.detail,
            logs: [...s[event.stage].logs, event.detail].slice(-50),
          },
        }));
        return;
      case "stage_done":
        setStages((s) => ({
          ...s,
          [event.stage]: {
            ...s[event.stage],
            status: "done",
            summary: event.summary,
          },
        }));
        return;
      case "stage_skipped":
        setStages((s) => ({
          ...s,
          [event.stage]: {
            ...s[event.stage],
            status: "skipped",
            summary: event.reason,
          },
        }));
        return;
      case "stage_error":
        setStages((s) => ({
          ...s,
          [event.stage]: {
            ...s[event.stage],
            status: "error",
            error: event.error,
          },
        }));
        return;
      case "result":
        setDecisionMakers(event.decision_makers);
        setCandidates(event.candidates);
        return;
      case "pipeline_done":
        setActiveStage(null);
        setPhase("done");
        return;
      case "pipeline_error":
        setActiveStage(null);
        setFatalError(event.error);
        setPhase("error");
        return;
    }
  }

  async function runPipeline() {
    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;

    setPhase("running");
    setStages(initialStages());
    setActiveStage(null);
    setDecisionMakers([]);
    setCandidates([]);
    setFatalError(null);

    try {
      const res = await fetch(`/api/pipeline/${company.id}`, {
        method: "POST",
        signal: ac.signal,
      });
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
            apply(JSON.parse(line) as PipelineEvent);
          } catch (err) {
            console.error("bad pipeline event:", line, err);
          }
        }
      }
      if (buffer.trim()) {
        try {
          apply(JSON.parse(buffer) as PipelineEvent);
        } catch {
          /* ignore */
        }
      }
    } catch (err) {
      if (ac.signal.aborted) return;
      setFatalError(err instanceof Error ? err.message : String(err));
      setPhase("error");
    }
  }

  const runLabel =
    phase === "running"
      ? "Running…"
      : phase === "done"
      ? "Run again"
      : phase === "error"
      ? "Retry"
      : "Run pipeline";

  return (
    <article className="rounded-lg border border-neutral-800 bg-neutral-950">
      <header className="flex items-start justify-between gap-4 border-b border-neutral-900 px-5 py-4">
        <div>
          <h3 className="text-lg font-medium">{company.name}</h3>
          <p className="text-sm text-neutral-400">
            {[
              company.domain,
              company.funding_stage,
              company.headcount != null ? `${company.headcount} people` : null,
            ]
              .filter(Boolean)
              .join(" · ")}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleRemove}
            disabled={isRemoving || phase === "running"}
            className="rounded-md border border-neutral-800 px-2.5 py-1.5 text-xs text-neutral-400 hover:border-neutral-700 hover:text-neutral-200 disabled:opacity-50"
          >
            {isRemoving ? "Removing…" : "Remove"}
          </button>
          <button
            onClick={runPipeline}
            disabled={phase === "running"}
            className="rounded-md bg-white px-3 py-1.5 text-sm font-medium text-black disabled:opacity-50"
          >
            {runLabel}
          </button>
        </div>
      </header>

      {(phase !== "idle" || activeStage) && (
        <StageStrip stages={stages} activeStage={activeStage} />
      )}

      {fatalError && (
        <pre className="mx-5 mb-5 whitespace-pre-wrap rounded-md bg-red-950/40 p-3 text-xs text-red-300">
          {fatalError}
        </pre>
      )}

      {phase === "done" && (
        <Results decisionMakers={decisionMakers} candidates={candidates} />
      )}
    </article>
  );
}

function StageStrip({
  stages,
  activeStage,
}: {
  stages: Record<StageId, StageState>;
  activeStage: StageId | null;
}) {
  return (
    <div className="px-5 py-5">
      <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
        {STAGES.map((s, idx) => (
          <StageCard
            key={s.id}
            index={idx}
            id={s.id}
            label={s.label}
            state={stages[s.id]}
            isActive={activeStage === s.id}
          />
        ))}
      </div>
    </div>
  );
}

function StageCard({
  index,
  id,
  label,
  state,
  isActive,
}: {
  index: number;
  id: StageId;
  label: string;
  state: StageState;
  isActive: boolean;
}) {
  const { status, cache, logs, summary, error } = state;
  const lastLog = logs[logs.length - 1];

  const border =
    status === "running"
      ? "border-blue-500/60"
      : status === "done"
      ? "border-emerald-600/40"
      : status === "error"
      ? "border-red-500/50"
      : status === "skipped"
      ? "border-neutral-800"
      : "border-neutral-800";

  const headerColor =
    status === "running"
      ? "text-blue-300"
      : status === "done"
      ? "text-emerald-300"
      : status === "error"
      ? "text-red-300"
      : status === "skipped"
      ? "text-neutral-500"
      : "text-neutral-400";

  return (
    <div
      className={`relative flex min-h-[180px] flex-col rounded-md border bg-neutral-900/40 p-3 ${border} ${
        isActive ? "ring-1 ring-blue-500/40" : ""
      }`}
    >
      <div className="mb-2 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <StageIndex index={index + 1} status={status} />
          <span className={`text-xs font-medium uppercase tracking-wider ${headerColor}`}>
            {label}
          </span>
        </div>
        {cache && status !== "pending" && (
          <span
            className={`rounded-full px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wider ${
              cache === "hit"
                ? "bg-emerald-950/60 text-emerald-300"
                : "bg-amber-950/60 text-amber-300"
            }`}
          >
            {cache === "hit" ? "cached" : "live"}
          </span>
        )}
      </div>

      <div className="flex-1 text-xs text-neutral-300">
        {status === "pending" && (
          <p className="text-neutral-600">
            {id === "qualification" || id === "brief"
              ? "Not yet implemented"
              : "Waiting…"}
          </p>
        )}
        {status === "running" && (
          <div className="space-y-1">
            {lastLog ? (
              <p className="text-neutral-300">
                <span className="mr-1 inline-block animate-pulse text-blue-400">●</span>
                {lastLog}
              </p>
            ) : (
              <p className="text-neutral-500">Starting…</p>
            )}
            {logs.length > 1 && (
              <details className="mt-2">
                <summary className="cursor-pointer text-[10px] uppercase tracking-wider text-neutral-500 hover:text-neutral-300">
                  {logs.length} events
                </summary>
                <ul className="mt-1 max-h-32 space-y-0.5 overflow-y-auto text-[11px] text-neutral-500">
                  {logs.slice().reverse().map((l, i) => (
                    <li key={i}>{l}</li>
                  ))}
                </ul>
              </details>
            )}
          </div>
        )}
        {status === "done" && (
          <div className="space-y-1">
            <p className="text-emerald-300">{summary ?? "Done"}</p>
            {logs.length > 0 && (
              <details>
                <summary className="cursor-pointer text-[10px] uppercase tracking-wider text-neutral-500 hover:text-neutral-300">
                  {logs.length} events
                </summary>
                <ul className="mt-1 max-h-32 space-y-0.5 overflow-y-auto text-[11px] text-neutral-500">
                  {logs.slice().reverse().map((l, i) => (
                    <li key={i}>{l}</li>
                  ))}
                </ul>
              </details>
            )}
          </div>
        )}
        {status === "skipped" && (
          <p className="text-neutral-500">{summary ?? "Skipped"}</p>
        )}
        {status === "error" && (
          <p className="text-red-300">{error ?? "Failed"}</p>
        )}
      </div>
    </div>
  );
}

function StageIndex({ index, status }: { index: number; status: StageStatus }) {
  const base =
    "flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-semibold";
  if (status === "done")
    return <span className={`${base} bg-emerald-600/30 text-emerald-300`}>✓</span>;
  if (status === "running")
    return (
      <span className={`${base} bg-blue-600/30 text-blue-300`}>
        <span className="h-2 w-2 animate-pulse rounded-full bg-blue-400" />
      </span>
    );
  if (status === "error")
    return <span className={`${base} bg-red-600/30 text-red-300`}>!</span>;
  if (status === "skipped")
    return <span className={`${base} bg-neutral-800 text-neutral-500`}>–</span>;
  return <span className={`${base} bg-neutral-800 text-neutral-500`}>{index}</span>;
}

function Results({
  decisionMakers,
  candidates,
}: {
  decisionMakers: DecisionMaker[];
  candidates: Candidate[];
}) {
  return (
    <div className="space-y-6 border-t border-neutral-900 px-5 py-5">
      <section>
        <h4 className="text-xs uppercase tracking-wider text-neutral-500">
          Decision makers ({decisionMakers.length})
        </h4>
        {decisionMakers.length === 0 ? (
          <p className="mt-2 text-sm text-neutral-400">No C-level matches found.</p>
        ) : (
          <ul className="mt-2 space-y-2">
            {decisionMakers.map((dm) => (
              <li
                key={dm.id}
                className="flex items-baseline justify-between gap-3 text-sm"
              >
                <div className="min-w-0 flex-1">
                  <div>
                    <span className="font-medium">{dm.name}</span>
                    {dm.title && (
                      <span className="ml-2 text-neutral-400">{dm.title}</span>
                    )}
                  </div>
                  {dm.email && (
                    <div className="truncate text-xs text-neutral-500">{dm.email}</div>
                  )}
                </div>
                {dm.linkedin_url && (
                  <a
                    href={dm.linkedin_url}
                    target="_blank"
                    rel="noreferrer"
                    className="shrink-0 text-xs text-neutral-500 hover:text-neutral-300"
                  >
                    LinkedIn ↗
                  </a>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h4 className="text-xs uppercase tracking-wider text-neutral-500">
          Candidates ({candidates.length})
        </h4>
        {candidates.length === 0 ? (
          <p className="mt-2 text-sm text-neutral-400">
            No candidates sourced.
          </p>
        ) : (
          <ul className="mt-2 space-y-2">
            {candidates.slice(0, 10).map((c) => (
              <li
                key={c.id}
                className="flex items-baseline justify-between gap-3 text-sm"
              >
                <div className="min-w-0 flex-1">
                  <div>
                    <span className="font-medium">{c.name}</span>
                    {c.current_title && (
                      <span className="ml-2 text-neutral-400">
                        {c.current_title}
                      </span>
                    )}
                  </div>
                  {(c.current_company || c.location) && (
                    <div className="truncate text-xs text-neutral-500">
                      {c.current_company}
                      {c.current_company && c.location ? " · " : ""}
                      {c.location}
                    </div>
                  )}
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  {c.linkedin_url && (
                    <a
                      href={c.linkedin_url}
                      target="_blank"
                      rel="noreferrer"
                      className="text-xs text-neutral-500 hover:text-neutral-300"
                    >
                      LinkedIn ↗
                    </a>
                  )}
                  {c.websites?.slice(0, 2).map((url) => (
                    <a
                      key={url}
                      href={url}
                      target="_blank"
                      rel="noreferrer"
                      className="max-w-[120px] truncate text-xs text-neutral-500 hover:text-neutral-300"
                      title={url}
                    >
                      {new URL(url).hostname.replace(/^www\./, "")} ↗
                    </a>
                  ))}
                </div>
              </li>
            ))}
            {candidates.length > 10 && (
              <li className="text-xs text-neutral-500">
                … and {candidates.length - 10} more
              </li>
            )}
          </ul>
        )}
      </section>
    </div>
  );
}
