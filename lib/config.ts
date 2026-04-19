import config from "@/config.json";

export type CacheKind = "company" | "person";

export function cacheTtlDays(kind: CacheKind): number {
  return config.cache_ttl_days[kind] ?? 30;
}

export function cacheCutoffIso(kind: CacheKind): string {
  const ms = cacheTtlDays(kind) * 24 * 60 * 60 * 1000;
  return new Date(Date.now() - ms).toISOString();
}
