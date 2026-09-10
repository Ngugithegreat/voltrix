import { NextResponse } from "next/server";
import { currentUser } from "@/lib/auth";
import { hasDb } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  if (!hasDb()) {
    return NextResponse.json({ user: null, configured: false });
  }
  try {
    const user = await currentUser();
    return NextResponse.json({ user, configured: true });
  } catch {
    return NextResponse.json({ user: null, configured: true });
  }
}
