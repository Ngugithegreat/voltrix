// SMS via TalkSasa (bulksms.talksasa.com) — the account's live SMS provider.
// Used for signup phone-OTP (Kenya). Configured with TALKSASA_API_TOKEN (the
// Bearer token from the dashboard's Developers page). If it's unset,
// isSmsConfigured() is false and callers skip OTP entirely, so signups are never
// blocked by a missing SMS setup.
//
// API: POST https://bulksms.talksasa.com/api/v3/sms/send
//   headers: Authorization: Bearer <token>, Accept/Content-Type: application/json
//   body: { recipient, sender_id, type: "plain", message }
//   recipient = MSISDN with country code, NO "+" (e.g. 254712345678); comma-
//   separate for multiple. Response: { status: "success" | "error", ... }.

const API_URL = process.env.TALKSASA_API_URL || "https://bulksms.talksasa.com/api/v3/sms/send";

function apiToken(): string | undefined {
  const v = process.env.TALKSASA_API_TOKEN;
  return v && v.trim() ? v.trim() : undefined;
}

// Sender ID: max 11 chars. The account's ACTIVE registered sender ID is
// "TALK-SASA" (confirmed on the TalkSasa dashboard), so default to it.
export function smsSenderId(): string {
  return (process.env.TALKSASA_SENDER_ID || "TALK-SASA").slice(0, 11);
}

export function isSmsConfigured(): boolean {
  return !!apiToken();
}

// TalkSasa wants the MSISDN with country code and NO leading "+".
export function toTalksasaNumber(msisdn: string): string {
  return String(msisdn).replace(/[^\d]/g, "");
}

/** Sends one SMS. Returns { ok } — never throws (transport errors are captured). */
export async function sendSms(to: string, message: string): Promise<{ ok: boolean; error?: string }> {
  const token = apiToken();
  if (!token) return { ok: false, error: "SMS not configured." };

  try {
    const res = await fetch(API_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        recipient: toTalksasaNumber(to),
        sender_id: smsSenderId(),
        type: "plain",
        message,
      }),
      cache: "no-store",
    });
    const json = await res.json().catch(() => ({} as any));
    if (res.ok && String(json?.status).toLowerCase() === "success") return { ok: true };
    const reason = json?.message || json?.data || `HTTP ${res.status}`;
    return { ok: false, error: String(reason) };
  } catch (e: any) {
    return { ok: false, error: e?.message || "Could not reach the SMS provider." };
  }
}
