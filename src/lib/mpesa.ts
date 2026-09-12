// Safaricom Daraja (M-Pesa) client — automated deposits (STK Push) and
// withdrawals (B2C). All secrets come from environment variables; nothing is
// hard-coded. If the required vars are missing, `isMpesaConfigured()` returns
// false and the app falls back to manual admin approval.

const SANDBOX_BASE = "https://sandbox.safaricom.co.ke";
const PROD_BASE = "https://api.safaricom.co.ke";

/** Read an env var, trimmed (copy-paste often leaves trailing spaces/newlines). */
function env(name: string): string {
  return (process.env[name] || "").trim();
}

/** The configured M-Pesa env, accepting either MPESA_ENV or MPESA_ENVIRONMENT. */
export function mpesaEnvValue(): string {
  return (env("MPESA_ENV") || env("MPESA_ENVIRONMENT")).toLowerCase();
}

export function isProduction(): boolean {
  const v = mpesaEnvValue();
  return v === "production" || v === "prod" || v === "live";
}

function base(): string {
  return isProduction() ? PROD_BASE : SANDBOX_BASE;
}

export function isMpesaConfigured(): boolean {
  return !!(
    process.env.MPESA_CONSUMER_KEY &&
    process.env.MPESA_CONSUMER_SECRET &&
    process.env.MPESA_SHORTCODE &&
    process.env.MPESA_PASSKEY
  );
}

// B2C (withdrawals) uses its OWN dedicated paybill credentials so they never get
// confused with the STK / deposit M-Pesa keys. Each value prefers a MPESA_B2C_*
// var and falls back to the shared MPESA_* one for backward compatibility. So a
// separate B2C paybill is configured entirely with MPESA_B2C_* vars, while any
// existing deposit/STK MPESA_* credentials stay exactly as they are.
function b2cVal(name: string): string {
  return env(`MPESA_B2C_${name}`) || env(`MPESA_${name}`);
}
function b2cIsProduction(): boolean {
  const v = (env("MPESA_B2C_ENV") || mpesaEnvValue()).toLowerCase();
  return v === "production" || v === "prod" || v === "live";
}
function b2cBase(): string {
  return b2cIsProduction() ? PROD_BASE : SANDBOX_BASE;
}

// B2C is independent of the STK/deposit config — a paybill set up purely for
// payouts (its own consumer key/secret, initiator, security credential and
// shortcode) is enough, no STK passkey required.
export function isB2cConfigured(): boolean {
  return !!(
    b2cVal("CONSUMER_KEY") &&
    b2cVal("CONSUMER_SECRET") &&
    b2cVal("INITIATOR_NAME") &&
    b2cVal("SECURITY_CREDENTIAL") &&
    b2cVal("SHORTCODE")
  );
}

export function usdKesRate(): number {
  const r = Number(process.env.USD_KES_RATE);
  return Number.isFinite(r) && r > 0 ? r : 130;
}

/** USD cents -> whole KES (M-Pesa only moves whole shillings). */
export function centsToKes(cents: number): number {
  return Math.max(1, Math.round((cents / 100) * usdKesRate()));
}

/**
 * Withdrawal (payout) rate — deliberately LOWER than the deposit rate so the
 * spread is the platform's margin on cash-out. Defaults to 127 KES/USD.
 */
export function usdKesWithdrawRate(): number {
  const r = Number(process.env.USD_KES_WITHDRAW_RATE);
  return Number.isFinite(r) && r > 0 ? r : 127;
}

/** USD cents -> whole KES paid out on withdrawal (uses the withdrawal rate). */
export function centsToKesWithdraw(cents: number): number {
  return Math.max(1, Math.round((cents / 100) * usdKesWithdrawRate()));
}

/** Normalise a Kenyan number to 2547XXXXXXXX / 2541XXXXXXXX. Returns null if invalid. */
export function normalizePhone(input: string): string | null {
  let p = String(input).trim().replace(/[\s+\-()]/g, "");
  if (p.startsWith("0")) p = "254" + p.slice(1);
  else if (p.startsWith("7") || p.startsWith("1")) p = "254" + p;
  else if (p.startsWith("254")) {
    /* already good */
  } else return null;
  return /^254(7|1)\d{8}$/.test(p) ? p : null;
}

function timestamp(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return (
    d.getFullYear().toString() +
    pad(d.getMonth() + 1) +
    pad(d.getDate()) +
    pad(d.getHours()) +
    pad(d.getMinutes()) +
    pad(d.getSeconds())
  );
}

