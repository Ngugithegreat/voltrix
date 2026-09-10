"use client";

import { useEffect, useRef, useState } from "react";
import type { Point } from "./useDerivFeed";
import { marketBySymbol } from "./markets";

// A fully-controlled simulated market for TEST accounts only. It draws a
// realistic random walk on the chart and can be "steered" so the price visibly
// moves toward a target by a deadline — letting testers watch a trade win or
// lose on the chart, exactly like a live trade. Never used for real users.

export type TestFeedState = {
  points: Point[];
  last: Point | null;
  prev: Point | null;
  connected: boolean;
  steer: (target: number, deadlineEpoch: number, exact?: boolean, entry?: number, straight?: boolean) => void;
};

// Plausible starting levels so the sim looks like the real indices.
const BASE: Record<string, number> = {
  R_10: 4827, R_25: 2668, R_50: 100.5, R_75: 50295, R_100: 644,
  "1HZ10V": 9446, "1HZ25V": 764662, "1HZ50V": 241694, "1HZ75V": 7002, "1HZ100V": 730,
};

export function useTestFeed(symbol: string, enabled: boolean): TestFeedState {
  const [points, setPoints] = useState<Point[]>([]);
  const priceRef = useRef(0);
  const steerRef = useRef<{
    target: number;
    deadline: number;
    exact: boolean;
    entry: number;
    start: number;
    straight: boolean;
  } | null>(null);

  useEffect(() => {
    if (!enabled) return;
    const m = marketBySymbol(symbol);
    const decimals = m?.decimals ?? 2;
    const base = BASE[symbol] ?? 1000;
    const scale = Math.pow(10, decimals);
    const round = (p: number) => Math.round(p * scale) / scale;
    const vol = base * 0.0012; // per-tick volatility

    // Seed a little history so the chart isn't empty.
    const now = Math.floor(Date.now() / 1000);
    let p = base;
    const seed: Point[] = [];
    for (let i = 90; i > 0; i--) {
      p += (Math.random() - 0.5) * vol * 2;
      seed.push({ epoch: now - i, price: round(p) });
    }
    priceRef.current = p;
    steerRef.current = null;
    setPoints(seed);

    const id = setInterval(() => {
      const nowSec = Math.floor(Date.now() / 1000);
      let cur = priceRef.current;
      const st = steerRef.current;
      let next: number;
      if (st) {
        const timeLeft = st.deadline - nowSec;
        if (timeLeft <= 0) {
          // Deadline reached. Digits need the exact target (last digit matters);
          // Rise/Fall/Mult just need to land near the target with normal wobble.
          next = st.exact ? st.target : st.target + (Math.random() - 0.5) * vol * 0.6;
          steerRef.current = null;
        } else if (st.exact) {
          // Digits: drift straight to the exact target (no tease — the last digit
          // is what settles it), still with full noise so it looks alive.
          const drift = (st.target - cur) * (0.18 + 0.6 / Math.max(1, timeLeft));
          next = cur + drift + (Math.random() - 0.5) * 2 * vol;
        } else if (st.straight) {
          // No tease: move firmly onto the outcome side of entry and STAY there,
          // so the position is in loss (or profit) from entry to close — no chance
          // to close on the wrong side. Used for forced losing trades and
          // multipliers, where the trader can close early.
          const dir = st.target >= st.entry ? 1 : -1;
          const finalMag = Math.max(Math.abs(st.target - st.entry), vol * 5);
          const aim = st.entry + dir * finalMag;
          // Small noise that never crosses back over entry.
          const noise = (Math.random() - 0.5) * vol * 0.8;
          next = cur + (aim - cur) * 0.4 + noise;
          // Clamp to keep it on the correct side of entry (a hair beyond it).
          const guard = st.entry + dir * Math.max(vol * 0.5, Math.abs(finalMag) * 0.15);
          if (dir > 0) next = Math.max(next, guard);
          else next = Math.min(next, guard);
        } else {
          // Rise/Fall & Multipliers: make the trade feel real. Even a trade that
          // WILL win first teases toward the losing side, then swings back and
          // closes clearly on the winning side (and vice-versa for a loss). We
          // aim at a moving target: an early excursion to the opposite side of
          // entry, then a convergence to the final side — all with live noise.
          const span = Math.max(1, st.deadline - st.start);
          const prog = Math.min(1, Math.max(0, (nowSec - st.start) / span));
          const dir = st.target >= st.entry ? 1 : -1; // final winning direction
          const finalMag = Math.max(Math.abs(st.target - st.entry), vol * 5);
          const finalTarget = st.entry + dir * finalMag; // clearly the winning side
          const teaseTarget = st.entry - dir * finalMag * 1.3; // excursion the other way
          const TEASE = 0.55; // fraction of the trade spent teasing the wrong way
          let aim: number;
          if (prog < TEASE) {
            const p = prog / TEASE;
            const e = 1 - (1 - p) * (1 - p); // easeOut
            aim = st.entry + (teaseTarget - st.entry) * e;
          } else {
            const p = (prog - TEASE) / (1 - TEASE);
            const e = p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2; // easeInOut
            aim = teaseTarget + (finalTarget - teaseTarget) * e;
          }
          // Drift toward the moving aim, tightening as the deadline nears, plus
          // full-size noise so the path never looks like a clean glide.
          const driftK = Math.min(0.85, 0.22 + 0.6 * (1 - timeLeft / span));
          const noise = (Math.random() - 0.5) * 2 * vol;
          next = cur + (aim - cur) * driftK + noise;
        }
      } else {
        next = cur + (Math.random() - 0.5) * 2 * vol;
      }
      priceRef.current = next;
      setPoints((prev) => [...prev, { epoch: nowSec, price: round(next) }].slice(-240));
    }, 1000);

    return () => clearInterval(id);
  }, [symbol, enabled]);

  const last = points.length ? points[points.length - 1] : null;
  const prev = points.length > 1 ? points[points.length - 2] : null;
  return {
    points,
    last,
    prev,
    connected: enabled,
    steer: (target, deadline, exact = false, entry?, straight = false) => {
      steerRef.current = {
        target,
        deadline,
        exact,
        entry: entry ?? priceRef.current,
        start: Math.floor(Date.now() / 1000),
        straight,
      };
    },
  };
}
