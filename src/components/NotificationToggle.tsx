"use client";

import { useEffect, useState } from "react";
import { Bell, BellOff, BellRing } from "lucide-react";

function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const b64 = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(b64);
  const arr = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i);
  return arr;
}

// Per-device push notifications toggle. Hides entirely if the server has no
// VAPID keys configured or the browser doesn't support push.
export function NotificationToggle() {
  const [supported, setSupported] = useState(false);
  const [configured, setConfigured] = useState(false);
  const [publicKey, setPublicKey] = useState("");
  const [subscribed, setSubscribed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    const ok = typeof window !== "undefined" && "serviceWorker" in navigator && "PushManager" in window;
    setSupported(ok);
    if (!ok) return;
    fetch("/api/push/subscribe")
      .then((r) => r.json())
      .then((j) => {
        setConfigured(!!j.configured);
        setPublicKey(j.publicKey || "");
      })
      .catch(() => {});
    navigator.serviceWorker.ready
      .then((reg) => reg.pushManager.getSubscription())
      .then((sub) => setSubscribed(!!sub))
      .catch(() => {});
  }, []);

  if (!supported || !configured) return null;

  async function enable() {
    setBusy(true);
    setMsg(null);
    try {
      const perm = await Notification.requestPermission();
      if (perm !== "granted") {
        setMsg("Notifications are blocked in your browser settings.");
        return;
      }
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey) as unknown as BufferSource,
      });
      const res = await fetch("/api/push/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subscription: sub.toJSON() }),
      });
      if (res.ok) {
        setSubscribed(true);
        setMsg("Notifications on — we'll ping you on deposits and wins.");
      } else {
        setMsg("Could not enable. Try again.");
      }
    } catch {
      setMsg("Could not enable notifications.");
    } finally {
      setBusy(false);
    }
  }

  async function disable() {
    setBusy(true);
    setMsg(null);
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        await fetch("/api/push/subscribe", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ endpoint: sub.endpoint }),
        }).catch(() => {});
        await sub.unsubscribe().catch(() => {});
      }
      setSubscribed(false);
      setMsg("Notifications off.");
    } catch {
      /* ignore */
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card flex flex-wrap items-center justify-between gap-3 p-4">
      <div className="flex items-center gap-3">
        <span className={`flex h-9 w-9 items-center justify-center rounded-full ${subscribed ? "bg-brand/15 text-brand" : "bg-surface2 text-muted"}`}>
          {subscribed ? <BellRing className="h-4 w-4" /> : <Bell className="h-4 w-4" />}
        </span>
        <div>
          <div className="text-sm font-bold">Push notifications</div>
          <div className="text-[11px] text-muted">
            {msg || "Get alerts for deposits, wins and payouts — even when the app is closed."}
          </div>
        </div>
      </div>
      {subscribed ? (
        <button onClick={disable} disabled={busy} className="btn btn-ghost px-4 py-2 text-sm">
          <BellOff className="h-4 w-4" /> Turn off
        </button>
      ) : (
        <button onClick={enable} disabled={busy} className="btn btn-brand px-4 py-2 text-sm">
          <Bell className="h-4 w-4" /> {busy ? "…" : "Enable"}
        </button>
      )}
    </div>
  );
}
