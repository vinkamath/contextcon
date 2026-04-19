import { NextResponse } from "next/server";
import { DEMO_COMPANIES } from "@/lib/demo-companies";

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ companyId: string }> }
) {
  const { companyId } = await params;
  const company = DEMO_COMPANIES.find((c) => c.id === companyId);
  if (!company) {
    return NextResponse.json({ error: "unknown company" }, { status: 404 });
  }

  // TODO: Stage 1 — decision makers
  // TODO: Stage 2 — candidate sourcing
  // TODO: Stage 3 — portfolio qualification
  // TODO: Stage 4 — brief generation

  return NextResponse.json({
    status: "stub",
    message: `Pipeline stub for ${company.name}. Wire up Stages 1–4 next.`,
  });
}
