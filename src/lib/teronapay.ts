import { createHmac, timingSafeEqual } from "crypto";

// TeronaPay — one PSP for Kenya (M-Pesa STK + B2C), Uganda and Tanzania (mobile
// money). REST, HTTP Basic auth (key id + secret). Amounts
// on the REST API are DECIMAL major units (650 = KES 650.00). Docs:
// https://teronapay.com/docs
//
// Env:
//   TERONAPAY_KEY_ID          np_… (Basic-auth username)
//   TERONAPAY_SECRET          Basic-auth password
//   TERONAPAY_WEBHOOK_SECRET  whsec_… (verifies X-Nowpesa-Signature)
//   TERONAPAY_BASE_URL        override (default prod; sandbox = api.sandbox.teronapay.com)

const BASE = process.env.TERONAPAY_BASE_URL || "https://api.teronapay.com";

export function isTeronaConfigured(): boolean {
  return !!(process.env.TERONAPAY_KEY_ID && process.env.TERONAPAY_SECRET);
}
export function teronaWebhookSecret(): string | undefined {
  const v = process.env.TERONAPAY_WEBHOOK_SECRET;
  return v && v.trim() ? v.trim() : undefined;
}
function authHeader(): string {
  const id = (process.env.TERONAPAY_KEY_ID || "").trim();
  const secret = (process.env.TERONAPAY_SECRET || "").trim();
  return "Basic " + Buffer.from(`${id}:${secret}`).toString("base64");
}

// The API key can act on several business accounts (one per currency); each
// request targets one via the X-Account-No header. Defaults are this merchant's
// account numbers; override per currency with TERONAPAY_ACCOUNT_<CUR>.
const ACCOUNTS: Record<string, string> = {
  KES: (process.env.TERONAPAY_ACCOUNT_KES || "TER5D36C450D5").trim(),
  UGX: (process.env.TERONAPAY_ACCOUNT_UGX || "TER137B6ED9B1").trim(),
  TZS: (process.env.TERONAPAY_ACCOUNT_TZS || "TER751E3FF5BC").trim(),
};
function accountFor(currency: string): string | undefined {
  return ACCOUNTS[String(currency).toUpperCase()] || undefined;
}

type TResult<T> = { ok: true; data: T } | { ok: false; code?: string; error: string };

async function call<T = any>(
  path: string,
  init: { method: "GET" | "POST"; body?: unknown; idempotencyKey?: string; accountNo?: string }
): Promise<TResult<T>> {
  if (!isTeronaConfigured()) return { ok: false, error: "Payments not configured." };
  const headers: Record<string, string> = { Authorization: authHeader(), Accept: "application/json" };
  if (init.body !== undefined) headers["Content-Type"] = "application/json";
  if (init.idempotencyKey) headers["Idempotency-Key"] = init.idempotencyKey;
  if (init.accountNo) headers["X-Account-No"] = init.accountNo;
  try {
    const res = await fetch(`${BASE}${path}`, {
      method: init.method,
      headers,
      body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
      cache: "no-store",
    });
    const json = (await res.json().catch(() => ({}))) as any;
    if (res.ok) return { ok: true, data: json as T };
    // TeronaPay error envelopes vary: sometimes {message,type} at the top level,
    // sometimes nested as {error:{message,type}}. Always resolve to a STRING —
    // returning an object here would get rendered as a React child and crash the
    // client ("Objects are not valid as a React child").
    const errObj = json?.error;
    const rawMsg =
      json?.message ||
      (errObj && typeof errObj === "object" ? errObj.message : errObj) ||
      `Payment error (HTTP ${res.status}).`;
    const code =
      json?.type || json?.code || (errObj && typeof errObj === "object" ? errObj.type : undefined);
    return { ok: false, code, error: typeof rawMsg === "string" ? rawMsg : `Payment error (HTTP ${res.status}).` };
  } catch (e: any) {
    return { ok: false, error: e?.message || "Could not reach the payment provider." };
  }
}

export type TPayment = {
  id: string;
  reference: string;
  amount: number;
  currency: string;
  channel: string;
  status: string; // pending | processing | succeeded | failed | canceled
  channel_receipt?: string | null;
};

// A collection: STK Push (KES) or mobile-money PIN (UGX/TZS). channel is
// currency-aware (TZS/UGX → mobile_money) but we pass it explicitly.
export function createPayment(opts: {
  reference: string;
  amount: number; // decimal major units
  currency: string; // KES | UGX | TZS
  channel: string; // mpesa_stk_push | mobile_money
  payerPhone: string; // E.164 with +
  callbackUrl?: string;
}): Promise<TResult<TPayment>> {
  return call<TPayment>("/v1/payments", {
    method: "POST",
    idempotencyKey: opts.reference,
    accountNo: accountFor(opts.currency),
    body: {
      reference: opts.reference,
      amount: opts.amount,
      currency: opts.currency,
      channel: opts.channel,
      payer_phone: opts.payerPhone,
      callback_url: opts.callbackUrl,
    },
  });
}

export function getPayment(id: string): Promise<TResult<TPayment>> {
  return call<TPayment>(`/v1/payments/${encodeURIComponent(id)}`, { method: "GET" });
}

export type TPayout = {
  id: string;
  amount: number;
  currency: string;
  channel: string;
  status: string; // pending | succeeded | failed
  destination_phone?: string;
  channel_receipt?: string | null;
  failure_reason?: string | null;
};

// A disbursement to mobile money. Currency selects the rail: KES→M-Pesa B2C,
// UGX/TZS→mobile money. `remarks` reaches the recipient's transaction note.
export function createPayout(opts: {
  amount: number;
  currency: string;
  destinationPhone: string; // E.164 with +
  remarks?: string;
  callbackUrl?: string;
  idempotencyKey: string;
}): Promise<TResult<TPayout>> {
  return call<TPayout>("/v1/payouts", {
    method: "POST",
    idempotencyKey: opts.idempotencyKey,
    accountNo: accountFor(opts.currency),
    body: {
      amount: opts.amount,
      currency: opts.currency,
      destination_phone: opts.destinationPhone,
      remarks: opts.remarks,
      callback_url: opts.callbackUrl,
    },
  });
}

export function getPayout(id: string): Promise<TResult<TPayout>> {
  return call<TPayout>(`/v1/payouts/${encodeURIComponent(id)}`, { method: "GET" });
}

export function isPaid(status: string): boolean {
  return String(status).toLowerCase() === "succeeded";
}
export function isFailed(status: string): boolean {
  const s = String(status).toLowerCase();
  return s === "failed" || s === "canceled";
}

// Verify a webhook: X-Nowpesa-Signature = "t=<unix>,v1=<hex hmac>", where the
// HMAC-SHA256 is over `${t}.${rawBody}` keyed by the signing secret.
export function verifyWebhookSignature(rawBody: string, header: string | null): boolean {
  const secret = teronaWebhookSecret();
  if (!secret || !header) return false;
  const parts = Object.fromEntries(String(header).split(",").map((p) => p.split("=").map((s) => s.trim())));
  const t = parts.t;
  const sig = parts.v1;
  if (!t || !sig) return false;
  const expected = createHmac("sha256", secret).update(`${t}.${rawBody}`).digest("hex");
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}
