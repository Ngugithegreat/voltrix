import { NextResponse } from "next/server";
import { ensureSchema, db } from "@/lib/db";
import { otpRequiredFor, sendSignupOtp } from "@/lib/otp";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Step 1 of signup for OTP countries (Kenya). The client calls this before
// creating the account. If OTP isn't required (SMS not configured, or the
// country isn't in the OTP list) we say so and the client proceeds straight to
// register. Otherwise we text a code and the client shows the code step.
export async function POST(req: Request) {
  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const country = String(body.country || "");
  const phone = String(body.phone || "");
  const email = String(body.email || "").trim().toLowerCase();

  if (!otpRequiredFor(country)) {
    return NextResponse.json({ ok: true, required: false });
  }

  await ensureSchema();

  // Don't send a code to a phone/email that already has an account.
  if (email) {
    const sql = db();
    const exists = (await sql`SELECT 1 FROM voltrix_users WHERE email = ${email} LIMIT 1`) as any[];
    if (exists.length) {
      return NextResponse.json({ error: "An account with that email already exists." }, { status: 409 });
    }
  }

  const r = await sendSignupOtp(phone);
  if (!r.ok) {
    return NextResponse.json(
      { error: r.error || "Could not send the code.", retryAfterSec: r.retryAfterSec },
      { status: 400 }
    );
  }
  // Never return the code. Return the normalized phone we texted so the UI can
  // show it (last digits) and verify against the same value.
  return NextResponse.json({ ok: true, required: true, phone: r.phone });
}
