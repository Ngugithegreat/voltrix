import { NextResponse } from "next/server";
import { db, ensureSchema } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { settleTrade, TradeRow } from "@/lib/trades";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

// Settle a single trade (called by the client when a contract's timer expires).
// Server re-checks expiry and outcome against the real feed, so this can't be
// gamed — it's just a nudge to settle promptly.
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
    SELECT * FROM voltrix_trades WHERE id = ${id} AND user_id = ${session.id} LIMIT 1
  `) as TradeRow[];

  if (!rows.length) {
    return NextResponse.json({ error: "Trade not found." }, { status: 404 });
  }

  try {
    const settled = await settleTrade(rows[0]);
    // Return the balance for the account the trade belongs to (demo trades settle
    // into demo_balance) so the client updates the right wallet.
    const bal = (await sql`SELECT balance, demo_balance FROM voltrix_users WHERE id = ${session.id}`) as any[];
    return NextResponse.json({
      ok: true,
      trade: settled,
      balance: Number(rows[0].is_demo ? bal[0]?.demo_balance ?? 0 : bal[0]?.balance ?? 0),
    });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || "Could not settle yet." },
      { status: 503 }
    );
  }
}
