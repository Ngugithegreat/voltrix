import { neon, NeonQueryFunction } from "@neondatabase/serverless";

// Money is stored everywhere as an INTEGER number of cents to avoid float drift.
// $10.50 -> 1050.

let _sql: NeonQueryFunction<false, false> | null = null;
let _migrated = false;

// Accept whatever a Postgres provider injects. Vercel's one-click Postgres
// (Neon) sets POSTGRES_URL automatically, so adding a database from the Vercel
// Storage tab wires this up with zero manual copying.
const DB_URL_VARS = [
  "DATABASE_URL",
  "POSTGRES_URL",
  "POSTGRES_PRISMA_URL",
  "POSTGRES_URL_NON_POOLING",
  "NEON_DATABASE_URL",
];

export function dbUrl(): string | undefined {
  for (const v of DB_URL_VARS) {
    const val = process.env[v];
    if (val) return val;
  }
  return undefined;
}

export function hasDb(): boolean {
  return !!dbUrl();
}

function getSql(): NeonQueryFunction<false, false> {
  const url = dbUrl();
  if (!url) {
    throw new Error(
      "No Postgres connection string found. In Vercel open the Storage tab and create a Postgres database (it sets POSTGRES_URL automatically), or add DATABASE_URL yourself."
    );
  }
  if (!_sql) {
    _sql = neon(url);
  }
  return _sql;
}

// Bump whenever the DDL in runMigration() changes so a fresh deploy re-applies
// it exactly once; every request after that skips the DDL entirely.
const SCHEMA_VERSION = 3;
let _migrating: Promise<void> | null = null;

/**
 * Ensures the schema exists. Safe to call on every request and cheap at scale:
 *  - once migrated in THIS instance, returns immediately (`_migrated`);
 *  - concurrent first-callers share ONE run (`_migrating` single-flight) instead
 *    of each firing ~46 DDL statements at the database;
 *  - an already-migrated DATABASE is detected with a single version read, so a
 *    cold start costs one SELECT — not 46 DDL round-trips. This is what keeps
 *    the DB connection pool from being exhausted under a signup/traffic spike.
 */
export async function ensureSchema(): Promise<void> {
  if (_migrated) return;
  if (!_migrating) {
    _migrating = runMigration().catch((e) => {
      _migrating = null; // let a later request retry if this run failed
      throw e;
    });
  }
  return _migrating;
}

