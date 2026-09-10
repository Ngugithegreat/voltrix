import { NextResponse } from "next/server";
import { db, ensureSchema } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { normalizePhone } from "@/lib/mpesa";
import { verifySignupOtp } from "@/lib/otp";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Finish a verified phone-number change: check the SMS code, then update the
// account's phone. The code was sent to the NEW number, so passing it proves the
// user controls that number.
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
  if (!newPhone) return NextResponse.json({ error: "Enter a valid phone number." }, { status: 400 });

  await ensureSchema();
  const sql = db();

  // Re-check uniqueness at commit time (guards a race between two changes).
  const taken = (await sql`
    SELECT 1 FROM voltrix_users WHERE phone = ${newPhone} AND id <> ${session.id} LIMIT 1
  `) as any[];
  if (taken.length) {
    return NextResponse.json({ error: "That number is already used by another account." }, { status: 409 });
  }

  const v = await verifySignupOtp(newPhone, String(body.code || ""));
  if (!v.ok) {
    return NextResponse.json({ error: v.error || "Verification failed." }, { status: 400 });
  }

  await sql`UPDATE voltrix_users SET phone = ${newPhone} WHERE id = ${session.id}`;
  return NextResponse.json({ ok: true, phone: newPhone });
}
