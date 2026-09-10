import { NextResponse } from "next/server";
import { db, ensureSchema } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { accountNo } from "@/lib/format";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Profile details + lifetime stats for the signed-in user (real account).
export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  await ensureSchema();
  const sql = db();

  const rows = (await sql`
    SELECT
      u.id, u.name, u.email, u.phone, u.country, u.created_at, u.balance,
      COALESCE((SELECT SUM(amount) FROM voltrix_transactions
                 WHERE user_id = u.id AND type='deposit' AND status='completed' AND is_demo=false),0) AS deposited,
      COALESCE((SELECT SUM(-amount) FROM voltrix_transactions
                 WHERE user_id = u.id AND type='withdrawal' AND status<>'rejected' AND is_demo=false),0) AS withdrawn,
      COALESCE((SELECT COUNT(*) FROM voltrix_trades WHERE user_id = u.id AND status<>'open' AND is_demo=false),0) AS trades,
      COALESCE((SELECT COUNT(*) FROM voltrix_trades WHERE user_id = u.id AND status='won' AND is_demo=false),0) AS wins,
      COALESCE((SELECT SUM(CASE WHEN status='won' THEN payout - stake WHEN status='lost' THEN -stake ELSE 0 END)
                 FROM voltrix_trades WHERE user_id = u.id AND status<>'open' AND is_demo=false),0) AS pnl
    FROM voltrix_users u WHERE u.id = ${session.id} LIMIT 1
  `) as any[];

  const u = rows[0];
  if (!u) return NextResponse.json({ error: "Not found." }, { status: 404 });
  const n = (v: any) => Number(v ?? 0);

  return NextResponse.json({
    profile: {
      name: u.name,
      email: u.email,
      phone: u.phone || null,
      country: u.country || null,
      account_no: accountNo(u.id),
      created_at: u.created_at,
      balance: n(u.balance),
      deposited: n(u.deposited),
      withdrawn: n(u.withdrawn),
      trades: n(u.trades),
      wins: n(u.wins),
      pnl: n(u.pnl),
    },
  });
}
