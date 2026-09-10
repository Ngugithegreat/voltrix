// Collecto (cissytech) — Uganda mobile money (MTN / Airtel) deposits.
//
// IMPORTANT operational notes (from the AbePay integration):
//  • Collecto's API key is locked to ONE whitelisted server IP. Vercel has
//    rotating egress IPs, so calls must go through a fixed-IP RELAY that holds
//    the x-api-key. Point COLLECTO_BASE_URL at the relay and set
//    COLLECTO_RELAY_SECRET; DON'T put COLLECTO_API_KEY in Vercel.
//    (Direct mode with COLLECTO_API_KEY is supported for a whitelisted host.)
//  • There are NO reliable webhooks — we POLL requestToPayStatus.
//  • Referer + User-Agent headers are required or the WAF rejects the request.
//  • The account username is case-sensitive and part of the URL path.
//  • Verify the exact requestToPay field names against your working AbePay
//    `collecto.ts` if a request is rejected — cissytech's docs differ from live.

import { BRAND_NAME } from "./brand";

const DEFAULT_BASE = "https://collecto.cissytech.com/api";

function base(): string {
  return (process.env.COLLECTO_BASE_URL || DEFAULT_BASE).replace(/\/$/, "");
}
function username(): string {
  return process.env.COLLECTO_USERNAME || "";
}

export function isCollectoConfigured(): boolean {
  const hasAuth =
    !!process.env.COLLECTO_RELAY_SECRET || !!process.env.COLLECTO_API_KEY;
  return !!(username() && hasAuth);
}

export function usdUgxRate(): number {
  const r = Number(process.env.USD_UGX_RATE);
  return Number.isFinite(r) && r > 0 ? r : 3750;
}

/** USD cents -> whole UGX. */
export function centsToUgx(cents: number): number {
  return Math.max(500, Math.round((cents / 100) * usdUgxRate()));
}

/** Normalise a Ugandan number to 2567XXXXXXXX. Returns null if invalid. */
export function normalizeUgPhone(input: string): string | null {
  let p = String(input).trim().replace(/[\s+\-()]/g, "");
  if (p.startsWith("0")) p = "256" + p.slice(1);
  else if (p.startsWith("7") && p.length === 9) p = "256" + p;
  else if (p.startsWith("256")) {
    /* ok */
  } else return null;
  return /^256\d{9}$/.test(p) ? p : null;
}

async function call<T = any>(endpoint: string, body: unknown): Promise<T> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Accept: "application/json",
    Referer: (process.env.PUBLIC_BASE_URL || "https://voltrix.vercel.app") + "/",
    "User-Agent": "Voltrix/1.0 (+https://voltrix.vercel.app)",
  };
  if (process.env.COLLECTO_RELAY_SECRET) {
    headers["x-relay-secret"] = process.env.COLLECTO_RELAY_SECRET;
  } else if (process.env.COLLECTO_API_KEY) {
    headers["x-api-key"] = process.env.COLLECTO_API_KEY;
  }

  const res = await fetch(`${base()}/${username()}/${endpoint}`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
    cache: "no-store",
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(json?.message || `Collecto ${endpoint} failed (${res.status})`);
  }
  return json as T;
}

export type CollectoGateway = "mtn" | "airtel";

/** Initiate a mobile-money collection (prompts the customer's phone). */
export async function requestToPay(opts: {
  amountUgx: number;
  phone: string; // 2567...
  reference: string;
  gateway: CollectoGateway;
}): Promise<any> {
  return call("requestToPay", {
    amount: opts.amountUgx,
    phone: opts.phone,
    reference: opts.reference,
    gateway: opts.gateway,
    reason: `${BRAND_NAME} deposit`,
  });
}

/** Status is looked up by OUR reference. Returns an UPPERCASE status string. */
export async function requestToPayStatus(reference: string): Promise<string> {
  const res = await call<any>("requestToPayStatus", { reference });
  // Collections nest the outcome under `data.status`.
  const raw =
    res?.data?.status ?? res?.data?.data?.status ?? res?.status ?? "PENDING";
  return String(raw).toUpperCase();
}

export function isSuccess(status: string): boolean {
  return ["SUCCESS", "SUCCESSFUL", "COMPLETE", "COMPLETED"].includes(status);
}
export function isFailure(status: string): boolean {
  return ["FAILED", "FAILURE", "CANCELLED", "REJECTED", "EXPIRED"].includes(status);
}
