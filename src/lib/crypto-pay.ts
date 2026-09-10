import { createHmac } from "crypto";
import { BRAND_NAME } from "./brand";

// Crypto deposits via NOWPayments (hosted invoice + signed IPN webhook).
// Priced directly in USD, so no FX conversion — the user pays USDT/BTC/etc.
// and we credit the same USD amount once the payment confirms on-chain.

const BASE = "https://api.nowpayments.io/v1";

export function isCryptoConfigured(): boolean {
  return !!process.env.NOWPAYMENTS_API_KEY;
}

// Coins we let users pay in. USDT-TRC20 first — cheapest network fees.
export const CRYPTO_COINS: { code: string; label: string; note: string }[] = [
  { code: "usdttrc20", label: "USDT", note: "Tron (TRC20)" },
  { code: "usdterc20", label: "USDT", note: "Ethereum (ERC20)" },
  { code: "btc", label: "Bitcoin", note: "BTC" },
  { code: "eth", label: "Ethereum", note: "ETH" },
  { code: "trx", label: "TRON", note: "TRX" },
  { code: "bnbbsc", label: "BNB", note: "BSC" },
];

export function isSupportedCoin(code: string): boolean {
  return CRYPTO_COINS.some((c) => c.code === code);
}

export type CryptoPayment = {
  paymentId: string;
  payAddress: string;
  payAmount: number;
  payCurrency: string;
  network: string | null;
  status: string;
  orderId: string;
};

// Creates an on-chain payment and returns the deposit ADDRESS to show the user
// (no redirect). We credit once NOWPayments confirms via IPN or status poll.
export async function createPayment(opts: {
  amountUsd: number;
  orderId: string;
  payCurrency: string;
  ipnUrl: string;
}): Promise<CryptoPayment> {
  const res = await fetch(`${BASE}/payment`, {
    method: "POST",
    headers: {
      "x-api-key": process.env.NOWPAYMENTS_API_KEY!,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      price_amount: opts.amountUsd,
      price_currency: "usd",
      pay_currency: opts.payCurrency,
      order_id: opts.orderId,
      order_description: `${BRAND_NAME} deposit`,
      ipn_callback_url: opts.ipnUrl,
    }),
    cache: "no-store",
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || !json.pay_address) {
    throw new Error(json.message || "Could not create the crypto payment.");
  }
  return {
    paymentId: String(json.payment_id),
    payAddress: String(json.pay_address),
    payAmount: Number(json.pay_amount),
    payCurrency: String(json.pay_currency || opts.payCurrency),
    network: json.network ? String(json.network) : null,
    status: String(json.payment_status || "waiting"),
    orderId: String(json.order_id || opts.orderId),
  };
}

// Authoritative status straight from NOWPayments (server-to-server).
export async function getPaymentStatus(paymentId: string): Promise<{
  status: string;
  orderId: string | null;
  actuallyPaid: number;
  payAmount: number;
  priceAmount: number;
}> {
  const res = await fetch(`${BASE}/payment/${encodeURIComponent(paymentId)}`, {
    headers: { "x-api-key": process.env.NOWPAYMENTS_API_KEY! },
    cache: "no-store",
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.message || "Could not read payment status.");
  return {
    status: String(json.payment_status || ""),
    orderId: json.order_id ? String(json.order_id) : null,
    actuallyPaid: Number(json.actually_paid || 0),
    payAmount: Number(json.pay_amount || 0),
    priceAmount: Number(json.price_amount || 0),
  };
}

// The minimum crypto deposit we accept, in USD. Small crypto deposits are eaten
// by network fees, so we set a floor and SHOW it to the user. Admin-overridable
// via NEXT_PUBLIC_CRYPTO_MIN_USD.
export const CRYPTO_MIN_USD = Number(process.env.NEXT_PUBLIC_CRYPTO_MIN_USD || 20);

// Converts a confirmed NOWPayments payment into the USD CENTS actually received:
// price_amount (USD) scaled by how much of the expected crypto actually arrived.
// Works for any coin (a 90%-paid invoice credits 90% of the USD). Returns null
// when we can't compute it (then callers fall back to the requested amount).
export function receivedUsdCents(p: {
  priceAmount: number;
  payAmount: number;
  actuallyPaid: number;
}): number | null {
  if (p.priceAmount > 0 && p.payAmount > 0 && p.actuallyPaid > 0) {
    return Math.round(p.priceAmount * (p.actuallyPaid / p.payAmount) * 100);
  }
  return null;
}

export type CryptoInvoice = {
  id: string;
  invoice_url: string;
};

export async function createInvoice(opts: {
  amountUsd: number;
  orderId: string;
  ipnUrl: string;
  successUrl: string;
  cancelUrl: string;
}): Promise<CryptoInvoice> {
  const res = await fetch(`${BASE}/invoice`, {
    method: "POST",
    headers: {
      "x-api-key": process.env.NOWPAYMENTS_API_KEY!,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      price_amount: opts.amountUsd,
      price_currency: "usd",
      order_id: opts.orderId,
      order_description: `${BRAND_NAME} deposit`,
      ipn_callback_url: opts.ipnUrl,
      success_url: opts.successUrl,
      cancel_url: opts.cancelUrl,
    }),
    cache: "no-store",
  });
  const json = await res.json().catch(() => ({}));
  if (!json.invoice_url) {
    throw new Error(json.message || "Could not start the crypto payment.");
  }
  return { id: String(json.id), invoice_url: json.invoice_url };
}

// NOWPayments signs IPNs: HMAC-SHA512 of the JSON body with keys sorted
// recursively, using the IPN secret.
function sortDeep(value: any): any {
  if (Array.isArray(value)) return value.map(sortDeep);
  if (value && typeof value === "object") {
    return Object.keys(value)
      .sort()
      .reduce((acc: Record<string, any>, k) => {
        acc[k] = sortDeep(value[k]);
        return acc;
      }, {});
  }
  return value;
}

export function verifyIpnSignature(rawBody: string, signature: string | null): boolean {
  const ipnSecret = process.env.NOWPAYMENTS_IPN_SECRET;
  if (!ipnSecret || !signature) return false;
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawBody);
  } catch {
    return false;
  }
  const sorted = JSON.stringify(sortDeep(parsed));
  const hmac = createHmac("sha512", ipnSecret).update(sorted).digest("hex");
  return hmac === signature;
}
