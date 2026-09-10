import { NextResponse } from "next/server";
import { db, ensureSchema } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { isPushConfigured, vapidPublicKey } from "@/lib/push";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// The browser needs the VAPID public key to subscribe.
export async function GET() {
  return NextResponse.json({ configured: isPushConfigured(), publicKey: vapidPublicKey() });
}

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

  let sub: any;
  try {
    sub = (await req.json())?.subscription;
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
  const endpoint = sub?.endpoint;
  const p256dh = sub?.keys?.p256dh;
  const auth = sub?.keys?.auth;
  if (!endpoint || !p256dh || !auth) {
    return NextResponse.json({ error: "Invalid subscription." }, { status: 400 });
  }

  await ensureSchema();
  const sql = db();
  await sql`
    INSERT INTO voltrix_push_subs (endpoint, user_id, p256dh, auth)
    VALUES (${endpoint}, ${session.id}, ${p256dh}, ${auth})
    ON CONFLICT (endpoint) DO UPDATE SET user_id = ${session.id}, p256dh = ${p256dh}, auth = ${auth}
  `;
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  let endpoint: string | undefined;
  try {
    endpoint = (await req.json())?.endpoint;
  } catch {
    /* ignore */
  }
  await ensureSchema();
  const sql = db();
  if (endpoint) {
    await sql`DELETE FROM voltrix_push_subs WHERE endpoint = ${endpoint} AND user_id = ${session.id}`;
  }
  return NextResponse.json({ ok: true });
}
