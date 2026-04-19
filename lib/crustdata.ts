const BASE_URL = "https://api.crustdata.com";
const API_VERSION = "2025-11-01";

function headers() {
  const key = process.env.CRUSTDATA_API_KEY;
  if (!key) throw new Error("CRUSTDATA_API_KEY not set");
  return {
    Authorization: `Bearer ${key}`,
    "x-api-version": API_VERSION,
    "Content-Type": "application/json",
  };
}

async function post<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    throw new Error(`Crustdata ${path} ${res.status}: ${await res.text()}`);
  }
  return res.json() as Promise<T>;
}

// Thin typed stubs — fill in request/response shapes as stages get wired up.
export const crustdata = {
  companySearch: (body: unknown) => post<unknown>("/company/search", body),
  companyEnrich: (body: unknown) => post<unknown>("/company/enrich", body),
  personSearch: (body: unknown) => post<unknown>("/person/search", body),
  personEnrich: (body: unknown) => post<unknown>("/person/enrich", body),
  jobSearch: (body: unknown) => post<unknown>("/job/search", body),
  webSearchLive: (body: unknown) => post<unknown>("/web/search/live", body),
  webEnrichLive: (body: unknown) => post<unknown>("/web/enrich/live", body),
};
