// Transactional email via Resend (https://resend.com). No SDK needed — a single
// authenticated fetch to their REST API works in the Vercel serverless runtime.
//
// Required env:  RESEND_API_KEY
// Optional env:  EMAIL_FROM   (default "${BRAND_NAME} <noreply@novatraders.site>")
//                PUBLIC_BASE_URL (used to build links; default novatraders.site)
//
// If RESEND_API_KEY isn't set, sends are a safe no-op so signup/reset still work
// before the DNS + key setup is finished.

import { BRAND_NAME, BRAND_HEX_DARK } from "./brand";

const RESEND_ENDPOINT = "https://api.resend.com/emails";

export function isEmailConfigured(): boolean {
  return !!process.env.RESEND_API_KEY;
}

export function emailFrom(): string {
  return (process.env.EMAIL_FROM || `${BRAND_NAME} <noreply@novatraders.site>`).trim();
}

export function siteUrl(): string {
  const base = process.env.PUBLIC_BASE_URL || "https://novatraders.site";
  return base.replace(/\/$/, "");
}

type SendResult = { ok: boolean; skipped?: boolean; error?: string };

/** Send an email. Never throws — returns {ok:false} on failure so callers can fire-and-forget. */
export async function sendEmail(opts: {
  to: string;
  subject: string;
  html: string;
  text?: string;
}): Promise<SendResult> {
  const key = process.env.RESEND_API_KEY;
  if (!key) return { ok: false, skipped: true };
  try {
    const res = await fetch(RESEND_ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key.trim()}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: emailFrom(),
        to: [opts.to],
        subject: opts.subject,
        html: opts.html,
        ...(opts.text ? { text: opts.text } : {}),
      }),
      cache: "no-store",
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      return { ok: false, error: `Resend ${res.status}: ${body.slice(0, 200)}` };
    }
    return { ok: true };
  } catch (e: any) {
    return { ok: false, error: e?.message || "send failed" };
  }
}

/* ------------------------- Branded HTML template ------------------------- */

const BRAND = BRAND_HEX_DARK;

function shell(inner: string): string {
  // Light template — renders consistently across every email client (dark-mode
  // clients don't repaint a light email), so it always looks like a normal email.
  return `<!doctype html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light only"><meta name="supported-color-schemes" content="light only"></head>
<body style="margin:0;background:#f4f5f7;padding:24px 12px;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;margin:0 auto;background:#ffffff;border:1px solid #e6e8ee;border-radius:16px;overflow:hidden;">
    <tr><td style="padding:22px 28px;border-bottom:1px solid #eef0f4;">
      <table role="presentation" cellpadding="0" cellspacing="0"><tr>
        <td style="vertical-align:middle;"><img src="${siteUrl()}/apple-icon" width="32" height="32" alt="${BRAND_NAME}" style="display:block;border-radius:8px;"></td>
        <td style="vertical-align:middle;padding-left:10px;font-size:18px;font-weight:700;color:#0f1116;letter-spacing:-0.02em;">${BRAND_NAME}</td>
      </tr></table>
    </td></tr>
    <tr><td style="padding:26px 28px 28px;color:#3f4658;font-size:15px;line-height:1.6;">
      ${inner}
    </td></tr>
    <tr><td style="padding:16px 28px;border-top:1px solid #eef0f4;color:#8a90a0;font-size:12px;line-height:1.6;">
      ${BRAND_NAME} · <a href="${siteUrl()}" style="color:${BRAND};text-decoration:none;">${siteUrl().replace(/^https?:\/\//, "")}</a><br>
      Trading volatility indices carries risk. Only trade what you can afford to lose.
    </td></tr>
  </table>
</body></html>`;
}

function button(label: string, url: string): string {
  return `<a href="${url}" style="display:inline-block;background:${BRAND};color:#ffffff;text-decoration:none;font-weight:600;font-size:15px;padding:12px 22px;border-radius:12px;">${label}</a>`;
}

