import { NextResponse } from "next/server";
import { randomBytes, createHash } from "crypto";
import { db, ensureSchema } from "@/lib/db";
import { sendEmail, resetPasswordEmail, siteUrl } from "@/lib/email";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Always returns a generic success so it never reveals whether an email is
// registered (prevents account enumeration).
export async function POST(req: Request) {
  let email = "";
  try {
    ({ email } = await req.json());
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
  const clean = String(email || "").trim().toLowerCase();

  const generic = NextResponse.json({
    ok: true,
    message: "If that email has an account, a reset link is on its way.",
  });

  if (!clean || !clean.includes("@")) return generic;

  try {
    await ensureSchema();
    const sql = db();
    const rows = (await sql`
      SELECT id, name, email FROM voltrix_users WHERE email = ${clean} LIMIT 1
    `) as Array<{ id: number; name: string; email: string }>;
    if (!rows.length) return generic;
    const user = rows[0];

    const raw = randomBytes(32).toString("hex");
    const tokenHash = createHash("sha256").update(raw).digest("hex");
    const expires = new Date(Date.now() + 60 * 60 * 1000).toISOString(); // 1 hour

    // Invalidate any earlier outstanding tokens, then store the new one.
    await sql`UPDATE voltrix_password_resets SET used = true WHERE user_id = ${user.id} AND used = false`;
    await sql`
      INSERT INTO voltrix_password_resets (user_id, token_hash, expires_at)
      VALUES (${user.id}, ${tokenHash}, ${expires})
    `;

    const link = `${siteUrl()}/reset-password?token=${raw}`;
    const mail = resetPasswordEmail(user.name, link);
    await sendEmail({ to: user.email, subject: mail.subject, html: mail.html, text: mail.text });
  } catch {
    // Swallow errors — still return the generic response.
  }
  return generic;
}
