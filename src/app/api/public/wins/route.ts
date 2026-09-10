import { NextResponse } from "next/server";
import { db, ensureSchema, hasDb } from "@/lib/db";
import { marketBySymbol } from "@/lib/markets";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Public recent wins for the landing-page ticker (social proof). Real account
// names are never exposed — each win is shown under a randomly-assigned display
// name so the ticker looks like a busy, varied trader base (and isn't just the
// one account currently testing).
const FIRST_NAMES = [
  "James", "Grace", "David", "Mary", "Peter", "Faith", "John", "Esther", "Brian",
  "Wanjiku", "Kevin", "Aisha", "Samuel", "Joy", "Michael", "Naomi", "Daniel",
  "Cynthia", "Emmanuel", "Mercy", "Victor", "Lucy", "Collins", "Sarah", "Dennis",
  "Ruth", "George", "Diana", "Anthony", "Sharon", "Felix", "Purity", "Kelvin",
  "Ann", "Stephen", "Caroline", "Isaac", "Beatrice", "Patrick", "Linda",
];
const INITIALS = "ABCDEFGHIJKLMNOPRSTWMK".split("");

function randomName(): string {
  const f = FIRST_NAMES[Math.floor(Math.random() * FIRST_NAMES.length)];
  const i = INITIALS[Math.floor(Math.random() * INITIALS.length)];
  return `${f} ${i}.`;
}

export async function GET() {
  if (!hasDb()) return NextResponse.json({ wins: [] });
  try {
    await ensureSchema();
    const sql = db();
    const rows = (await sql`
      SELECT t.payout, t.stake, t.symbol, u.name
      FROM voltrix_trades t
      JOIN voltrix_users u ON u.id = t.user_id
      WHERE t.status = 'won' AND t.is_demo = false AND t.payout > t.stake
      ORDER BY t.settled_at DESC NULLS LAST
      LIMIT 24
    `) as Array<{ payout: number | string; stake: number | string; symbol: string; name: string }>;

    const wins = rows.map((r) => ({
      name: randomName(),
      profitCents: Number(r.payout) - Number(r.stake),
      market: marketBySymbol(r.symbol)?.short ?? r.symbol,
    }));
    return NextResponse.json({ wins });
  } catch {
    return NextResponse.json({ wins: [] });
  }
}
