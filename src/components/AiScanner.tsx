"use client";

import { useEffect, useMemo, useState } from "react";
import { Sparkles, X, ArrowRight, Radar } from "lucide-react";
import type { MarketTick } from "@/lib/useDerivFeed";
import { MARKETS, marketBySymbol, lastDigit, DigitSubtype } from "@/lib/markets";

export type Signal = {
  symbol: string;
  contract: "digit" | "rise_fall";
  subtype?: DigitSubtype;
  barrier?: number;
  side: string; // even/odd/over/under/rise/fall
  label: string;
  confidence: number; // 0-100 (honestly capped)
  rationale: string;
};

function analyze(symbol: string, points: { price: number }[]): Signal | null {
  const m = marketBySymbol(symbol);
  if (!m || points.length < 20) return null;
  const window = points.slice(-60);
  const digits = window.map((p) => lastDigit(p.price, m.decimals));
  const n = digits.length;

  const evenPct = digits.filter((d) => d % 2 === 0).length / n;
  const overPct = digits.filter((d) => d >= 5).length / n; // digits 5-9

  const prices = points.slice(-30).map((p) => p.price);
  const slope = prices.length > 1 ? (prices[prices.length - 1] - prices[0]) / prices[0] : 0;

  type Cand = Omit<Signal, "symbol" | "confidence"> & { dev: number };
  const cands: Cand[] = [];

  cands.push({
    contract: "digit",
    subtype: "even_odd",
    barrier: 0,
    side: evenPct >= 0.5 ? "even" : "odd",
    label: evenPct >= 0.5 ? "EVEN" : "ODD",
    dev: Math.abs(evenPct - 0.5),
    rationale: `${Math.round(Math.max(evenPct, 1 - evenPct) * 100)}% ${
      evenPct >= 0.5 ? "even" : "odd"
    } digits in last ${n} ticks`,
  });

  cands.push({
    contract: "digit",
    subtype: "over_under",
    barrier: overPct >= 0.5 ? 4 : 5,
    side: overPct >= 0.5 ? "over" : "under",
    label: overPct >= 0.5 ? "OVER 4" : "UNDER 5",
    dev: Math.abs(overPct - 0.5),
    rationale: `${Math.round(Math.max(overPct, 1 - overPct) * 100)}% ${
      overPct >= 0.5 ? "high (5-9)" : "low (0-4)"
    } digits recently`,
  });

  const mdev = Math.min(0.5, Math.abs(slope) * 45);
  cands.push({
    contract: "rise_fall",
    side: slope >= 0 ? "rise" : "fall",
    label: slope >= 0 ? "RISE" : "FALL",
    dev: mdev,
    rationale: `trending ${slope >= 0 ? "up" : "down"} ${(Math.abs(slope) * 100).toFixed(
      2
    )}% over 30 ticks`,
  });

  const best = cands.sort((a, b) => b.dev - a.dev)[0];
  // Honest confidence: bias -> a capped score. Random indices, so we never claim certainty.
  const confidence = Math.round(Math.min(74, 50 + best.dev * 170));
  return { symbol, confidence, ...best };
}

/**
 * Ranked live signals (shared by the scanner UI and the AI bot). Pass `symbols`
 * to limit the scan to specific markets; omit for all markets.
 */
export function computeSignals(
  markets: Record<string, MarketTick>,
  symbols?: string[]
): Signal[] {
  const list =
    symbols && symbols.length ? MARKETS.filter((m) => symbols.includes(m.symbol)) : MARKETS;
  return list
    .map((m) => analyze(m.symbol, markets[m.symbol]?.points ?? []))
    .filter((s): s is Signal => !!s)
    .sort((a, b) => b.confidence - a.confidence);
}

export type ScanResult = {
  symbol: string;
  subtype: DigitSubtype;
  direction: string;
  barrier: number;
  quality: number; // 0-100 win-probability of the auto prediction
  predictionLabel: string;
};

/**
 * Deep scan: walk EVERY market for the chosen digit trade type and return the
 * single best market + auto-prediction (highest historical win probability).
 */
