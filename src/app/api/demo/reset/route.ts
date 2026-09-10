import { NextResponse } from "next/server";
import { db, ensureSchema } from "@/lib/db";
import { getSession } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DEMO_START = 1000000; // $10,000.00 in cents

// Resets the signed-in user's DEMO account: virtual balance back to $10,000 and
// clears their demo trades/history. Never touches the real-money balance.
export async function POST() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

  await ensureSchema();
  const sql = db();

  await sql`DELETE FROM voltrix_trades WHERE user_id = ${session.id} AND is_demo = true`;
  await sql`DELETE FROM voltrix_transactions WHERE user_id = ${session.id} AND is_demo = true`;
  await sql`UPDATE voltrix_users SET demo_balance = ${DEMO_START} WHERE id = ${session.id}`;

  return NextResponse.json({ ok: true, demoBalance: DEMO_START });
}
