import { NextResponse } from "next/server";
import { DEMO_COMPANIES } from "@/lib/demo-companies";
import { findDecisionMakers } from "@/pipeline/decision-makers";
import { sourceCandidates } from "@/pipeline/sourcing";

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ companyId: string }> }
) {
  const { companyId } = await params;
  const company = DEMO_COMPANIES.find((c) => c.id === companyId);
  if (!company) {
    return NextResponse.json({ error: "unknown company" }, { status: 404 });
  }

  try {
    const decisionMakers = await findDecisionMakers(company);
    const candidates = await sourceCandidates(company);
    // TODO: Stage 3 — portfolio qualification
    // TODO: Stage 4 — brief generation
    return NextResponse.json({
      status: "ok",
      company: { id: company.id, name: company.name },
      decision_makers: decisionMakers,
      candidates,
    });
  } catch (err) {
    return NextResponse.json(
      {
        status: "error",
        error: err instanceof Error ? err.message : String(err),
      },
      { status: 500 }
    );
  }
}
