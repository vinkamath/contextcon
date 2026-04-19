import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

export async function GET() {
  try {
    const { data, error } = await supabase()
      .from("companies")
      .select("id, name, domain, funding_stage, headcount, on_watchlist")
      .eq("on_watchlist", true);
    if (error) throw error;
    return NextResponse.json({ ok: true, rows: data });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
