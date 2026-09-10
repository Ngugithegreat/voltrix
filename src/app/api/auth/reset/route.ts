import { NextResponse } from "next/server";
import { createHash } from "crypto";
import { db, ensureSchema } from "@/lib/db";
import { hashPassword } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  let token = "";
  let password = "";
  try {
    ({ token, password } = await req.json());
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  token = String(token || "").trim();
  password = String(password || "");
  if (!token) {
    return NextResponse.json({ error: "Missing reset token." }, { status: 400 });
  }
  if (password.length < 6) {
    return NextResponse.json({ error: "Password must be at least 6 characters." }, { status: 400 });
  }

  await ensureSchema();
  const sql = db();
  const tokenHash = createHash("sha256").update(token).digest("hex");

  const rows = (await sql`
    SELECT id, user_id FROM voltrix_password_resets
    WHERE token_hash = ${tokenHash} AND used = false AND expires_at > now()
    LIMIT 1
  `) as Array<{ id: number; user_id: number }>;

  if (!rows.length) {
    return NextResponse.json(
      { error: "This reset link is invalid or has expired. Request a new one." },
      { status: 400 }
    );
  }
  const { id, user_id } = rows[0];

  const hash = await hashPassword(password);
  await sql`UPDATE voltrix_users SET password_hash = ${hash} WHERE id = ${user_id}`;
  // Single-use: burn this token and any other outstanding ones for the user.
  await sql`UPDATE voltrix_password_resets SET used = true WHERE user_id = ${user_id}`;
  void id;

  return NextResponse.json({ ok: true, message: "Password updated. You can now sign in." });
}