async function runMigration(): Promise<void> {
  const sql = getSql();
  // Fast path: if the database already reports the current schema version, skip
  // all the DDL below. Only the first request after a version bump pays for it.
  try {
    const r = (await sql`SELECT v FROM voltrix_meta WHERE k = 'schema_version' LIMIT 1`) as Array<{ v: string }>;
    if (r.length && Number(r[0].v) >= SCHEMA_VERSION) {
      _migrated = true;
      return;
    }
  } catch {
    /* meta table doesn't exist yet — fall through and run the full migration */
  }

  await sql`
    CREATE TABLE IF NOT EXISTS voltrix_users (
      id            SERIAL PRIMARY KEY,
      email         TEXT UNIQUE NOT NULL,
      name          TEXT NOT NULL,
      password_hash TEXT NOT NULL,
      role          TEXT NOT NULL DEFAULT 'user',
      balance       BIGINT NOT NULL DEFAULT 0,
      created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `;
  await sql`
    CREATE TABLE IF NOT EXISTS voltrix_transactions (
      id          SERIAL PRIMARY KEY,
      user_id     INTEGER NOT NULL REFERENCES voltrix_users(id) ON DELETE CASCADE,
      type        TEXT NOT NULL,           -- deposit | withdrawal | trade_stake | trade_payout | adjustment
      amount      BIGINT NOT NULL,         -- positive = credit to user, negative = debit
      status      TEXT NOT NULL DEFAULT 'completed', -- pending | completed | rejected
      method      TEXT,                    -- mpesa | crypto | bank | manual ...
      reference   TEXT,                    -- user-supplied ref / phone / address
      note        TEXT,
      created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `;
  await sql`
    CREATE TABLE IF NOT EXISTS voltrix_trades (
      id           SERIAL PRIMARY KEY,
      user_id      INTEGER NOT NULL REFERENCES voltrix_users(id) ON DELETE CASCADE,
      symbol       TEXT NOT NULL,          -- R_10, R_25, R_50, R_75, R_100
      direction    TEXT NOT NULL,          -- rise | fall
      stake        BIGINT NOT NULL,        -- cents
      payout       BIGINT NOT NULL,        -- cents credited if won (stake * multiplier)
      entry_price  DOUBLE PRECISION NOT NULL,
      exit_price   DOUBLE PRECISION,
      entry_epoch  BIGINT NOT NULL,        -- unix seconds
      expiry_epoch BIGINT NOT NULL,        -- unix seconds
      status       TEXT NOT NULL DEFAULT 'open', -- open | won | lost
      created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
      settled_at   TIMESTAMPTZ
    )
  `;
  // Country selected at signup — drives which deposit rails the user sees.
  await sql`ALTER TABLE voltrix_users ADD COLUMN IF NOT EXISTS country TEXT`;
  // Phone captured at signup, prefilled on the deposit/withdraw forms.
  await sql`ALTER TABLE voltrix_users ADD COLUMN IF NOT EXISTS phone TEXT`;
  // Demo (practice) account — virtual funds, real market, never real money.
  // Default $10,000.00 (in cents). Resettable by the user.
  await sql`ALTER TABLE voltrix_users ADD COLUMN IF NOT EXISTS demo_balance BIGINT NOT NULL DEFAULT 1000000`;
  await sql`ALTER TABLE voltrix_trades ADD COLUMN IF NOT EXISTS is_demo BOOLEAN NOT NULL DEFAULT false`;
  await sql`ALTER TABLE voltrix_transactions ADD COLUMN IF NOT EXISTS is_demo BOOLEAN NOT NULL DEFAULT false`;

  // Email verification (OTP). Non-blocking: accounts work unverified, this just
  // confirms the address is real and drives the "verified" badge.
  await sql`ALTER TABLE voltrix_users ADD COLUMN IF NOT EXISTS email_verified BOOLEAN NOT NULL DEFAULT false`;
  await sql`ALTER TABLE voltrix_users ADD COLUMN IF NOT EXISTS email_otp_hash TEXT`;
  await sql`ALTER TABLE voltrix_users ADD COLUMN IF NOT EXISTS email_otp_expires TIMESTAMPTZ`;

  // Web Push subscriptions (one row per browser/device endpoint).
  await sql`
    CREATE TABLE IF NOT EXISTS voltrix_push_subs (
      endpoint   TEXT PRIMARY KEY,
      user_id    INTEGER NOT NULL REFERENCES voltrix_users(id) ON DELETE CASCADE,
      p256dh     TEXT NOT NULL,
      auth       TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `;
  await sql`CREATE INDEX IF NOT EXISTS idx_push_user ON voltrix_push_subs(user_id)`;

  // Provider correlation columns for automated M-Pesa (added idempotently so
  // existing databases upgrade cleanly).
  await sql`ALTER TABLE voltrix_transactions ADD COLUMN IF NOT EXISTS provider_ref TEXT`;
  await sql`ALTER TABLE voltrix_transactions ADD COLUMN IF NOT EXISTS receipt TEXT`;

  // Multipliers contract support on trades.
  await sql`ALTER TABLE voltrix_trades ADD COLUMN IF NOT EXISTS kind TEXT NOT NULL DEFAULT 'rise_fall'`;
  await sql`ALTER TABLE voltrix_trades ADD COLUMN IF NOT EXISTS multiplier INTEGER`;
  await sql`ALTER TABLE voltrix_trades ADD COLUMN IF NOT EXISTS stop_out_price DOUBLE PRECISION`;

  // Digit contract support (kind = 'digit').
  // subtype: even_odd | over_under | matches_differs; prediction: the chosen side;
  // barrier: barrier/target digit; exit_digit: settled last digit.
  await sql`ALTER TABLE voltrix_trades ADD COLUMN IF NOT EXISTS subtype TEXT`;
  await sql`ALTER TABLE voltrix_trades ADD COLUMN IF NOT EXISTS prediction TEXT`;
  await sql`ALTER TABLE voltrix_trades ADD COLUMN IF NOT EXISTS barrier INTEGER`;
  await sql`ALTER TABLE voltrix_trades ADD COLUMN IF NOT EXISTS exit_digit INTEGER`;

  // Test harness only: a forced win/lose outcome, ever set ONLY for whitelisted
  // TEST_EMAILS accounts. Null for every real trade.
  await sql`ALTER TABLE voltrix_trades ADD COLUMN IF NOT EXISTS forced_outcome TEXT`;

  // Account controls: status (active | blocked) + promotional flag (admin-only).
  await sql`ALTER TABLE voltrix_users ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'active'`;
  await sql`ALTER TABLE voltrix_users ADD COLUMN IF NOT EXISTS promo BOOLEAN NOT NULL DEFAULT false`;

  // Bonus funds that must be wagered (staked) before they can be withdrawn.
  await sql`ALTER TABLE voltrix_users ADD COLUMN IF NOT EXISTS bonus_locked BIGINT NOT NULL DEFAULT 0`;

  // Admin-managed test accounts (QA). Enables the Force Win/Lose control for the
  // account. Clear all before launch.
  await sql`ALTER TABLE voltrix_users ADD COLUMN IF NOT EXISTS is_test BOOLEAN NOT NULL DEFAULT false`;
  // Test win rate (%) used by the "Auto" test mode to roll wins/losses.
  await sql`ALTER TABLE voltrix_users ADD COLUMN IF NOT EXISTS test_win_pct INTEGER NOT NULL DEFAULT 50`;

  // Referrals: who referred this user, and whether their first-deposit reward paid.
  await sql`ALTER TABLE voltrix_users ADD COLUMN IF NOT EXISTS referred_by INTEGER`;
  await sql`ALTER TABLE voltrix_users ADD COLUMN IF NOT EXISTS referral_rewarded BOOLEAN NOT NULL DEFAULT false`;

  // KYC (identity verification) — required for large withdrawals.
  await sql`ALTER TABLE voltrix_users ADD COLUMN IF NOT EXISTS kyc_status TEXT NOT NULL DEFAULT 'none'`; // none | pending | approved | rejected
  await sql`ALTER TABLE voltrix_users ADD COLUMN IF NOT EXISTS kyc_name TEXT`;
  await sql`ALTER TABLE voltrix_users ADD COLUMN IF NOT EXISTS kyc_id_number TEXT`;
  await sql`ALTER TABLE voltrix_users ADD COLUMN IF NOT EXISTS kyc_phone TEXT`;
  await sql`ALTER TABLE voltrix_users ADD COLUMN IF NOT EXISTS kyc_reason TEXT`;
  await sql`ALTER TABLE voltrix_users ADD COLUMN IF NOT EXISTS kyc_submitted_at TIMESTAMPTZ`;

  // Key/value settings store (house edge %, etc.).
  await sql`
    CREATE TABLE IF NOT EXISTS voltrix_settings (
      key        TEXT PRIMARY KEY,
      value      TEXT NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `;

  // One-time backfill: mark every EXISTING account as email-verified, so the
  // "verify your email" prompt only ever shows to brand-new signups (people who
  // already have accounts shouldn't be nagged). Runs exactly once, guarded by a
  // settings flag inserted atomically.
  const backfill = (await sql`
    INSERT INTO voltrix_settings (key, value, updated_at)
    VALUES ('email_verify_backfilled', '1', now())
    ON CONFLICT (key) DO NOTHING
    RETURNING key
  `) as Array<{ key: string }>;
  if (backfill.length) {
    await sql`UPDATE voltrix_users SET email_verified = true WHERE email_verified = false`;
  }

  // Password-reset tokens (only the SHA-256 hash is stored; single-use, 1h TTL).
  await sql`
    CREATE TABLE IF NOT EXISTS voltrix_password_resets (
      id         SERIAL PRIMARY KEY,
      user_id    INTEGER NOT NULL REFERENCES voltrix_users(id) ON DELETE CASCADE,
      token_hash TEXT NOT NULL,
      expires_at TIMESTAMPTZ NOT NULL,
      used       BOOLEAN NOT NULL DEFAULT false,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `;
  await sql`CREATE INDEX IF NOT EXISTS idx_pwreset_token ON voltrix_password_resets(token_hash)`;

  await sql`CREATE INDEX IF NOT EXISTS idx_tx_user ON voltrix_transactions(user_id, created_at DESC)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_trades_user ON voltrix_trades(user_id, created_at DESC)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_tx_provider ON voltrix_transactions(provider_ref)`;
  // Speeds up the case-insensitive login/register email lookup and admin search.
  await sql`CREATE INDEX IF NOT EXISTS idx_users_email_lower ON voltrix_users(lower(email))`;
  // Admin KPI sums group by (type,status); the 14-day volume chart scans by
  // (type,created_at). One composite serves both without a full seq scan — this
  // is what keeps the admin dashboard fast as the transactions table grows.
  await sql`CREATE INDEX IF NOT EXISTS idx_tx_type_status_created ON voltrix_transactions(type, status, created_at DESC)`;
  // Admin trade KPIs filter on (is_demo,status).
  await sql`CREATE INDEX IF NOT EXISTS idx_trades_demo_status ON voltrix_trades(is_demo, status)`;
  // Newest-accounts admin table + user list order by created_at.
  await sql`CREATE INDEX IF NOT EXISTS idx_users_created ON voltrix_users(created_at DESC)`;

  // Signup phone-OTP codes (stored hashed). One row per phone, upserted on send.
  await sql`
    CREATE TABLE IF NOT EXISTS voltrix_otps (
      phone        TEXT PRIMARY KEY,
      code_hash    TEXT NOT NULL,
      expires_at   TIMESTAMPTZ NOT NULL,
      attempts     INTEGER NOT NULL DEFAULT 0,
      last_sent_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `;

  // Record the schema version so future cold starts skip all of the above.
  await sql`CREATE TABLE IF NOT EXISTS voltrix_meta (k TEXT PRIMARY KEY, v TEXT NOT NULL)`;
  await sql`
    INSERT INTO voltrix_meta (k, v) VALUES ('schema_version', ${String(SCHEMA_VERSION)})
    ON CONFLICT (k) DO UPDATE SET v = EXCLUDED.v
  `;
  _migrated = true;
}

export async function query<T = Record<string, unknown>>(
  strings: TemplateStringsArray,
  ...params: unknown[]
): Promise<T[]> {
  const sql = getSql();
  return (await sql(strings, ...params)) as T[];
}

// Re-export the raw tagged-template client for callers that want it.
export function db(): NeonQueryFunction<false, false> {
  return getSql();
}
