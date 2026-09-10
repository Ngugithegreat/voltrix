import { NextResponse } from "next/server";
import { ensureSchema } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { issueEmailOtp, confirmEmailOtp } from "@/lib/emailVerify";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  await ensureSchema();

  if (body.action === "send") {
    await issueEmailOtp(session.id, session.name, session.email);
    return NextResponse.json({ ok: true, sentTo: session.email });
  }

  if (body.action === "confirm") {
    const code = String(body.code || "").replace(/\D/g, "");
    if (code.length !== 6) return NextResponse.json({ error: "Enter the 6-digit code." }, { status: 400 });
    const ok = await confirmEmailOtp(session.id, code);
    if (!ok) return NextResponse.json({ error: "That code is invalid or expired." }, { status: 400 });
    return NextResponse.json({ ok: true, verified: true });
  }

  return NextResponse.json({ error: "Unknown action." }, { status: 400 });
}
