import { NextResponse } from "next/server";
import { db, ensureSchema } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { normalizePhone } from "@/lib/mpesa";
import { isSmsConfigured } from "@/lib/sms";
import { sendSignupOtp } from "@/lib/otp";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Start a verified phone-number change. Texts a code to the NEW number. When SMS
// isn't configured the change is applied directly (nothing to verify against).
export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const newPhone = normalizePhone(String(body.phone || ""));
  if (!newPhone) {
    return NextResponse.json({ error: "Enter a valid phone number (e.g. 0712345678)." }, { status: 400 });
  }

  await ensureSchema();
  const sql = db();

  const me = (await sql`SELECT phone FROM voltrix_users WHERE id = ${session.id} LIMIT 1`) as Array<{ phone: string | null }>;
  if (me.length && me[0].phone === newPhone) {
    return NextResponse.json({ error: "That’s already your number." }, { status: 400 });
  }

  // A phone can belong to only one account (it authorizes M-Pesa deposits).
  const taken = (await sql`
    SELECT 1 FROM voltrix_users WHERE phone = ${newPhone} AND id <> ${session.id} LIMIT 1
  `) as any[];
  if (taken.length) {
    return NextResponse.json({ error: "That number is already used by another account." }, { status: 409 });
  }

  // No SMS configured → apply the change immediately (can't verify without it).
  if (!isSmsConfigured()) {
    await sql`UPDATE voltrix_users SET phone = ${newPhone} WHERE id = ${session.id}`;
    return NextResponse.json({ ok: true, required: false, updated: true, phone: newPhone });
  }

  const r = await sendSignupOtp(newPhone);
  if (!r.ok) {
    return NextResponse.json({ error: r.error || "Could not send the code.", retryAfterSec: r.retryAfterSec }, { status: 400 });
  }
  return NextResponse.json({ ok: true, required: true, phone: newPhone });
}
