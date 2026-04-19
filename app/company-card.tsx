"use client";

import { useState } from "react";
import type { DemoCompany } from "@/lib/demo-companies";

type PipelineResult = {
  status: "ok" | "stub";
  brief?: string;
  message?: string;
};

export default function CompanyCard({ company }: { company: DemoCompany }) {
  const [state, setState] = useState<"idle" | "running" | "done" | "error">("idle");
  const [result, setResult] = useState<PipelineResult | null>(null);

  async function runPipeline() {
    setState("running");
    setResult(null);
    try {
      const res = await fetch(`/api/pipeline/${company.id}`, { method: "POST" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setResult(await res.json());
      setState("done");
    } catch {
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

      {result && (
        <pre className="mt-4 whitespace-pre-wrap rounded-md bg-neutral-900 p-4 text-sm text-neutral-300">
          {result.brief ?? result.message ?? JSON.stringify(result, null, 2)}
        </pre>
      )}
      {state === "error" && (
        <p className="mt-4 text-sm text-red-400">Pipeline run failed.</p>
      )}
    </article>
  );
}
