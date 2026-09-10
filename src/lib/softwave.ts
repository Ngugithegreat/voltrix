import { createHmac, timingSafeEqual } from "crypto";

// SoftWave Global — payment orchestration (M-Pesa STK collections + M-Pesa B2C
// payouts). We integrate with SoftWave ONLY; it talks to the live rails, waits
// for the provider callback, posts its ledger, then webhooks us. Amounts are in
// KES (the merchant currency). Docs: https://softwaveglobal.com/developers
//
// Env:
//   SOFTWAVE_API_KEY         sw_test_… (sandbox, STK auto-completes) or sw_live_…
//   SOFTWAVE_WEBHOOK_SECRET  signing secret from the console (verifies webhooks)
//   SOFTWAVE_BASE_URL        override (default the public v1 base)

const BASE = process.env.SOFTWAVE_BASE_URL || "https://softwaveglobal.com/api/v1";

export function softwaveKey(): string | undefined {
  const v = process.env.SOFTWAVE_API_KEY;
  return v && v.trim() ? v.trim() : undefined;
}
export function isSoftwaveConfigured(): boolean {
  return !!softwaveKey();
}
export function softwaveWebhookSecret(): string | undefined {
  const v = process.env.SOFTWAVE_WEBHOOK_SECRET;
  return v && v.trim() ? v.trim() : undefined;
}

type SwResult<T> = { ok: true; data: T } | { ok: false; code?: string; error: string };

async function call<T = any>(
  path: string,
  init: { method: "GET" | "POST"; body?: unknown; idempotencyKey?: string }
): Promise<SwResult<T>> {
  const key = softwaveKey();
  if (!key) return { ok: false, error: "SoftWave not configured." };
  const headers: Record<string, string> = {
    Authorization: `Bearer ${key}`,
    Accept: "application/json",
  };
  if (init.body !== undefined) headers["Content-Type"] = "application/json";
  if (init.idempotencyKey) headers["Idempotency-Key"] = init.idempotencyKey;

  try {
    const res = await fetch(`${BASE}${path}`, {
      method: init.method,
      headers,
      body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
      cache: "no-store",
    });
    const json = (await res.json().catch(() => ({}))) as any;
    if (res.ok && json?.success) return { ok: true, data: json.data as T };
    return {
      ok: false,
      code: json?.error?.code,
      error: json?.error?.message || json?.message || `SoftWave error (HTTP ${res.status}).`,
    };
  } catch (e: any) {
    return { ok: false, error: e?.message || "Could not reach SoftWave." };
  }
}

export type SwPayment = {
  transaction_id: string;
  reference: string; // SWP…
  merchant_reference: string;
  status: string; // pending | PROCESSING | SUCCESS | FAILED
  amount: string;
  currency: string;
  payment_method?: string;
  environment?: string;
};

/** Collect via M-Pesa STK. `reference` is our merchant ref (also the idempotency key). */
export function stkPush(opts: {
  amountKes: number;
  phone: string; // MSISDN 2547XXXXXXXX
  reference: string;
  description: string;
}): Promise<SwResult<SwPayment>> {
  return call<SwPayment>("/payments/mpesa/stk", {
    method: "POST",
    idempotencyKey: opts.reference,
    body: {
      amount: opts.amountKes,
      currency: "KES",
      phone_number: opts.phone,
      reference: opts.reference,
      description: opts.description,
    },
  });
}

/** Read a payment's status by transaction_id OR merchant reference. */
export function paymentStatus(idOrRef: string): Promise<SwResult<SwPayment>> {
  return call<SwPayment>(`/payments/${encodeURIComponent(idOrRef)}`, { method: "GET" });
}

export type SwPayout = {
  uuid?: string;
  id?: number | string;
  transaction_id?: string;
  transaction_reference?: string;
  reference?: string;
  merchant_reference?: string;
  status: string;
  amount?: string;
  failure_message?: string | null;
};

/** Pay out via M-Pesa B2C. SoftWave reserves ledger funds, then submits B2C. */
export function b2cPayout(opts: {
  amountKes: number;
  phone: string;
  reference: string;
}): Promise<SwResult<SwPayout>> {
  return call<SwPayout>("/payouts/mpesa/b2c", {
    method: "POST",
    idempotencyKey: opts.reference,
    body: {
      amount: opts.amountKes,
      currency: "KES",
      phone_number: opts.phone,
      reference: opts.reference,
    },
  });
}

export function payoutStatus(id: string): Promise<SwResult<SwPayout>> {
  return call<SwPayout>(`/payouts/${encodeURIComponent(id)}`, { method: "GET" });
}

/** Recent payouts (merchant-wide) — used to reconcile our pending withdrawals by
 * merchant_reference, since GET /payouts/{id} needs SoftWave's uuid (which we
 * don't keep) while merchant_reference is our own stable key. */
export function listPayouts(limit = 100): Promise<SwResult<{ items: SwPayout[] }>> {
  return call<{ items: SwPayout[] }>(`/payouts?limit=${limit}`, { method: "GET" });
}

/** SoftWave signs webhooks: X-SoftWave-Signature = hex HMAC-SHA256(raw body, secret). */
export function verifyWebhookSignature(rawBody: string, signature: string | null): boolean {
  const secret = softwaveWebhookSecret();
  if (!secret || !signature) return false;
  const expected = createHmac("sha256", secret).update(rawBody, "utf8").digest("hex");
  const a = Buffer.from(expected, "utf8");
  const b = Buffer.from(String(signature).trim(), "utf8");
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Normalizes SoftWave's status strings to our terminal buckets. */
export function isPaidStatus(status: string): boolean {
  return String(status).toUpperCase() === "SUCCESS";
}
export function isFailedStatus(status: string): boolean {
  return String(status).toUpperCase() === "FAILED";
}
