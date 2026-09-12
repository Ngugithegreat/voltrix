import { db, ensureSchema } from "@/lib/db";

// Runtime, admin-tunable settings kept in the voltrix_settings key/value table.

// Per-instance cache for setting READS. Settings change rarely but are read on
// every trade/withdraw (house edge, limits, test mode…). Caching them for a few
// seconds turns ~6 DB round-trips per trade into ~0 under load, which is a big
// part of surviving a traffic spike. Writes refresh the entry immediately on the
// instance that made the change; other instances pick it up within the TTL.
const SETTING_TTL_MS = 15_000;
const _settingCache = new Map<string, { value: string | null; exp: number }>();

async function rawSetting(key: string): Promise<string | null> {
  const now = Date.now();
  const hit = _settingCache.get(key);
  if (hit && hit.exp > now) return hit.value;
  await ensureSchema();
  const sql = db();
  const rows = (await sql`SELECT value FROM voltrix_settings WHERE key = ${key} LIMIT 1`) as Array<{ value: string }>;
  const value = rows.length ? rows[0].value : null;
  _settingCache.set(key, { value, exp: now + SETTING_TTL_MS });
  return value;
}

function cacheSetting(key: string, value: string): void {
  _settingCache.set(key, { value, exp: Date.now() + SETTING_TTL_MS });
}

export const DEFAULT_HOUSE_EDGE = 0.05; // 5%
// Edge is uncapped for testing (0–100%). A separate payout floor (MIN_PAYOUT_MULT
// in markets.ts) still guarantees a winner is paid more than the stake, so even a
// 100% margin never shows a broken $0 win — payouts just hit that floor.
export const MAX_HOUSE_EDGE = 1;
const HOUSE_EDGE_KEY = "house_edge";

/** The current house edge as a fraction (0.05 = 5%). Falls back to the default. */
export async function getHouseEdge(): Promise<number> {
  const raw = await rawSetting(HOUSE_EDGE_KEY);
  const v = raw != null ? Number(raw) : NaN;
  return Number.isFinite(v) && v >= 0 && v <= MAX_HOUSE_EDGE ? v : DEFAULT_HOUSE_EDGE;
}

/** Set the house edge (fraction). Clamped to a sane 0–15% range. */
export async function setHouseEdge(edge: number): Promise<number> {
  await ensureSchema();
  const sql = db();
  const clamped = Math.min(MAX_HOUSE_EDGE, Math.max(0, Number(edge) || 0));
  await sql`
    INSERT INTO voltrix_settings (key, value, updated_at)
    VALUES (${HOUSE_EDGE_KEY}, ${String(clamped)}, now())
    ON CONFLICT (key) DO UPDATE SET value = ${String(clamped)}, updated_at = now()
  `;
  cacheSetting(HOUSE_EDGE_KEY, String(clamped));
  return clamped;
}

// ---- Risk / exposure limits (protect the house bankroll from variance) ----
export const DEFAULT_MAX_STAKE_CENTS = 50000; // $500 max per trade
export const DEFAULT_MAX_PAYOUT_CENTS = 200000; // $2,000 max win per trade

async function getIntSetting(key: string, def: number, min: number, max: number): Promise<number> {
  const raw = await rawSetting(key);
  const v = raw != null ? Math.round(Number(raw)) : NaN;
  return Number.isFinite(v) && v >= min && v <= max ? v : def;
}
async function setIntSetting(key: string, val: number, min: number, max: number): Promise<number> {
  await ensureSchema();
  const sql = db();
  const clamped = Math.min(max, Math.max(min, Math.round(Number(val) || 0)));
  await sql`
    INSERT INTO voltrix_settings (key, value, updated_at)
    VALUES (${key}, ${String(clamped)}, now())
    ON CONFLICT (key) DO UPDATE SET value = ${String(clamped)}, updated_at = now()
  `;
  cacheSetting(key, String(clamped));
  return clamped;
}

// Global test mode: puts the WHOLE system on simulated data with outcomes rolled
// at an admin-set win %. Every logged-in user tests without being whitelisted.
// Turn OFF before going live.
export const getGlobalTest = async () => (await getIntSetting("global_test", 0, 0, 1)) === 1;
export const setGlobalTest = (on: boolean) => setIntSetting("global_test", on ? 1 : 0, 0, 1);
export const getGlobalTestPct = () => getIntSetting("global_test_pct", 50, 0, 100);
export const setGlobalTestPct = (v: number) => setIntSetting("global_test_pct", v, 0, 100);

