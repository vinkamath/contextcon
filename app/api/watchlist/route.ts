import { NextResponse } from "next/server";
import {
  addCompanyByCrustdataId,
  addCompanyByDomain,
  removeFromWatchlist,
} from "@/lib/watchlist";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type AddBody =
  | { domain: string }
  | {
      crustdata_id: string;
      name: string;
      domain?: string | null;
      funding_stage?: string | null;
      headcount?: number | null;
    };

export async function POST(req: Request) {
  let body: AddBody;
  try {
    body = (await req.json()) as AddBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  try {
    if ("crustdata_id" in body) {
      const company = await addCompanyByCrustdataId(body.crustdata_id, {
        name: body.name,
        domain: body.domain ?? null,
        funding_stage: body.funding_stage ?? null,
        headcount: body.headcount ?? null,
      });
      return NextResponse.json({ ok: true, company });
    }
    if ("domain" in body && body.domain) {
      const company = await addCompanyByDomain(body.domain);
      return NextResponse.json({ ok: true, company });
    }
    return NextResponse.json(
      { error: "Provide `domain` or `crustdata_id`" },
      { status: 400 }
    );
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}

export async function DELETE(req: Request) {
  const url = new URL(req.url);
  const id = url.searchParams.get("id");
  if (!id) {
    return NextResponse.json({ error: "Missing `id`" }, { status: 400 });
  }
  try {
    await removeFromWatchlist(id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
