import NodeWS from "ws";

// Server-side helpers that talk to Deriv's public WebSocket API to get REAL
// prices. Used to (a) stamp a trade's entry price and (b) settle it against the
// tick at/after expiry — so the win/lose outcome is authoritative and can't be
// forged by the browser.

// Deriv's public gateway for symbols/ticks/pricing — no app_id and no auth,
// so it isn't rate-limited by the shared 1089 id from datacenter (Vercel) IPs.
const ENDPOINT = "wss://api.derivws.com/trading/v1/options/ws/public";

export type Tick = { price: number; epoch: number };

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Prefer Node's built-in WebSocket (Node 22+) — it's more reliable inside the
// Vercel/Lambda bundle than the `ws` package. Fall back to `ws` on older Node.
function createSocket(url: string): any {
  const G: any = globalThis as any;
  if (typeof G.WebSocket === "function") return new G.WebSocket(url);
  return new NodeWS(url);
}

async function withRetry<T>(fn: () => Promise<T>, attempts = 2): Promise<T> {
  let lastErr: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (e) {
      lastErr = e;
      if (i < attempts - 1) await sleep(300);
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error("Deriv unavailable");
}

/**
 * Opens a short-lived connection, sends one request, resolves with the first
 * matching response, then closes. Uses the browser-style event API, which both
 * the native WebSocket and the `ws` package support.
 */
function request<T>(
  payload: Record<string, unknown>,
  pick: (msg: any) => T | undefined,
  timeoutMs = 5000
): Promise<T> {
  return new Promise((resolve, reject) => {
    let ws: any;
    try {
      ws = createSocket(ENDPOINT);
    } catch (e) {
      return reject(e as Error);
    }
    let done = false;

    const finish = (err: Error | null, val?: T) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      try {
        ws.close();
      } catch {
        /* noop */
      }
      if (err) reject(err);
      else resolve(val as T);
    };

    const timer = setTimeout(
      () => finish(new Error("Deriv request timed out")),
      timeoutMs
    );

    ws.onopen = () => {
      try {
        ws.send(JSON.stringify(payload));
      } catch (e) {
        finish(e as Error);
      }
    };
    ws.onerror = (e: any) => finish(new Error(e?.message || "Deriv socket error"));
    ws.onclose = () => finish(new Error("Deriv socket closed"));
    ws.onmessage = (ev: any) => {
      let msg: any;
      try {
        msg = JSON.parse(typeof ev.data === "string" ? ev.data : ev.data.toString());
      } catch {
        return;
      }
      if (msg.error) {
        finish(new Error(msg.error.message || "Deriv API error"));
        return;
      }
      const val = pick(msg);
      if (val !== undefined) finish(null, val);
    };
  });
}

/** Latest tick for a symbol, right now. */
export async function getLatestTick(symbol: string): Promise<Tick> {
  return withRetry(() => request<Tick>(
    {
      ticks_history: symbol,
      end: "latest",
      count: 1,
      style: "ticks",
    },
    (msg) => {
      if (msg.msg_type === "history" && msg.history?.prices?.length) {
        const i = msg.history.prices.length - 1;
        return {
          price: Number(msg.history.prices[i]),
          epoch: Number(msg.history.times[i]),
        };
      }
      return undefined;
    }
  ));
}

/**
 * The first tick whose epoch is >= `epoch`. Returns null if the feed has no
 * tick at/after that time yet (i.e. the contract hasn't actually expired).
 */
export async function getTickAtOrAfter(
  symbol: string,
  epoch: number
): Promise<Tick | null> {
  return withRetry(() => request<Tick | null>(
    {
      ticks_history: symbol,
      start: epoch,
      end: epoch + 120,
      count: 30,
      style: "ticks",
    },
    (msg) => {
      if (msg.msg_type !== "history") return undefined;
      const prices: number[] = msg.history?.prices || [];
      const times: number[] = msg.history?.times || [];
      for (let i = 0; i < times.length; i++) {
        if (Number(times[i]) >= epoch) {
          return { price: Number(prices[i]), epoch: Number(times[i]) };
        }
      }
      // No tick at/after expiry yet -> null (caller keeps the trade open).
      return null;
    }
  ));
}
