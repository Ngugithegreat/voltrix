import webpush from "web-push";
import { db } from "./db";

// Web Push. All sends are no-ops unless VAPID keys are configured, so this is
// safe to wire into events before the keys are set in the environment.
//
// Required env to activate:  VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY
// Optional:                  VAPID_SUBJECT (default mailto:support@novatraders.site)

let configured = false;

export function isPushConfigured(): boolean {
  return !!(process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY);
}

export function vapidPublicKey(): string {
  return process.env.VAPID_PUBLIC_KEY || "";
}

function ensureVapid(): boolean {
  if (!isPushConfigured()) return false;
  if (!configured) {
    webpush.setVapidDetails(
      process.env.VAPID_SUBJECT || "mailto:support@novatraders.site",
      process.env.VAPID_PUBLIC_KEY!,
      process.env.VAPID_PRIVATE_KEY!
    );
    configured = true;
  }
  return true;
}

export type PushPayload = { title: string; body: string; url?: string };

/** Send a push to every device the user has subscribed. Best-effort, never throws. */
export async function sendPushToUser(userId: number, payload: PushPayload): Promise<void> {
  if (!ensureVapid()) return;
  try {
    const sql = db();
    const subs = (await sql`
      SELECT endpoint, p256dh, auth FROM voltrix_push_subs WHERE user_id = ${userId}
    `) as Array<{ endpoint: string; p256dh: string; auth: string }>;
    if (!subs.length) return;
    const body = JSON.stringify(payload);
    await Promise.all(
      subs.map(async (s) => {
        try {
          await webpush.sendNotification(
            { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
            body
          );
        } catch (e: any) {
          // Expired/invalid subscription — drop it.
          if (e?.statusCode === 404 || e?.statusCode === 410) {
            await sql`DELETE FROM voltrix_push_subs WHERE endpoint = ${s.endpoint}`.catch(() => {});
          }
        }
      })
    );
  } catch {
    /* never block the caller */
  }
}