export function welcomeEmail(name: string): { subject: string; html: string; text: string } {
  const first = (name || "there").split(" ")[0];
  const url = `${siteUrl()}/trade`;
  const html = shell(
    `<h1 style="margin:0 0 12px;color:#0f1116;font-size:22px;">Welcome to ${BRAND_NAME}, ${first} 👋</h1>
     <p style="margin:0 0 16px;">Your account is live. You can trade Volatility Indices with instant deposits and withdrawals — Rise/Fall, Digits and Multipliers, all on the real live feed.</p>
     <p style="margin:0 0 22px;">${button("Start trading", url)}</p>
     <p style="margin:0;color:#8a90a0;font-size:13px;">Need help? Just reply to this email.</p>`
  );
  const text = `Welcome to ${BRAND_NAME}, ${first}! Your account is live. Start trading at ${url}`;
  return { subject: `Welcome to ${BRAND_NAME} 🎉`, html, text };
}

export function depositReceiptEmail(
  name: string,
  usd: number,
  method: string
): { subject: string; html: string; text: string } {
  const first = (name || "there").split(" ")[0];
  const amt = `$${usd.toFixed(2)}`;
  const url = `${siteUrl()}/trade`;
  const html = shell(
    `<h1 style="margin:0 0 12px;color:#0f1116;font-size:22px;">Deposit confirmed ✅</h1>
     <p style="margin:0 0 16px;">Hi ${first}, we've credited <b style="color:#0BA66D;">${amt}</b> to your ${BRAND_NAME} balance via ${method}. It's ready to trade.</p>
     <p style="margin:0 0 22px;">${button("Go to the terminal", url)}</p>
     <p style="margin:0;color:#8a90a0;font-size:13px;">If this wasn't you, contact support immediately.</p>`
  );
  return { subject: `Deposit confirmed — ${amt}`, html, text: `Your ${BRAND_NAME} deposit of ${amt} via ${method} is confirmed and ready to trade.` };
}

export function withdrawalReceiptEmail(
  name: string,
  usd: number,
  destination: string
): { subject: string; html: string; text: string } {
  const first = (name || "there").split(" ")[0];
  const amt = `$${usd.toFixed(2)}`;
  const html = shell(
    `<h1 style="margin:0 0 12px;color:#0f1116;font-size:22px;">Withdrawal request received</h1>
     <p style="margin:0 0 16px;">Hi ${first}, we've received your request to withdraw <b>${amt}</b> to <b>${destination}</b>. We're processing it now — most withdrawals complete within minutes.</p>
     <p style="margin:0;color:#8a90a0;font-size:13px;">You'll get another note once it's sent. Didn't request this? Contact support right away.</p>`
  );
  return { subject: `Withdrawal request received — ${amt}`, html, text: `We received your ${BRAND_NAME} withdrawal request of ${amt} to ${destination}. Processing now.` };
}

export function kycApprovedEmail(name: string): { subject: string; html: string; text: string } {
  const first = (name || "there").split(" ")[0];
  const url = `${siteUrl()}/wallet`;
  const html = shell(
    `<h1 style="margin:0 0 12px;color:#0f1116;font-size:22px;">You're verified ✅</h1>
     <p style="margin:0 0 16px;">Good news, ${first} — your identity has been verified. You can now withdraw any amount from your ${BRAND_NAME} account.</p>
     <p style="margin:0 0 4px;">${button("Go to your wallet", url)}</p>`
  );
  return { subject: `Your ${BRAND_NAME} account is verified`, html, text: "Your identity has been verified — you can now make large withdrawals." };
}

