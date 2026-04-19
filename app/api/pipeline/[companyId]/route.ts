import { DEMO_COMPANIES } from "@/lib/demo-companies";
import { findDecisionMakers } from "@/pipeline/decision-makers";
import { sourceCandidates } from "@/pipeline/sourcing";
import type {
  PipelineEvent,
  PipelineEmitter,
} from "@/lib/pipeline-events";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ companyId: string }> }
) {
  const { companyId } = await params;
  const company = DEMO_COMPANIES.find((c) => c.id === companyId);

  const encoder = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: PipelineEvent) => {
        controller.enqueue(encoder.encode(JSON.stringify(event) + "\n"));
      };

      if (!company) {
        send({ type: "pipeline_error", error: `Unknown company: ${companyId}` });
        controller.close();
        return;
      }

      const emit: PipelineEmitter = send;

      try {
        send({
          type: "pipeline_start",
          company: { id: company.id, name: company.name },
        });

        send({ type: "stage_start", stage: "decision_makers" });
        const decisionMakers = await findDecisionMakers(company, emit);

        send({ type: "stage_start", stage: "sourcing" });
        const candidates = await sourceCandidates(company, emit);

        send({
          type: "stage_skipped",
          stage: "qualification",
          reason: "Stage 3 not yet implemented",
        });
        send({
          type: "stage_skipped",
          stage: "brief",
          reason: "Stage 4 not yet implemented",
        });

        send({
          type: "result",
          decision_makers: decisionMakers,
          candidates,
        });
        send({ type: "pipeline_done" });
      } catch (err) {
        send({
          type: "pipeline_error",
          error: err instanceof Error ? err.message : String(err),
        });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      "X-Accel-Buffering": "no",
    },
  });
}
