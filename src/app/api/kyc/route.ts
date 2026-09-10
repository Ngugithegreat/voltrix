import { NextResponse } from "next/server";
import { db, ensureSchema } from "@/lib/db";
import { getSession } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Submit identity details for verification. Sets status to 'pending' for an
// admin to approve/reject. Re-submitting after a rejection is allowed.
export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const name = String(body.name || "").trim();
  const idNumber = String(body.idNumber || "").trim();
  const phone = String(body.phone || "").trim();

  if (name.length < 3) return NextResponse.json({ error: "Enter your full legal name." }, { status: 400 });
  if (idNumber.length < 4) return NextResponse.json({ error: "Enter a valid ID / passport number." }, { status: 400 });
  if (phone.length < 7) return NextResponse.json({ error: "Enter a valid phone number." }, { status: 400 });

  await ensureSchema();
  const sql = db();

  // Don't let an already-approved user reset themselves to pending.
  const cur = (await sql`SELECT kyc_status FROM voltrix_users WHERE id = ${session.id} LIMIT 1`) as Array<{
    kyc_status: string | null;
  }>;
  if (cur.length && cur[0].kyc_status === "approved") {
    return NextResponse.json({ ok: true, status: "approved" });
  }

  await sql`
    UPDATE voltrix_users
    SET kyc_status = 'pending', kyc_name = ${name}, kyc_id_number = ${idNumber},
        kyc_phone = ${phone}, kyc_reason = NULL, kyc_submitted_at = now()
    WHERE id = ${session.id}
  `;

  return NextResponse.json({ ok: true, status: "pending" });
}
