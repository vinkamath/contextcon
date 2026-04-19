import { NextResponse } from "next/server";
import { DEMO_COMPANIES } from "@/lib/demo-companies";
import { supabase } from "@/lib/supabase";

export async function GET() {
  try {
    const rows = DEMO_COMPANIES.map((c) => ({ ...c, on_watchlist: true }));
    const { error: upsertError } = await supabase()
      .from("companies")
      .upsert(rows, { onConflict: "id" });
    if (upsertError) throw upsertError;

    const { data, error: selectError } = await supabase()
      .from("companies")
      .select("id, name, domain, funding_stage, headcount, on_watchlist")
      .in(
        "id",
        DEMO_COMPANIES.map((c) => c.id)
      );
    if (selectError) throw selectError;

    return NextResponse.json({ ok: true, rows: data });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
