import { NextResponse } from "next/server";
import { db, ensureSchema } from "@/lib/db";
import { verifyPassword, createSession } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const { email, password } = await req.json();
    if (!email || !password) {
      return NextResponse.json({ error: "Email and password are required." }, { status: 400 });
    }
    const cleanEmail = String(email).trim().toLowerCase();

    await ensureSchema();
    const sql = db();
    const rows = (await sql`
      SELECT id, email, name, role, password_hash FROM voltrix_users WHERE email = ${cleanEmail} LIMIT 1
    `) as any[];

    if (!rows.length) {
      return NextResponse.json({ error: "Invalid email or password." }, { status: 401 });
    }
    const user = rows[0];
    const ok = await verifyPassword(String(password), user.password_hash);
    if (!ok) {
      return NextResponse.json({ error: "Invalid email or password." }, { status: 401 });
    }

    await createSession({
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
    });

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Something went wrong." }, { status: 500 });
  }
}
