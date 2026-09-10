import { db } from "./db";
import { getReferralPct, REFERRAL_CAP_CENTS } from "./settings";
import { sendEmail, referralEarnedEmail } from "./email";

// Pays the referrer a share of a referred user's FIRST deposit. Idempotent:
// the reward is claimed via an atomic flip of `referral_rewarded`, so replayed
// webhooks or a second deposit never double-pay. Safe to call on every credited
// deposit — it no-ops unless this is the referred user's first one.
export async function payReferralOnDeposit(
  userId: number,
  depositCents: number
): Promise<void> {
  const sql = db();

  const claimed = (await sql`
    UPDATE voltrix_users SET referral_rewarded = true
    WHERE id = ${userId} AND referred_by IS NOT NULL AND referral_rewarded = false
    RETURNING referred_by, name
  `) as Array<{ referred_by: number; name: string }>;
  if (!claimed.length) return;

  const referrerId = Number(claimed[0].referred_by);
  const refereeName = claimed[0].name || "a friend";
  if (!Number.isFinite(referrerId) || referrerId === userId) return;

  const pct = await getReferralPct();
  const reward = Math.min(REFERRAL_CAP_CENTS, Math.round(depositCents * pct));
  if (reward <= 0) return;

  await sql`UPDATE voltrix_users SET balance = balance + ${reward} WHERE id = ${referrerId}`;
  await sql`
    INSERT INTO voltrix_transactions (user_id, type, amount, status, method, note)
    VALUES (${referrerId}, 'referral', ${reward}, 'completed', 'referral', ${"Referral reward · " + refereeName})
  `;

  // Notify the referrer (fire-and-forget).
  try {
    const r = (await sql`SELECT email, name FROM voltrix_users WHERE id = ${referrerId} LIMIT 1`) as Array<{
      email: string;
      name: string;
    }>;
    if (r.length && r[0].email) {
      const mail = referralEarnedEmail(r[0].name, reward / 100, refereeName);
      await sendEmail({ to: r[0].email, subject: mail.subject, html: mail.html, text: mail.text });
    }
  } catch {
    /* non-fatal */
  }
}

/** Referral stats for a user: how many they've referred and total earned. */
export async function referralStats(
  userId: number
): Promise<{ referredCount: number; earnedCents: number }> {
  const sql = db();
  const rows = (await sql`
    SELECT
      (SELECT COUNT(*) FROM voltrix_users WHERE referred_by = ${userId}) AS referred_count,
      (SELECT COALESCE(SUM(amount), 0) FROM voltrix_transactions
         WHERE user_id = ${userId} AND type = 'referral') AS earned
  `) as Array<{ referred_count: number | string; earned: number | string }>;
  return {
    referredCount: Number(rows[0]?.referred_count ?? 0),
    earnedCents: Number(rows[0]?.earned ?? 0),
  };
}
