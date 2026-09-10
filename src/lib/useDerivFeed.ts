"use client";

import { useEffect, useRef, useState } from "react";

// Deriv public gateway — no app_id / no auth required for symbols & ticks.
const ENDPOINT = "wss://api.derivws.com/trading/v1/options/ws/public";

export type Point = { epoch: number; price: number };

export type FeedState = {
  points: Point[];
  last: Point | null;
  prev: Point | null;
  connected: boolean;
};

const MAX_POINTS = 240;
const POLL_MS = 1000;

/**
 * Live tick feed for `symbol` in the browser.
 *
 * One request backfills recent history AND subscribes to every subsequent tick
 * (`subscribe: 1`), so the chart moves in real time, tick for tick — matching
 * other Deriv charts instead of lagging behind a once-a-second poll. If the
 * gateway rejects the subscription or stops pushing, we fall back to polling.
 *
 * Each effect run owns its own socket + `closed` flag so React StrictMode's dev
 * double-mount can't cross wires between runs. A watchdog forces a reconnect if
 * no data arrives quickly.
 */
export function useDerivFeed(symbol: string, enabled = true): FeedState {
  const [points, setPoints] = useState<Point[]>([]);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    if (!enabled || !symbol) return;
    let closed = false;
    let ws: WebSocket | null = null;
    let poll: ReturnType<typeof setInterval> | null = null;
    let retry: ReturnType<typeof setTimeout> | null = null;
    let watchdog: ReturnType<typeof setTimeout> | null = null;
    let fallback: ReturnType<typeof setTimeout> | null = null;
    let gotData = false;
    let tickSeen = false;

    setPoints([]);
    setConnected(false);

    const clearTimers = () => {
      if (poll) clearInterval(poll);
      if (watchdog) clearTimeout(watchdog);
      if (fallback) clearTimeout(fallback);
      poll = null;
      watchdog = null;
      fallback = null;
    };

    const requestLatest = (count: number) => {
      if (closed || !ws || ws.readyState !== WebSocket.OPEN) return;
      ws.send(
        JSON.stringify({ ticks_history: symbol, end: "latest", count, style: "ticks" })
      );
    };

    // Poll only if the live subscription isn't streaming.
    const startPolling = () => {
      if (poll || closed) return;
      poll = setInterval(() => requestLatest(3), POLL_MS);
    };

    const merge = (incoming: Point[]) => {
      if (!incoming.length) return;
      setPoints((prev) => {
        const map = new Map<number, number>();
        for (const p of prev) map.set(p.epoch, p.price);
        for (const p of incoming) map.set(p.epoch, p.price);
        return Array.from(map.entries())
          .map(([epoch, price]) => ({ epoch, price }))
          .sort((a, b) => a.epoch - b.epoch)
          .slice(-MAX_POINTS);
      });
    };

    const connect = () => {
      if (closed) return;
      gotData = false;
      tickSeen = false;
      const sock = new WebSocket(ENDPOINT);
      ws = sock;

      sock.onopen = () => {
        if (closed) return;
        // Backfill history + subscribe to the live tick stream in one request.
        sock.send(
          JSON.stringify({
            ticks_history: symbol,
            end: "latest",
            count: MAX_POINTS,
            style: "ticks",
            subscribe: 1,
          })
        );
        // Reconnect if nothing at all arrives.
        watchdog = setTimeout(() => {
          if (!gotData && !closed) {
            try {
              sock.close();
            } catch {
              /* noop */
            }
          }
        }, 4000);
        // If we get history but no live ticks, poll as a fallback.
        fallback = setTimeout(() => {
          if (!tickSeen && !closed) startPolling();
        }, 3500);
      };

      sock.onmessage = (e) => {
        if (closed) return;
        let msg: any;
        try {
          msg = JSON.parse(e.data);
        } catch {
          return;
        }
        if (msg.error) {
          // Subscription rejected — fall back to polling latest ticks.
          startPolling();
          return;
        }
        if (msg.msg_type === "history" && msg.history) {
          const prices: number[] = msg.history.prices || [];
          const times: number[] = msg.history.times || [];
          if (!prices.length) return;
          gotData = true;
          if (watchdog) {
            clearTimeout(watchdog);
            watchdog = null;
          }
          setConnected(true);
          merge(prices.map((p, i) => ({ epoch: Number(times[i]), price: Number(p) })));
        } else if (msg.msg_type === "tick" && msg.tick) {
          // Live tick pushed by the subscription — the real-time path.
          tickSeen = true;
          gotData = true;
          if (watchdog) {
            clearTimeout(watchdog);
            watchdog = null;
          }
          setConnected(true);
          merge([{ epoch: Number(msg.tick.epoch), price: Number(msg.tick.quote) }]);
        }
      };

      sock.onclose = () => {
        if (closed) return;
        setConnected(false);
        clearTimers();
        retry = setTimeout(connect, 1200);
      };

      sock.onerror = () => {
        try {
          sock.close();
        } catch {
          /* noop */
        }
      };
    };

    connect();

    return () => {
      closed = true;
      clearTimers();
      if (retry) clearTimeout(retry);
      if (ws) {
        try {
          ws.close();
        } catch {
          /* noop */
        }
      }
    };
  }, [symbol, enabled]);

  const last = points.length ? points[points.length - 1] : null;
  const prev = points.length > 1 ? points[points.length - 2] : null;

  return { points, last, prev, connected };
}