function b64(s: string): string {
  return Buffer.from(s).toString("base64");
}

async function accessToken(): Promise<string> {
  const key = env("MPESA_CONSUMER_KEY");
  const secret = env("MPESA_CONSUMER_SECRET");
  const res = await fetch(
    `${base()}/oauth/v1/generate?grant_type=client_credentials`,
    {
      headers: { Authorization: `Basic ${b64(`${key}:${secret}`)}` },
      cache: "no-store",
    }
  );
  const json = await res.json().catch(() => ({}));
  if (!res.ok || !json.access_token) {
    const where = isProduction() ? "production" : "sandbox";
    throw new Error(
      `M-Pesa auth failed on the ${where} endpoint (${res.status}). ` +
        `Check the Consumer Key/Secret and that MPESA_ENV matches your keys.`
    );
  }
  return json.access_token as string;
}

async function daraja<T = any>(path: string, body: unknown): Promise<T> {
  const token = await accessToken();
  const res = await fetch(`${base()}${path}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
    cache: "no-store",
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(
      json?.errorMessage || `M-Pesa request failed (${res.status})`
    );
  }
  return json as T;
}

export type StkPushResult = {
  MerchantRequestID: string;
  CheckoutRequestID: string;
  ResponseCode: string;
  ResponseDescription: string;
};

/** Prompt the customer's phone for an M-Pesa PIN to pay `amountKes`. */
export async function stkPush(opts: {
  phone: string;
  amountKes: number;
  accountRef: string;
  description: string;
  callbackUrl: string;
}): Promise<StkPushResult> {
  const shortcode = env("MPESA_SHORTCODE");
  const passkey = env("MPESA_PASSKEY");
  const ts = timestamp();
  const txnType =
    (process.env.MPESA_STK_TX_TYPE || "CustomerPayBillOnline").trim();

  return daraja<StkPushResult>("/mpesa/stkpush/v1/processrequest", {
    BusinessShortCode: shortcode,
    Password: b64(`${shortcode}${passkey}${ts}`),
    Timestamp: ts,
    TransactionType: txnType,
    Amount: opts.amountKes,
    PartyA: opts.phone,
    PartyB: shortcode,
    PhoneNumber: opts.phone,
    CallBackURL: opts.callbackUrl,
    AccountReference: opts.accountRef.slice(0, 12),
    TransactionDesc: opts.description.slice(0, 20),
  });
}

export type StkQueryResult = {
  ResponseCode: string;
  ResultCode: string;
  ResultDesc: string;
};

/**
 * Authoritative status of an STK request straight from Safaricom. Used to
 * confirm a deposit before crediting, so a forged callback can't create money.
 */
export async function stkQuery(
  checkoutRequestId: string
): Promise<StkQueryResult> {
  const shortcode = env("MPESA_SHORTCODE");
  const passkey = env("MPESA_PASSKEY");
  const ts = timestamp();
  return daraja<StkQueryResult>("/mpesa/stkpushquery/v1/query", {
    BusinessShortCode: shortcode,
    Password: b64(`${shortcode}${passkey}${ts}`),
    Timestamp: ts,
    CheckoutRequestID: checkoutRequestId,
  });
}

// Live STK state for the UI. `pending` = the prompt is on the phone, waiting for
// the user to enter their PIN (Daraja returns a "processing" error until then).
export type StkState =
  | "pending"
  | "success"
  | "cancelled"
  | "timeout"
  | "insufficient"
  | "wrong_pin"
  | "failed";

const RESULT_MAP: Record<string, { state: StkState; desc: string }> = {
  "0": { state: "success", desc: "Payment received." },
  "1032": { state: "cancelled", desc: "You cancelled the request on your phone." },
  "1037": { state: "timeout", desc: "The prompt timed out — no PIN was entered." },
  "1": { state: "insufficient", desc: "Insufficient M-Pesa balance." },
  "2001": { state: "wrong_pin", desc: "Wrong M-Pesa PIN entered." },
  "1001": { state: "failed", desc: "A transaction is already in process for this number." },
};

/** Normalised, non-throwing STK status for live polling. */
export async function stkStatus(
  checkoutRequestId: string
): Promise<{ state: StkState; resultCode: string | null; desc: string }> {
  const shortcode = env("MPESA_SHORTCODE");
  const passkey = env("MPESA_PASSKEY");
  const ts = timestamp();
  const token = await accessToken();
  const res = await fetch(`${base()}/mpesa/stkpushquery/v1/query`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      BusinessShortCode: shortcode,
      Password: b64(`${shortcode}${passkey}${ts}`),
      Timestamp: ts,
      CheckoutRequestID: checkoutRequestId,
    }),
    cache: "no-store",
  });
  const json: any = await res.json().catch(() => ({}));

  // 1) A definitive ResultCode always wins — check it FIRST so a real success
  //    ("0", ResultDesc "...processed successfully.") or a terminal failure is
  //    never mistaken for "still processing". (An earlier version matched the
  //    word "process" in the SUCCESS description and wrongly reported pending,
  //    so successful deposits never credited.)
  const code = json?.ResultCode != null ? String(json.ResultCode) : null;
  const mapped = code ? RESULT_MAP[code] : null;
  if (mapped) return { state: mapped.state, resultCode: code, desc: mapped.desc };

  // 2) HTTP-error shape while the prompt is still on the phone (before the PIN):
  //    { errorCode: "500.001.1001", errorMessage: "...being processed" }.
  const errMsg = String(json?.errorMessage || "").toLowerCase();
  if (json?.errorCode === "500.001.1001" || (errMsg && errMsg.includes("process"))) {
    return { state: "pending", resultCode: null, desc: "Enter your M-Pesa PIN on your phone…" };
  }

  // 3) Unknown/absent result code (incl. an unmapped "still under processing"
  //    response, or a transient query error) — never fail; keep polling. A
  //    genuine success is also credited by the async callback.
  return { state: "pending", resultCode: code, desc: "Waiting for confirmation…" };
}

export type B2cResult = {
  ConversationID: string;
  OriginatorConversationID: string;
  ResponseCode: string;
  ResponseDescription: string;
};

// OAuth + POST helpers for the B2C paybill — use the dedicated B2C credentials
// and environment, kept separate from the STK/deposit token above.
async function b2cAccessToken(): Promise<string> {
  const key = b2cVal("CONSUMER_KEY");
  const secret = b2cVal("CONSUMER_SECRET");
  const res = await fetch(`${b2cBase()}/oauth/v1/generate?grant_type=client_credentials`, {
    headers: { Authorization: `Basic ${b64(`${key}:${secret}`)}` },
    cache: "no-store",
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || !json.access_token) {
    const where = b2cIsProduction() ? "production" : "sandbox";
    throw new Error(
      `M-Pesa B2C auth failed on the ${where} endpoint (${res.status}). ` +
        `Check MPESA_B2C_CONSUMER_KEY / MPESA_B2C_CONSUMER_SECRET and that MPESA_B2C_ENV matches your keys.`
    );
  }
  return json.access_token as string;
}

async function b2cDaraja<T = any>(path: string, body: unknown): Promise<T> {
  const token = await b2cAccessToken();
  const res = await fetch(`${b2cBase()}${path}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
    cache: "no-store",
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(json?.errorMessage || `M-Pesa B2C request failed (${res.status})`);
  }
  return json as T;
}