export function kycRejectedEmail(name: string, reason: string): { subject: string; html: string; text: string } {
  const first = (name || "there").split(" ")[0];
  const url = `${siteUrl()}/wallet`;
  const why = reason && reason.trim() ? reason.trim() : "The details couldn't be verified.";
  const html = shell(
    `<h1 style="margin:0 0 12px;color:#0f1116;font-size:22px;">Verification needs another look</h1>
     <p style="margin:0 0 12px;">Hi ${first}, we couldn't verify your account this time.</p>
     <p style="margin:0 0 16px;padding:10px 14px;border-left:3px solid #e5484d;background:#fdecee;color:#b4232a;border-radius:6px;">${why}</p>
     <p style="margin:0 0 16px;">You can update your details and resubmit anytime.</p>
     <p style="margin:0 0 4px;">${button("Resubmit verification", url)}</p>`
  );
  return { subject: `Action needed: verify your ${BRAND_NAME} account`, html, text: `Your verification was not approved: ${why}` };
}

export function referralEarnedEmail(
  name: string,
  usd: number,
  friend: string
): { subject: string; html: string; text: string } {
  const first = (name || "there").split(" ")[0];
  const amt = `$${usd.toFixed(2)}`;
  const url = `${siteUrl()}/wallet`;
  const html = shell(
    `<h1 style="margin:0 0 12px;color:#0f1116;font-size:22px;">You earned a referral reward 🎉</h1>
     <p style="margin:0 0 16px;">Nice one, ${first}! <b>${(friend || "Someone you referred").split(" ")[0]}</b> just made their first deposit, so we've added <b style="color:#0BA66D;">${amt}</b> to your ${BRAND_NAME} balance.</p>
     <p style="margin:0 0 22px;">${button("View your balance", url)}</p>
     <p style="margin:0;color:#8a90a0;font-size:13px;">Keep sharing your link to earn more.</p>`
  );
  return { subject: `You earned ${amt} in referral rewards`, html, text: `${friend} made their first deposit — you earned ${amt} on ${BRAND_NAME}.` };
}

export function verifyEmailOtp(name: string, code: string): { subject: string; html: string; text: string } {
  const first = (name || "there").split(" ")[0];
  const html = shell(
    `<h1 style="margin:0 0 12px;color:#0f1116;font-size:22px;">Confirm your email</h1>
     <p style="margin:0 0 16px;">Hi ${first}, enter this code in ${BRAND_NAME} to verify your email address:</p>
     <div style="margin:0 0 18px;text-align:center;">
       <span style="display:inline-block;font-size:34px;font-weight:800;letter-spacing:10px;color:#0f1116;background:#f4f5f7;border:1px solid #e6e8ee;border-radius:12px;padding:14px 20px;">${code}</span>
     </div>
     <p style="margin:0;color:#8a90a0;font-size:13px;">This code expires in 10 minutes. If you didn't create a ${BRAND_NAME} account, you can ignore this email.</p>`
  );
  const text = `Your ${BRAND_NAME} verification code is ${code}. It expires in 10 minutes.`;
  return { subject: `Your ${BRAND_NAME} code: ${code}`, html, text };
}

export function resetPasswordEmail(name: string, link: string): { subject: string; html: string; text: string } {
  const first = (name || "there").split(" ")[0];
  const html = shell(
    `<h1 style="margin:0 0 12px;color:#0f1116;font-size:22px;">Reset your password</h1>
     <p style="margin:0 0 16px;">Hi ${first}, we got a request to reset your ${BRAND_NAME} password. Click below to choose a new one — this link expires in 1 hour.</p>
     <p style="margin:0 0 22px;">${button("Reset password", link)}</p>
     <p style="margin:0 0 8px;color:#8a90a0;font-size:13px;">If the button doesn't work, paste this link into your browser:</p>
     <p style="margin:0 0 16px;word-break:break-all;color:${BRAND};font-size:13px;">${link}</p>
     <p style="margin:0;color:#8a90a0;font-size:13px;">Didn't request this? You can safely ignore this email — your password won't change.</p>`
  );
  const text = `Reset your ${BRAND_NAME} password (expires in 1 hour): ${link}`;
  return { subject: `Reset your ${BRAND_NAME} password`, html, text };
}
