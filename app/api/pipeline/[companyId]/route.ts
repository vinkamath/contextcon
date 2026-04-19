import { getWatchlistCompany } from "@/lib/watchlist";
import { findDecisionMakers } from "@/pipeline/decision-makers";
import { sourceCandidates } from "@/pipeline/sourcing";
import { qualifyCandidates } from "@/pipeline/qualification";
import { generateBriefs } from "@/pipeline/brief";
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

  const encoder = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: PipelineEvent) => {
        controller.enqueue(encoder.encode(JSON.stringify(event) + "\n"));
      };

      let company;
      try {
        company = await getWatchlistCompany(companyId);
      } catch (err) {
        send({
          type: "pipeline_error",
          error: err instanceof Error ? err.message : String(err),
        });
        controller.close();
        return;
      }

      if (!company) {
        send({
          type: "pipeline_error",
          error: `Company ${companyId} not on watchlist`,
        });
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

        send({ type: "stage_start", stage: "qualification" });
        const qualified = await qualifyCandidates(candidates, emit);

        send({ type: "stage_start", stage: "brief" });
        const briefs = await generateBriefs(qualified, decisionMakers, company, emit);

        send({
          type: "result",
          decision_makers: decisionMakers,
          candidates: qualified,
          briefs,
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