// Instant-withdrawal daily limits, per account.
export const DEFAULT_WITHDRAW_DAILY_COUNT = 5;
export const DEFAULT_WITHDRAW_DAILY_MAX_CENTS = 100000; // $1,000/day
export const getWithdrawDailyCount = () => getIntSetting("wd_daily_count", DEFAULT_WITHDRAW_DAILY_COUNT, 1, 100);
export const setWithdrawDailyCount = (v: number) => setIntSetting("wd_daily_count", v, 1, 100);
export const getWithdrawDailyMaxCents = () => getIntSetting("wd_daily_max_cents", DEFAULT_WITHDRAW_DAILY_MAX_CENTS, 100, 100_000_00);
export const setWithdrawDailyMaxCents = (v: number) => setIntSetting("wd_daily_max_cents", v, 100, 100_000_00);

/** Max stake allowed on a single trade, in cents. */
export const getMaxStakeCents = () => getIntSetting("max_stake_cents", DEFAULT_MAX_STAKE_CENTS, 100, 10_000_00);
export const setMaxStakeCents = (v: number) => setIntSetting("max_stake_cents", v, 100, 10_000_00);
/** Max payout (total returned) on a single trade, in cents — caps the house's per-trade loss. */
export const getMaxPayoutCents = () => getIntSetting("max_payout_cents", DEFAULT_MAX_PAYOUT_CENTS, 200, 50_000_00);
export const setMaxPayoutCents = (v: number) => setIntSetting("max_payout_cents", v, 200, 50_000_00);

export const DEFAULT_REFERRAL_PCT = 0.1; // 10% of the referral's first deposit
export const REFERRAL_CAP_CENTS = 10000; // never pay more than $100 per referral
const REFERRAL_PCT_KEY = "referral_pct";

/** Referral reward rate as a fraction of the referred user's first deposit. */
export async function getReferralPct(): Promise<number> {
  const raw = await rawSetting(REFERRAL_PCT_KEY);
  const v = raw != null ? Number(raw) : NaN;
  return Number.isFinite(v) && v >= 0 && v <= 1 ? v : DEFAULT_REFERRAL_PCT;
}

/** Set the referral reward rate (fraction). Clamped to 0–50%. */
export async function setReferralPct(pct: number): Promise<number> {
  await ensureSchema();
  const sql = db();
  const clamped = Math.min(0.5, Math.max(0, Number(pct) || 0));
  await sql`
    INSERT INTO voltrix_settings (key, value, updated_at)
    VALUES (${REFERRAL_PCT_KEY}, ${String(clamped)}, now())
    ON CONFLICT (key) DO UPDATE SET value = ${String(clamped)}, updated_at = now()
  `;
  cacheSetting(REFERRAL_PCT_KEY, String(clamped));
  return clamped;
}

/** True if the account is blocked/suspended and must not trade or withdraw. */
export async function isBlocked(userId: number): Promise<boolean> {
  const sql = db();
  const rows = (await sql`
    SELECT status FROM voltrix_users WHERE id = ${userId} LIMIT 1
  `) as Array<{ status: string | null }>;
  return rows.length ? rows[0].status === "blocked" : false;
}


/** Emails on the no-withdrawal whitelist from env (comma-separated). */
export function withdrawBlockedEmails(): string[] {
  return (process.env.WITHDRAW_BLOCKED_EMAILS || "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

/**
 * True if this account may NOT withdraw: it can trade and use everything else,
 * but withdrawals are held in "processing" and never paid out. Set via the admin
 * toggle (users.withdraw_blocked) or the env whitelist WITHDRAW_BLOCKED_EMAILS.
 */
export async function isWithdrawBlocked(
  userId: number,
  email?: string | null
): Promise<boolean> {
  if (email && withdrawBlockedEmails().includes(String(email).trim().toLowerCase())) {
    return true;
  }
  const sql = db();
  const rows = (await sql`
    SELECT COALESCE(withdraw_blocked, false) AS b FROM voltrix_users WHERE id = ${userId} LIMIT 1
  `) as Array<{ b: boolean }>;
  return rows.length ? !!rows[0].b : false;
}
