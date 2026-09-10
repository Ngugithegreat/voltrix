import crypto from "crypto";
import { db } from "./db";
import { sendEmail, verifyEmailOtp } from "./email";

function hashCode(code: string): string {
  return crypto.createHash("sha256").update(String(code).trim()).digest("hex");
}

/** Generate a 6-digit code, store its hash (10-min TTL) and email it. */
export async function issueEmailOtp(userId: number, name: string, email: string): Promise<void> {
  const sql = db();
  const code = String(crypto.randomInt(100000, 1000000)); // 6 digits, uniform
  await sql`
    UPDATE voltrix_users
    SET email_otp_hash = ${hashCode(code)}, email_otp_expires = now() + interval '10 minutes'
    WHERE id = ${userId}
  `;
  const mail = verifyEmailOtp(name, code);
  await sendEmail({ to: email, subject: mail.subject, html: mail.html, text: mail.text }).catch(() => {});
}

/** Verify a submitted code. Returns true on success and marks the email verified. */
export async function confirmEmailOtp(userId: number, code: string): Promise<boolean> {
  const sql = db();
  const rows = (await sql`
    SELECT email_otp_hash, email_otp_expires FROM voltrix_users WHERE id = ${userId} LIMIT 1
  `) as Array<{ email_otp_hash: string | null; email_otp_expires: string | null }>;
  if (!rows.length) return false;
  const { email_otp_hash, email_otp_expires } = rows[0];
  if (!email_otp_hash || !email_otp_expires) return false;
  if (new Date(email_otp_expires).getTime() < Date.now()) return false;
  if (hashCode(code) !== email_otp_hash) return false;
  await sql`
    UPDATE voltrix_users
    SET email_verified = true, email_otp_hash = NULL, email_otp_expires = NULL
    WHERE id = ${userId}
  `;
  return true;
}