export function deepScanBest(
  markets: Record<string, MarketTick>,
  subtype: DigitSubtype
): ScanResult | null {
  let best: ScanResult | null = null;
  const consider = (r: ScanResult) => {
    if (!best || r.quality > best.quality) best = r;
  };

  for (const m of MARKETS) {
    const pts = markets[m.symbol]?.points ?? [];
    if (pts.length < 20) continue;
    const digits = pts.slice(-120).map((p) => lastDigit(p.price, m.decimals));
    const n = digits.length;
    if (!n) continue;

    if (subtype === "even_odd") {
      const evenPct = digits.filter((d) => d % 2 === 0).length / n;
      const dir = evenPct >= 0.5 ? "even" : "odd";
      consider({
        symbol: m.symbol,
        subtype,
        direction: dir,
        barrier: 0,
        quality: Math.max(evenPct, 1 - evenPct) * 100,
        predictionLabel: dir === "even" ? "Even" : "Odd",
      });
    } else if (subtype === "over_under") {
      // Over N wins if last digit > N (N 0-8); Under N wins if < N (N 1-9).
      for (let b = 1; b <= 8; b++) {
        const overP = digits.filter((d) => d > b).length / n;
        consider({ symbol: m.symbol, subtype, direction: "over", barrier: b, quality: overP * 100, predictionLabel: `Over ${b}` });
        const underP = digits.filter((d) => d < b).length / n;
        consider({ symbol: m.symbol, subtype, direction: "under", barrier: b, quality: underP * 100, predictionLabel: `Under ${b}` });
      }
    } else {
      // Match/Differ — "Differs from X" wins if the digit isn't X, so pick the
      // rarest digit for the highest win probability.
      const counts = new Array(10).fill(0);
      digits.forEach((d) => counts[d]++);
      let rare = 0;
      for (let d = 1; d < 10; d++) if (counts[d] < counts[rare]) rare = d;
      consider({
        symbol: m.symbol,
        subtype,
        direction: "differs",
        barrier: rare,
        quality: (1 - counts[rare] / n) * 100,
        predictionLabel: `Differs from ${rare}`,
      });
    }
  }
  return best;
}

export function AiScanner({
  open,
  onClose,
  markets,
  onApply,
}: {
  open: boolean;
  onClose: () => void;
  markets: Record<string, MarketTick>;
  onApply: (s: Signal) => void;
}) {
  const [phase, setPhase] = useState<"scanning" | "done">("scanning");

  useEffect(() => {
    if (!open) return;
    setPhase("scanning");
    const t = setTimeout(() => setPhase("done"), 1600);
    return () => clearTimeout(t);
  }, [open]);

  const signals = useMemo(() => computeSignals(markets).slice(0, 6), [markets]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-lg overflow-hidden rounded-2xl border border-brand/30 bg-surface shadow-glow">
        <div className="flex items-center justify-between border-b border-border px-5 py-3.5">
          <div className="flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand/15 text-brand">
              <Sparkles className="h-4 w-4" />
            </span>
            <div>
              <div className="text-sm font-bold">AI Market Scanner</div>
              <div className="text-[11px] text-muted">Live tick-bias analysis · {MARKETS.length} markets</div>
            </div>
          </div>
          <button onClick={onClose} className="btn btn-ghost h-8 w-8 p-0">
            <X className="h-4 w-4" />
          </button>
        </div>

        {phase === "scanning" ? (
          <div className="flex flex-col items-center justify-center gap-4 px-6 py-14">
            <div className="relative flex h-16 w-16 items-center justify-center">
              <span className="absolute inset-0 animate-ping rounded-full bg-brand/20" />
              <span className="absolute inset-2 animate-pulse rounded-full bg-brand/10" />
              <Radar className="h-7 w-7 animate-spin text-brand" style={{ animationDuration: "2.4s" }} />
            </div>
            <div className="text-sm font-medium text-muted">Scanning live markets…</div>
            <div className="h-1 w-56 overflow-hidden rounded-full bg-surface2">
              <div className="h-full w-1/3 animate-[shimmer_1.6s_linear_infinite] rounded-full bg-gradient-to-r from-transparent via-brand to-transparent" />
            </div>
          </div>
        ) : (
          <div className="max-h-[60vh] overflow-y-auto p-3">
            {signals.length === 0 ? (
              <div className="px-4 py-10 text-center text-sm text-muted">
                Gathering ticks… reopen in a few seconds.
              </div>
            ) : (
              <div className="space-y-2">
                {signals.map((s, i) => {
                  const m = marketBySymbol(s.symbol);
                  return (
                    <div
                      key={s.symbol}
                      className="flex items-center justify-between gap-3 rounded-xl border border-border bg-surface2/60 px-3.5 py-2.5"
                    >
                      <div className="flex items-center gap-3">
                        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-surface2 text-xs font-bold text-brand">
                          #{i + 1}
                        </div>
                        <div>
                          <div className="flex items-center gap-2 text-sm font-semibold">
                            {m?.short ?? s.symbol}
                            <span className="rounded bg-brand/15 px-1.5 py-0.5 text-[10px] font-bold text-brand">
                              {s.label}
                            </span>
                          </div>
                          <div className="text-[11px] text-muted">{s.rationale}</div>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <div className="w-16 text-right">
                          <div className="tabular text-sm font-bold text-fg">{s.confidence}%</div>
                          <div className="mt-0.5 h-1 w-full overflow-hidden rounded-full bg-surface2">
                            <div
                              className="h-full rounded-full bg-gradient-to-r from-brand-light to-brand"
                              style={{ width: `${s.confidence}%` }}
                            />
                          </div>
                        </div>
                        <button
                          onClick={() => onApply(s)}
                          className="btn btn-brand px-2.5 py-1.5 text-xs"
                        >
                          Apply <ArrowRight className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
            <p className="px-2 pt-3 text-center text-[10px] leading-relaxed text-muted">
              Signals reflect short-term tick bias on random synthetic indices — they are
              insights, not guarantees. Never stake more than you can afford to lose.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
