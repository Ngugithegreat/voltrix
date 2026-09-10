import { createHmac } from "crypto";
import { usdKesRate } from "./mpesa";

// Paystack integration for card + bank deposits (hosted checkout + webhook).
// The wallet is in USD; Paystack charges in the merchant's local currency
// (KES by default, or USD if the account supports it).

const BASE = "https://api.paystack.co";

export function isPaystackConfigured(): boolean {
  return !!process.env.PAYSTACK_SECRET_KEY;
}

function secret(): string {
  return process.env.PAYSTACK_SECRET_KEY!;
}

export function paystackCurrency(): string {
  return (process.env.PAYSTACK_CURRENCY || "KES").toUpperCase();
}

/** Amount to charge, in the currency's smallest unit (x100), for a USD deposit. */
export function paystackAmountSubunit(usd: number): number {
  const cur = paystackCurrency();
  const local = cur === "USD" ? usd : usd * usdKesRate();
  return Math.round(local * 100);
}

export type PaystackInit = {
  authorization_url: string;
  access_code: string;
  reference: string;
};

export async function initTransaction(opts: {
  email: string;
  amountSubunit: number;
  reference: string;
  callbackUrl: string;
  channels?: string[];
  metadata?: Record<string, unknown>;
}): Promise<PaystackInit> {
  const res = await fetch(`${BASE}/transaction/initialize`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${secret()}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      email: opts.email,
      amount: opts.amountSubunit,
      currency: paystackCurrency(),
      reference: opts.reference,
      callback_url: opts.callbackUrl,
      channels: opts.channels,
      metadata: opts.metadata,
    }),
    cache: "no-store",
  });
  const json = await res.json().catch(() => ({}));
  if (!json.status || !json.data?.authorization_url) {
    throw new Error(json.message || "Could not start Paystack checkout.");
  }
  return json.data as PaystackInit;
}

export type PaystackVerify = {
  status: string; // 'success' when paid
  amount: number; // subunit
  currency: string;
  reference: string;
};

/** Authoritative status straight from Paystack — verified before crediting. */
export async function verifyTransaction(reference: string): Promise<PaystackVerify> {
  const res = await fetch(`${BASE}/transaction/verify/${encodeURIComponent(reference)}`, {
    headers: { Authorization: `Bearer ${secret()}` },
    cache: "no-store",
  });
  const json = await res.json().catch(() => ({}));
  if (!json.status || !json.data) throw new Error("Paystack verification failed.");
  return json.data as PaystackVerify;
}

/** Paystack signs webhooks with HMAC-SHA512 of the raw body using the secret key. */
export function verifyWebhookSignature(rawBody: string, signature: string | null): boolean {
  if (!signature) return false;
  const hash = createHmac("sha512", secret()).update(rawBody).digest("hex");
  return hash === signature;
}