/** Send `amountKes` from the business shortcode to the customer's phone. */
export async function b2cPayment(opts: {
  phone: string;
  amountKes: number;
  remarks: string;
  resultUrl: string;
  timeoutUrl: string;
}): Promise<B2cResult> {
  const shortcode = b2cVal("SHORTCODE");
  return b2cDaraja<B2cResult>("/mpesa/b2c/v1/paymentrequest", {
    InitiatorName: b2cVal("INITIATOR_NAME"),
    SecurityCredential: b2cVal("SECURITY_CREDENTIAL"),
    CommandID: process.env.MPESA_B2C_COMMAND || "BusinessPayment",
    Amount: opts.amountKes,
    PartyA: shortcode,
    PartyB: opts.phone,
    Remarks: opts.remarks.slice(0, 100),
    QueueTimeOutURL: opts.timeoutUrl,
    ResultURL: opts.resultUrl,
    Occasion: "Withdrawal",
  });
}

/**
 * Public base URL for building callback URLs. Prefer an explicit stable domain;
 * fall back to the Vercel deployment URL, then the request origin.
 */
export function callbackBase(reqUrl: string): string {
  const explicit =
    process.env.PUBLIC_BASE_URL || process.env.MPESA_CALLBACK_BASE_URL;
  if (explicit) return explicit.replace(/\/$/, "");
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  try {
    return new URL(reqUrl).origin;
  } catch {
    return "";
  }
}

/** Shared secret appended to callback URLs so only Safaricom-triggered (our) URLs are honoured. */
export function callbackToken(): string {
  return process.env.MPESA_CALLBACK_SECRET || "";
}
