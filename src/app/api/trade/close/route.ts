import { NextResponse } from "next/server";
import { db, ensureSchema } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { closeMultiplier, TradeRow } from "@/lib/trades";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

// Close an open multiplier position at the current real market price.
export async function POST(req: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
  const id = Number(body.id);
  if (!Number.isFinite(id)) {
    return NextResponse.json({ error: "Missing trade id." }, { status: 400 });
  }

  await ensureSchema();
  const sql = db();
  const rows = (await sql`
    SELECT * FROM voltrix_trades
    WHERE id = ${id} AND user_id = ${session.id} AND kind = 'mult' AND status = 'open'
    LIMIT 1
  `) as TradeRow[];

  if (!rows.length) {
    return NextResponse.json({ error: "Position not found or already closed." }, { status: 404 });
  }

  try {
    const settled = await closeMultiplier(rows[0]);
    // Return the balance for the ACCOUNT the trade belongs to (demo funds live in
    // demo_balance) so the client updates the right wallet.
    const bal = (await sql`SELECT balance, demo_balance FROM voltrix_users WHERE id = ${session.id}`) as any[];
    return NextResponse.json({
      ok: true,
      trade: settled,
      balance: Number(rows[0].is_demo ? bal[0]?.demo_balance ?? 0 : bal[0]?.balance ?? 0),
    });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || "Couldn't reach the price feed. Try again." },
      { status: 503 }
    );
  }
}
