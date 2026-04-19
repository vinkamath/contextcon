"use client";

import { useState } from "react";
import type { DemoCompany } from "@/lib/demo-companies";
import type { DecisionMaker } from "@/lib/types";

type PipelineResult =
  | {
      status: "ok";
      company: { id: string; name: string };
      decision_makers: DecisionMaker[];
    }
  | { status: "error"; error: string };

export default function CompanyCard({ company }: { company: DemoCompany }) {
  const [state, setState] = useState<"idle" | "running" | "done" | "error">("idle");
  const [result, setResult] = useState<PipelineResult | null>(null);

  async function runPipeline() {
    setState("running");
    setResult(null);
    try {
      const res = await fetch(`/api/pipeline/${company.id}`, { method: "POST" });
      const data = (await res.json()) as PipelineResult;
      setResult(data);
      setState(data.status === "ok" ? "done" : "error");
    } catch (err) {
      setResult({
        status: "error",
        error: err instanceof Error ? err.message : String(err),
      });
      setState("error");
    }
  }

  return (
    <article className="rounded-lg border border-neutral-800 bg-neutral-950 p-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="text-lg font-medium">{company.name}</h3>
          <p className="text-sm text-neutral-400">
            {company.domain} · {company.funding_stage} · {company.headcount} people
          </p>
        </div>
        <button
          onClick={runPipeline}
          disabled={state === "running"}
          className="rounded-md bg-white px-3 py-1.5 text-sm font-medium text-black disabled:opacity-50"
        >
          {state === "running" ? "Running…" : "Run pipeline"}
        </button>
      </div>

      {result?.status === "ok" && (
        <div className="mt-5">
          <h4 className="text-xs uppercase tracking-wider text-neutral-500">
            Decision makers ({result.decision_makers.length})
          </h4>
          {result.decision_makers.length === 0 ? (
            <p className="mt-2 text-sm text-neutral-400">
              No C-level matches found.
            </p>
          ) : (
            <ul className="mt-2 space-y-2">
              {result.decision_makers.map((dm) => (
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
                      <div className="truncate text-xs text-neutral-500">
                        {dm.email}
                      </div>
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
        </div>
      )}

      {result?.status === "error" && (
        <pre className="mt-4 whitespace-pre-wrap rounded-md bg-red-950/40 p-3 text-xs text-red-300">
          {result.error}
        </pre>
      )}
    </article>
  );
}
