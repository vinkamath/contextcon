import {
  findNYCSeedFintechSmallWithoutDesigner,
  findSFSeedCompaniesWithoutDesigner,
  type DiscoverEvent,
} from "@/lib/find-target-companies";

const PRESETS = {
  "sf-seed": findSFSeedCompaniesWithoutDesigner,
  "nyc-fintech-seed": findNYCSeedFintechSmallWithoutDesigner,
} as const;

type PresetKey = keyof typeof PRESETS;

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const url = new URL(req.url);
  const limit = Math.min(
    Math.max(parseInt(url.searchParams.get("limit") ?? "20", 10) || 20, 1),
    100
  );

  const presetRaw = url.searchParams.get("preset") ?? "sf-seed";
  if (!(presetRaw in PRESETS)) {
    return new Response(
      JSON.stringify({
        error: `Unknown preset "${presetRaw}". Use: ${Object.keys(PRESETS).join(", ")}`,
      }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );
  }
  const preset = presetRaw as PresetKey;
  const runSearch = PRESETS[preset];

  const encoder = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: DiscoverEvent) => {
        controller.enqueue(encoder.encode(JSON.stringify(event) + "\n"));
      };

      try {
        await runSearch(limit, send);
      } catch (err) {
        send({
          type: "error",
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
