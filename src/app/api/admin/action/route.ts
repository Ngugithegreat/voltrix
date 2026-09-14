import { NextResponse } from "next/server";
import { db, ensureSchema } from "@/lib/db";
import { isAdmin } from "@/lib/auth";
import { setHouseEdge, setReferralPct, setMaxStakeCents, setMaxPayoutCents, setGlobalTest, setGlobalTestPct, setWithdrawDailyCount, setWithdrawDailyMaxCents } from "@/lib/settings";
import { sendEmail, depositReceiptEmail, kycApprovedEmail, kycRejectedEmail } from "@/lib/email";
import { payReferralOnDeposit } from "@/lib/referral";
import { bustAdminCache } from "@/lib/adminCache";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Admin actions: approve/reject pending money requests, plus account &
// house-edge controls.
export async function POST(req: Request) {
  if (!(await isAdmin())) {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
  const action = String(body.action || "");

  await ensureSchema();
  // Any action can change what the dashboard shows — drop the cached snapshot so
  // the next admin load reflects it immediately.
  bustAdminCache();
  const sql = db();

  // ---- House edge (percent, e.g. 5 => 0.05) ----
  if (action === "set_house_edge") {
    const pct = Number(body.percent);
    if (!Number.isFinite(pct) || pct < 0 || pct > 100) {
      return NextResponse.json({ error: "House edge must be between 0 and 100%." }, { status: 400 });
    }
    const edge = await setHouseEdge(pct / 100);
    return NextResponse.json({ ok: true, houseEdge: edge });
  }

  // ---- Referral reward rate (percent, e.g. 10 => 0.10) ----
  if (action === "set_referral_pct") {
    const pct = Number(body.percent);
    if (!Number.isFinite(pct) || pct < 0 || pct > 50) {
      return NextResponse.json({ error: "Referral rate must be between 0 and 50%." }, { status: 400 });
    }
    const rate = await setReferralPct(pct / 100);
    return NextResponse.json({ ok: true, referralPct: rate });
  }

  // ---- Instant-withdrawal daily limits ----
  if (action === "set_withdraw_limits") {
    const count = Math.round(Number(body.count));
    const maxUsd = Number(body.maxUsd);
    if (!Number.isFinite(count) || count < 1 || !Number.isFinite(maxUsd) || maxUsd <= 0) {
      return NextResponse.json({ error: "Enter a valid count and daily max." }, { status: 400 });
    }
    const c = await setWithdrawDailyCount(count);
    const m = await setWithdrawDailyMaxCents(Math.round(maxUsd * 100));
    return NextResponse.json({ ok: true, wdDailyCount: c, wdDailyMaxCents: m });
  }

  // ---- Risk limits (dollars in the request → stored as cents) ----
  if (action === "set_max_stake" || action === "set_max_payout") {
    const usd = Number(body.usd);
    if (!Number.isFinite(usd) || usd <= 0) {
      return NextResponse.json({ error: "Enter a valid amount." }, { status: 400 });
    }
    const cents = Math.round(usd * 100);
    if (action === "set_max_stake") {
      const v = await setMaxStakeCents(cents);
      return NextResponse.json({ ok: true, maxStakeCents: v });
    }
    const v = await setMaxPayoutCents(cents);
    return NextResponse.json({ ok: true, maxPayoutCents: v });
  }

  // ---- Reset the deposit ledger only (so real deposits stand out in testing) ----
  if (action === "reset_deposits") {
    await sql`DELETE FROM voltrix_transactions WHERE type = 'deposit'`;
    return NextResponse.json({ ok: true });
  }

  // Clear out abandoned PENDING deposit requests to declutter the admin. Only
  // deletes pending deposits older than 20 minutes, so a payment still in flight
  // (an STK prompt / hosted checkout the user is completing) is never removed.
  // Completed deposits and all withdrawals are untouched.
  if (action === "clear_pending_deposits") {
    const r = (await sql`
      DELETE FROM voltrix_transactions
      WHERE type = 'deposit' AND status = 'pending'
        AND created_at < now() - interval '20 minutes'
      RETURNING id
    `) as any[];
    return NextResponse.json({ ok: true, cleared: r.length });
  }

  // ---- Global test mode: whole system on simulated data at a set win % ----
  if (action === "set_global_test") {
    const on = !!body.on;
    const pct = Math.min(100, Math.max(0, Math.round(Number(body.pct ?? 50))));
    await setGlobalTest(on);
    await setGlobalTestPct(pct);
    return NextResponse.json({ ok: true, globalTest: on, globalTestPct: pct });
  }

  // ---- Test accounts (QA): enable/disable Force Win/Lose for an email ----
  if (action === "set_test") {
    const email = String(body.email || "").trim().toLowerCase();
    const value = !!body.value;
    const winPct = Math.min(100, Math.max(0, Math.round(Number(body.winPct ?? 50))));
    if (!email) return NextResponse.json({ error: "Enter an email." }, { status: 400 });
    const r = (await sql`
      UPDATE voltrix_users SET is_test = ${value}, test_win_pct = ${winPct}
      WHERE lower(email) = ${email} RETURNING id
    `) as any[];
    if (!r.length) return NextResponse.json({ error: "No account with that email." }, { status: 404 });
    return NextResponse.json({ ok: true });
  }
  if (action === "clear_tests") {
    await sql`UPDATE voltrix_users SET is_test = false WHERE is_test = true`;
    return NextResponse.json({ ok: true });
  }

  // ---- Account controls ----
  if (action === "block_user" || action === "unblock_user") {
    const userId = Number(body.userId);
    if (!Number.isFinite(userId)) {
      return NextResponse.json({ error: "Bad user." }, { status: 400 });
    }
    const status = action === "block_user" ? "blocked" : "active";
    await sql`UPDATE voltrix_users SET status = ${status} WHERE id = ${userId}`;
    return NextResponse.json({ ok: true, status });
  }

  if (action === "toggle_promo") {
    const userId = Number(body.userId);
    const value = !!body.value;
    if (!Number.isFinite(userId)) {
      return NextResponse.json({ error: "Bad user." }, { status: 400 });
    }
    await sql`UPDATE voltrix_users SET promo = ${value} WHERE id = ${userId}`;
    return NextResponse.json({ ok: true, promo: value });
  }

  // Block/allow withdrawals for one account (can still trade & do everything else).
  if (action === "toggle_withdraw_block") {
    const userId = Number(body.userId);
    const value = !!body.value;
    if (!Number.isFinite(userId)) {
      return NextResponse.json({ error: "Bad user." }, { status: 400 });
    }
    await sql`UPDATE voltrix_users SET withdraw_blocked = ${value} WHERE id = ${userId}`;
    return NextResponse.json({ ok: true, withdraw_blocked: value });
  }

  if (action === "grant_bonus") {
    const userId = Number(body.userId);
    const usd = Number(body.amount);
    // OVERWRITE semantics: the entered amount becomes the account's new balance
    // (e.g. a $3,000 balance set to $50 becomes exactly $50). Must be >= 0.
    if (!Number.isFinite(userId) || !Number.isFinite(usd) || usd < 0 || usd > 1000000) {
      return NextResponse.json({ error: "Enter a valid balance amount (0 or more)." }, { status: 400 });
    }
    const newBalance = Math.round(usd * 100); // cents, absolute
    const cur = (await sql`
      SELECT balance FROM voltrix_users WHERE id = ${userId} LIMIT 1
    `) as Array<{ balance: string | number }>;
    if (!cur.length) {
      return NextResponse.json({ error: "User not found." }, { status: 400 });
    }
    const delta = newBalance - Number(cur[0].balance);
    // Set the balance outright and clear any bonus lock (a direct set isn't a
    // wager-locked promo).
    await sql`UPDATE voltrix_users SET balance = ${newBalance}, bonus_locked = 0 WHERE id = ${userId}`;
    // Record the change for the audit trail / ledger consistency.
    if (delta !== 0) {
      await sql`
        INSERT INTO voltrix_transactions (user_id, type, amount, status, method, note)
        VALUES (${userId}, 'adjustment', ${delta}, 'completed', 'promo', 'Balance set by admin')
      `;
    }
    return NextResponse.json({ ok: true, balance: newBalance });
  }

  // ---- KYC verification: approve or reject with a reason ----
  if (action === "kyc_approve" || action === "kyc_reject") {
    const userId = Number(body.userId);
    if (!Number.isFinite(userId)) {
      return NextResponse.json({ error: "Bad user." }, { status: 400 });
    }
    if (action === "kyc_approve") {
      await sql`UPDATE voltrix_users SET kyc_status = 'approved', kyc_reason = NULL WHERE id = ${userId}`;
    } else {
      const reason = String(body.reason || "").trim() || "Your details could not be verified.";
      await sql`UPDATE voltrix_users SET kyc_status = 'rejected', kyc_reason = ${reason} WHERE id = ${userId}`;
    }
    void (async () => {
      try {
        const u = (await sql`SELECT email, name FROM voltrix_users WHERE id = ${userId} LIMIT 1`) as Array<{
          email: string;
          name: string;
        }>;
        if (u.length && u[0].email) {
          const mail =
            action === "kyc_approve"
              ? kycApprovedEmail(u[0].name)
              : kycRejectedEmail(u[0].name, String(body.reason || ""));
          await sendEmail({ to: u[0].email, subject: mail.subject, html: mail.html, text: mail.text });
        }
      } catch {
        /* non-fatal */
      }
    })();
    return NextResponse.json({ ok: true });
  }

  // ---- Approve / reject a pending deposit or withdrawal ----
  const id = Number(body.id);
  if (!Number.isFinite(id) || (action !== "approve" && action !== "reject")) {
    return NextResponse.json({ error: "Bad request." }, { status: 400 });
  }

  // Claim the pending row atomically so it can't be actioned twice.
  const newStatus = action === "approve" ? "completed" : "rejected";
  const claimed = (await sql`
    UPDATE voltrix_transactions SET status = ${newStatus}
    WHERE id = ${id} AND status = 'pending'
    RETURNING *
  `) as any[];

  if (!claimed.length) {
    return NextResponse.json(
      { error: "Already actioned or not found." },
      { status: 409 }
    );
  }
  const tx = claimed[0];
  const amount = Number(tx.amount); // deposits positive, withdrawals negative

  if (tx.type === "deposit" && action === "approve") {
    // Credit the user now.
    await sql`UPDATE voltrix_users SET balance = balance + ${amount} WHERE id = ${tx.user_id}`;
    // Pay referral reward on the user's first deposit (idempotent).
    await payReferralOnDeposit(tx.user_id, amount).catch(() => {});
    // Email receipt (fire-and-forget).
    void (async () => {
      try {
        const u = (await sql`SELECT email, name FROM voltrix_users WHERE id = ${tx.user_id} LIMIT 1`) as Array<{ email: string; name: string }>;
        if (u.length && u[0].email) {
          const mail = depositReceiptEmail(u[0].name, amount / 100, tx.method || "your payment method");
          await sendEmail({ to: u[0].email, subject: mail.subject, html: mail.html, text: mail.text });
        }
      } catch { /* non-fatal */ }
    })();
  } else if (tx.type === "withdrawal" && action === "reject") {
    // Refund the reserved funds (amount is negative, so subtract to add back).
    await sql`UPDATE voltrix_users SET balance = balance - ${amount} WHERE id = ${tx.user_id}`;
  }
  // deposit+reject: nothing was credited, nothing to undo.
  // withdrawal+approve: funds already reserved; admin pays out off-platform.

  return NextResponse.json({ ok: true, transaction: tx });
}