// ---- Multi-market watchlist feed ----

export type MarketTick = {
  points: Point[]; // small rolling window for a sparkline
  last: number | null;
  open: number | null; // first price seen this session, for % change
};

const WATCH_POINTS = 60;
const WATCH_POLL_MS = 1500;

/**
 * Streams the latest price for several symbols over a single socket, keeping a
 * short history per symbol for sparklines. Powers the market watchlist.
 */
export function useDerivMarkets(symbols: string[]): Record<string, MarketTick> {
  const [data, setData] = useState<Record<string, MarketTick>>({});
  const key = symbols.join(",");
  const opensRef = useRef<Record<string, number>>({});

  useEffect(() => {
    let closed = false;
    let ws: WebSocket | null = null;
    let poll: ReturnType<typeof setInterval> | null = null;
    let retry: ReturnType<typeof setTimeout> | null = null;
    const reqIndex: Record<number, string> = {};
    let counter = 1;

    const send = (count: number) => {
      if (closed || !ws || ws.readyState !== WebSocket.OPEN) return;
      for (const s of symbols) {
        const id = counter++;
        reqIndex[id] = s;
        ws.send(
          JSON.stringify({
            ticks_history: s,
            end: "latest",
            count,
            style: "ticks",
            req_id: id,
          })
        );
      }
    };

    const connect = () => {
      if (closed) return;
      const sock = new WebSocket(ENDPOINT);
      ws = sock;
      sock.onopen = () => {
        if (closed) return;
        send(WATCH_POINTS);
        poll = setInterval(() => send(2), WATCH_POLL_MS);
      };
      sock.onmessage = (e) => {
        if (closed) return;
        let msg: any;
        try {
          msg = JSON.parse(e.data);
        } catch {
          return;
        }
        if (msg.error || msg.msg_type !== "history") return;
        const sym = reqIndex[msg.req_id];
        if (!sym) return;
        const prices: number[] = msg.history?.prices || [];
        const times: number[] = msg.history?.times || [];
        if (!prices.length) return;
        const incoming: Point[] = prices.map((p, i) => ({
          epoch: Number(times[i]),
          price: Number(p),
        }));
        if (opensRef.current[sym] == null) {
          opensRef.current[sym] = incoming[0].price;
        }
        setData((prev) => {
          const existing = prev[sym]?.points ?? [];
          const map = new Map<number, number>();
          for (const p of existing) map.set(p.epoch, p.price);
          for (const p of incoming) map.set(p.epoch, p.price);
          const points = Array.from(map.entries())
            .map(([epoch, price]) => ({ epoch, price }))
            .sort((a, b) => a.epoch - b.epoch)
            .slice(-WATCH_POINTS);
          return {
            ...prev,
            [sym]: {
              points,
              last: points[points.length - 1]?.price ?? null,
              open: opensRef.current[sym] ?? null,
            },
          };
        });
      };
      sock.onclose = () => {
        if (closed) return;
        if (poll) clearInterval(poll);
        retry = setTimeout(connect, 1500);
      };
      sock.onerror = () => {
        try {
          sock.close();
        } catch {
          /* noop */
        }
      };
    };

    connect();
    return () => {
      closed = true;
      if (poll) clearInterval(poll);
      if (retry) clearTimeout(retry);
      if (ws) {
        try {
          ws.close();
        } catch {
          /* noop */
        }
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return data;
}
