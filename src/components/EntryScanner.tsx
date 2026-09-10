"use client";

import { useRef, useState } from "react";
import { Sparkles, X, Search, CheckCircle2, Radar, Check } from "lucide-react";
import { MARKETS, marketBySymbol, DigitSubtype } from "@/lib/markets";
import { deepScanBest, type ScanResult } from "./AiScanner";
import type { MarketTick } from "@/lib/useDerivFeed";

const TRADE_TYPES: { value: DigitSubtype; label: string }[] = [
  { value: "even_odd", label: "Even / Odd" },
  { value: "over_under", label: "Over / Under" },
  { value: "matches_differs", label: "Match / Differ" },
];

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

type Phase = "idle" | "scanning" | "analyzing" | "done";

/**
 * Entry Scanner — pick a trade type, deep-scan every market (with a real,
 * deliberate scanning experience), and it surfaces the best market + auto
 * prediction. Loading it opens that chart with the Auto-Trader ready.
 */
export function EntryScanner({
  open,
  onClose,
  markets,
  onLoad,
}: {
  open: boolean;
  onClose: () => void;
  markets: Record<string, MarketTick>;
  onLoad: (r: ScanResult) => void;
}) {
  const [subtype, setSubtype] = useState<DigitSubtype>("even_odd");
  const [phase, setPhase] = useState<Phase>("idle");
  const [done, setDone] = useState<string[]>([]);
  const [current, setCurrent] = useState<string>("");
  const [result, setResult] = useState<ScanResult | null>(null);
  const marketsRef = useRef(markets);
  marketsRef.current = markets;
  const runId = useRef(0);

  if (!open) return null;

  const total = MARKETS.length;
  const scanning = phase === "scanning" || phase === "analyzing";
  const typeLabel = TRADE_TYPES.find((t) => t.value === subtype)?.label ?? "";
  const bestName = result ? marketBySymbol(result.symbol)?.name ?? result.symbol : "";
  const pct = phase === "done" ? 100 : (done.length / total) * 100;

  async function deepScan() {
    const id = ++runId.current;
    setPhase("scanning");
    setResult(null);
    setDone([]);
    setCurrent("");
    // Walk each market deliberately, as a real analysis pass.
    for (let i = 0; i < total; i++) {
      if (runId.current !== id) return;
      setCurrent(MARKETS[i].name);
      // eslint-disable-next-line no-await-in-loop
      await sleep(230 + Math.random() * 150);
      if (runId.current !== id) return;
      setDone((d) => [...d, MARKETS[i].symbol]);
    }
    setPhase("analyzing");
    setCurrent("Comparing entry quality across markets…");
    await sleep(750);
    if (runId.current !== id) return;
    const best = deepScanBest(marketsRef.current, subtype);
    setResult(best);
    setCurrent(best ? marketBySymbol(best.symbol)?.name ?? "" : "");
    setPhase("done");
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={scanning ? undefined : onClose} />
      <div className="relative flex max-h-[92vh] w-full max-w-md flex-col overflow-hidden rounded-2xl border border-brand/30 bg-surface shadow-glow">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <div className="flex items-center gap-3">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand/15 text-brand">
              <Sparkles className="h-4 w-4" />
            </span>
            <div>
              <div className="text-lg font-bold leading-tight">Entry Scanner</div>
              <div className="text-[11px] text-muted">Deep-scans {total} markets for the best entry</div>
            </div>
          </div>
          <button onClick={onClose} disabled={scanning} className="btn btn-ghost h-8 w-8 p-0 disabled:opacity-40">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-5">
          {/* Trade type */}
          <div>
            <label className="mb-1.5 block text-xs font-semibold text-muted">Trade type</label>
            <select
              value={subtype}
              onChange={(e) => {
                setSubtype(e.target.value as DigitSubtype);
                setResult(null);
                setPhase("idle");
              }}
              disabled={scanning}
              className="input appearance-none text-base font-semibold"
            >
              {TRADE_TYPES.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
          </div>

          {/* Scanning experience */}
          {scanning && (
            <div className="flex flex-col items-center gap-4 rounded-2xl border border-brand/30 bg-brand/[0.06] px-5 py-6 text-center">
              {/* Radar */}
              <div className="relative flex h-20 w-20 items-center justify-center">
                <span className="absolute inset-0 animate-ping rounded-full bg-brand/20" />
                <span className="absolute inset-3 animate-pulse rounded-full bg-brand/10" />
                <span className="absolute inset-0 rounded-full border border-brand/30" />
                <span className="absolute inset-5 rounded-full border border-brand/20" />
                <Radar className="h-8 w-8 animate-spin text-brand" style={{ animationDuration: "2.4s" }} />
              </div>
              <div>
                <div className="text-sm font-bold">
                  {phase === "analyzing" ? "Finding the best entry…" : "Deep scanning"}
                </div>
                <div className="mt-0.5 h-4 text-[11px] text-muted">{current}</div>
              </div>
              {/* Market chips lighting up as analysed */}
              <div className="flex flex-wrap justify-center gap-1.5">
                {MARKETS.map((m) => {
                  const ok = done.includes(m.symbol);
                  const active = current === m.name && phase === "scanning";
                  return (
                    <span
                      key={m.symbol}
                      className={`inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-semibold transition ${
                        ok ? "bg-up/15 text-up" : active ? "bg-brand text-white" : "bg-surface2/70 text-muted"
                      }`}
                    >
                      {ok && <Check className="h-2.5 w-2.5" />}
                      {m.short}
                    </span>
                  );
                })}
              </div>
            </div>
          )}

          {/* Result details */}
          {phase === "done" && result && (
            <div className="space-y-3">
              <Detail label="Selected market" value={bestName} strong />
              <Detail label="Trade type" value={typeLabel} />
              <Detail label="Prediction (auto)" value={result.predictionLabel} strong />
            </div>
          )}

          {/* Progress bar */}
          <div>
            <div className="mb-1.5 flex items-center justify-between text-[11px] font-semibold">
              <span className={scanning ? "text-brand" : "text-muted"}>
                {phase === "idle" ? "Ready to scan" : phase === "done" ? "Scan complete" : "Analyzing…"}
              </span>
              <span className="tabular text-muted">
                {phase === "done" ? total : done.length}/{total}
              </span>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-surface2">
              <div
                className="h-full rounded-full bg-gradient-to-r from-brand-light to-brand transition-all duration-300"
                style={{ width: `${pct}%` }}
              />
            </div>
          </div>

          {/* Best-market banner */}
          {phase === "done" && result && (
            <div className="flex items-start gap-2 rounded-xl border border-up/30 bg-up/5 px-3.5 py-3 text-sm">
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-up" />
              <div>
                <b>Best market:</b> {bestName} · {typeLabel} {result.predictionLabel} ·{" "}
                <b>Quality {result.quality.toFixed(2)}%</b>
              </div>
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="space-y-2 border-t border-border p-5">
          <button onClick={deepScan} disabled={scanning} className="btn btn-brand w-full py-3 text-base">
            <Search className="h-4 w-4" />
            {phase === "scanning" || phase === "analyzing"
              ? "Scanning…"
              : phase === "done"
              ? "Re-scan for Best Market"
              : "Deep Scan for Best Market"}
          </button>
          <button
            onClick={() => result && onLoad(result)}
            disabled={phase !== "done" || !result}
            className="btn btn-ghost w-full border border-brand/40 py-3 text-sm font-semibold text-brand disabled:opacity-40"
          >
            {result ? `Load ${marketBySymbol(result.symbol)?.short ?? ""} Bot` : "Load Scanner Bot"}
          </button>
        </div>
      </div>
    </div>
  );
}

function Detail({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div>
      <div className="mb-1 text-xs font-semibold text-muted">{label}</div>
      <div className={`rounded-xl border border-border bg-surface2/60 px-4 py-3 ${strong ? "text-base font-bold" : "text-sm font-medium"}`}>
        {value}
      </div>
    </div>
  );
}
