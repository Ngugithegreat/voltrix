// Tiny per-instance cache for the admin dashboard payload. The dashboard runs
// several heavy aggregate queries; caching the assembled result for a few
// seconds makes repeated loads/refreshes instant and caps how often the heavy
// queries run (at most once per TTL per serverless instance). Any admin action
// busts it so changes show immediately.

let _entry: { at: number; data: unknown } | null = null;
const TTL_MS = 10_000;

export function getAdminCache<T = unknown>(): T | null {
  if (_entry && Date.now() - _entry.at < TTL_MS) return _entry.data as T;
  return null;
}

export function setAdminCache(data: unknown): void {
  _entry = { at: Date.now(), data };
}

export function bustAdminCache(): void {
  _entry = null;
}
