import { NextResponse } from "next/server";
import {
  adminPasswordConfigured,
  checkAdminPassword,
  createAdminSession,
  clearAdminSession,
  isAdmin,
} from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET -> is the current visitor an authenticated admin? (+ whether a password is set)
export async function GET() {
  return NextResponse.json({
    authed: await isAdmin(),
    configured: adminPasswordConfigured(),
  });
}

// POST { password } -> sign in. POST { logout: true } -> sign out.
export async function POST(req: Request) {
  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  if (body?.logout) {
    clearAdminSession();
    return NextResponse.json({ ok: true });
  }

  if (!adminPasswordConfigured()) {
    return NextResponse.json(
      {
        error:
          "Admin panel is not enabled. Set ADMIN_PANEL_PASSWORD in your environment.",
      },
      { status: 503 }
    );
  }

  if (!checkAdminPassword(String(body?.password || ""))) {
    return NextResponse.json({ error: "Incorrect password." }, { status: 401 });
  }

  await createAdminSession();
  return NextResponse.json({ ok: true });
}
