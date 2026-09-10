import { createHash } from "crypto";
import { db } from "./db";
import { normalizePhone } from "./mpesa";
import { isSmsConfigured, sendSms } from "./sms";
import { BRAND_NAME } from "./brand";

// Signup phone-OTP. Codes are stored HASHED in voltrix_otps (never plaintext),
// keyed by the normalized phone. 6 digits, 10-min TTL, 60s resend cooldown,
// 5-attempt lock. Enforced only for the countries in OTP_SIGNUP_COUNTRIES
// (default "KE") AND only when SMS is actually configured — so a missing SMS
// setup never blocks signups.

const TTL_MS = 10 * 60 * 1000;
const RESEND_COOLDOWN_MS = 60 * 1000;
const MAX_ATTEMPTS = 5;

function otpCountries(): string[] {
  const raw = process.env.OTP_SIGNUP_COUNTRIES ?? "KE";
  return raw
    .split(",")
    .map((c) => c.trim().toUpperCase())
    .filter(Boolean);
}

/** Is phone-OTP required for a signup from this country right now? */
export function otpRequiredFor(country: string | null | undefined): boolean {
  if (!isSmsConfigured()) return false;
  const c = String(country || "").trim().toUpperCase();
  return otpCountries().includes(c);
}

function hashCode(phone: string, code: string): string {
  return createHash("sha256").update(`${phone}:${code}`).digest("hex");
}

/** Normalizes to the canonical MSISDN we key on (Kenya: 2547XXXXXXXX). */
export function otpNormalize(rawPhone: string): string | null {
  return normalizePhone(rawPhone);
}

export async function sendSignupOtp(
  rawPhone: string
): Promise<{ ok: boolean; phone?: string; error?: string; retryAfterSec?: number }> {
  const phone = normalizePhone(rawPhone);
  if (!phone) return { ok: false, error: "Enter a valid phone number (e.g. 0712345678)." };

  const sql = db();
  const existing = (await sql`
    SELECT last_sent_at FROM voltrix_otps WHERE phone = ${phone} LIMIT 1
  `) as Array<{ last_sent_at: string }>;
  if (existing.length && existing[0].last_sent_at) {
    const since = Date.now() - new Date(existing[0].last_sent_at).getTime();
    if (since < RESEND_COOLDOWN_MS) {
      return { ok: false, phone, error: "Please wait a moment before requesting a new code.", retryAfterSec: Math.ceil((RESEND_COOLDOWN_MS - since) / 1000) };
    }
  }

  const code = String(Math.floor(100000 + Math.random() * 900000)); // 6 digits
  const codeHash = hashCode(phone, code);
  const expiresAt = new Date(Date.now() + TTL_MS).toISOString();

  const sms = await sendSms(phone, `${code} is your ${BRAND_NAME} verification code. It expires in 10 minutes. Do not share it.`);
  if (!sms.ok) return { ok: false, phone, error: sms.error || "Could not send the code. Try again." };

  await sql`
    INSERT INTO voltrix_otps (phone, code_hash, expires_at, attempts, last_sent_at)
    VALUES (${phone}, ${codeHash}, ${expiresAt}, 0, now())
    ON CONFLICT (phone) DO UPDATE
      SET code_hash = ${codeHash}, expires_at = ${expiresAt}, attempts = 0, last_sent_at = now()
  `;
  return { ok: true, phone };
}

export async function verifySignupOtp(
  rawPhone: string,
  code: string
): Promise<{ ok: boolean; error?: string }> {
  const phone = normalizePhone(rawPhone);
  if (!phone) return { ok: false, error: "Enter a valid phone number." };
  const clean = String(code || "").replace(/\D/g, "");
  if (clean.length !== 6) return { ok: false, error: "Enter the 6-digit code." };

  const sql = db();
  const rows = (await sql`
    SELECT code_hash, expires_at, attempts FROM voltrix_otps WHERE phone = ${phone} LIMIT 1
  `) as Array<{ code_hash: string; expires_at: string; attempts: number }>;
  if (!rows.length) return { ok: false, error: "Request a code first." };

  const otp = rows[0];
  if (new Date(otp.expires_at).getTime() < Date.now()) {
    return { ok: false, error: "That code expired. Request a new one." };
  }
  if (Number(otp.attempts) >= MAX_ATTEMPTS) {
    return { ok: false, error: "Too many attempts. Request a new code." };
  }
  if (hashCode(phone, clean) !== otp.code_hash) {
    await sql`UPDATE voltrix_otps SET attempts = attempts + 1 WHERE phone = ${phone}`;
    return { ok: false, error: "Incorrect code. Try again." };
  }

  // Correct — consume it so it can't be reused.
  await sql`DELETE FROM voltrix_otps WHERE phone = ${phone}`;
  return { ok: true };
}
