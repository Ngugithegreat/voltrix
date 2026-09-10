"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  ArrowUp,
  ArrowDown,
  Zap,
  Timer,
  TrendingUp,
  Wifi,
  WifiOff,
  Wallet,
  Hash,
  ChevronDown,
  Bell,
  BellRing,
} from "lucide-react";
import Link from "next/link";
import { Sparkles } from "lucide-react";
import { useApp, Trade } from "./app-context";
import { useDerivFeed, useDerivMarkets } from "@/lib/useDerivFeed";
import { useTestFeed } from "@/lib/useTestFeed";
import { PriceChart } from "./PriceChart";
import { DigitHeatmap } from "./DigitHeatmap";
import { BotPanel } from "./BotPanel";
import { EntryScanner } from "./EntryScanner";
import type { ScanResult } from "./AiScanner";
import { Onboarding } from "./Onboarding";
import { TradeReceipt } from "./TradeReceipt";
import { celebrateWin, signalLoss, primeAudio } from "@/lib/feedback";
import {
  MARKETS,
  DURATIONS,
  MULTIPLIERS,
  DEFAULT_MULTIPLIER,
  DIGIT_TICKS,
  DEFAULT_DIGIT_TICKS,
  PAYOUT_MULTIPLIER,
  MIN_STAKE,
  MAX_STAKE,
  marketBySymbol,
  multiplierPnl,
  lastDigit,
  digitPayoutMult,
  pickForcedDigit,
  DigitSubtype,
} from "@/lib/markets";
import { money, cents } from "@/lib/format";

const QUICK_STAKES = [1, 5, 10, 25, 50, 100];
type Contract = "rise_fall" | "mult" | "digit";

// Short chime for a triggered price alert (best-effort; ignored if blocked).
function beep() {
  try {
    const Ctx = (window.AudioContext || (window as any).webkitAudioContext) as typeof AudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.connect(g);
    g.connect(ctx.destination);
    o.type = "sine";
    o.frequency.value = 880;
    g.gain.setValueAtTime(0.0001, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.2, ctx.currentTime + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.35);
    o.start();
    o.stop(ctx.currentTime + 0.36);
    setTimeout(() => ctx.close(), 500);
  } catch {
    /* audio blocked — the toast still shows */
  }
}

export function TradeTerminal() {
  const { balance, setBalance, data, refresh, loading, user, config, demo } = useApp();
  const [symbol, setSymbol] = useState("1HZ100V");
  const [contract, setContract] = useState<Contract>("digit");
  const [stake, setStake] = useState("10");
  const [duration, setDuration] = useState(60);
  const [multiplier, setMultiplier] = useState(DEFAULT_MULTIPLIER);
  const [subtype, setSubtype] = useState<DigitSubtype>("over_under");
  const [barrier, setBarrier] = useState(5);
  const [digitTicks, setDigitTicks] = useState(DEFAULT_DIGIT_TICKS);
  const [mode, setMode] = useState<"manual" | "auto">("manual");
  const [posTab, setPosTab] = useState<"open" | "closed">("open");
  const [scannerOpen, setScannerOpen] = useState(false);
  const [placing, setPlacing] = useState<string | null>(null);
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null);
  const [alertPrice, setAlertPrice] = useState<number | null>(null);
  const alertPrevRef = useRef<number | null>(null);
  const [receipt, setReceipt] = useState<Trade | null>(null);
  const [botPreset, setBotPreset] = useState<{ side: string; key: number } | null>(null);
  const [resultFlash, setResultFlash] = useState<{ won: boolean; profit: number; label: string; sub: string; id: number } | null>(null);
  const [flashDigit, setFlashDigit] = useState<{ digit: number; won: boolean } | null>(null);
  // Recently-settled trades kept briefly in the Open panel so you SEE them
  // resolve (WON/LOST) before they drop into history — even 1-tick trades.
  const [settledFlash, setSettledFlash] = useState<Trade[]>([]);
  const lastClosedRef = useRef<number | null>(null);
  const seenClosedRef = useRef<Set<number>>(new Set());
  const closedInitRef = useRef(false);
  // Testers default to "auto" so the admin-set win % governs every trade
  // automatically (incl. Rise/Fall) — Real/Win/Lose are per-trade overrides.

  // Sim market when this account is a tester OR the whole system is in test mode.
  // The chart runs on the SIMULATED feed for demo (so it always works and shows
  // the win/loss play out) and for real test accounts / global test mode.
  const sim = demo || !!user?.isTest || !!config?.globalTest;
  const realFeed = useDerivFeed(symbol, !sim);
  const testFeed = useTestFeed(symbol, sim);
  const feed = sim ? testFeed : realFeed;
  const markets = useDerivMarkets(MARKETS.map((m) => m.symbol));
  const market = marketBySymbol(symbol)!;
  const dp = market.decimals;

  const rising = feed.last && feed.prev ? feed.last.price >= feed.prev.price : true;
  const sessionOpen = markets[symbol]?.open ?? feed.points[0]?.price ?? null;
  const changePct =
    feed.last && sessionOpen ? ((feed.last.price - sessionOpen) / sessionOpen) * 100 : 0;
  const hi = feed.points.length ? Math.max(...feed.points.map((p) => p.price)) : null;
  const lo = feed.points.length ? Math.min(...feed.points.map((p) => p.price)) : null;
  const curDigit = feed.last ? lastDigit(feed.last.price, dp) : null;

  const stakeNum = Number(stake) || 0;
  const stakeCents = cents(stakeNum);
  const stakeValid =
    stakeCents >= MIN_STAKE && stakeCents <= MAX_STAKE && stakeCents <= balance;

  // Show only the ACTIVE account's positions (real vs demo).
  const openTrades = (data?.openTrades ?? []).filter((t) => !!t.is_demo === demo);
  const closed = (data?.closedTrades ?? []).filter((t) => !!t.is_demo === demo);
  const hasOpenMult = openTrades.some((t) => t.kind === "mult");

  // Switching between Real and Demo swaps the whole trade list. Reset the
  // settle trackers so the new account's feedback (sound + result flash +
  // settled cards) starts clean — otherwise the refs still point at the other
  // account's trades and the first Demo settlements get swallowed as "already
  // seen", which is what made Demo feel silent. Demo gets the exact same live
  // experience as Real; only the funds differ.
  useEffect(() => {
    lastClosedRef.current = null;
    seenClosedRef.current = new Set();
    closedInitRef.current = false;
    setResultFlash(null);
    setFlashDigit(null);
    setSettledFlash([]);
  }, [demo]);

  // Premium feedback: when a new trade settles, celebrate a win (confetti +
  // chime) or give a clean shake on a loss.
  useEffect(() => {
    const top = closed[0];
    if (!top) return;
    if (lastClosedRef.current === null) {
      lastClosedRef.current = top.id; // don't fire on first load
      return;
    }
    if (top.id !== lastClosedRef.current) {
      lastClosedRef.current = top.id;
      const won = top.status === "won";
      const stake = Number(top.stake);
      const profit = won ? Number(top.payout) - stake : -stake;
      const dir =
        top.kind === "mult"
          ? `${top.direction === "up" ? "UP" : "DOWN"} ×${top.multiplier}`
          : top.kind === "digit"
          ? top.direction.toUpperCase()
          : top.direction === "rise"
          ? "RISE"
          : "FALL";
      // Flash the result on the chart before it drops into history.
      setResultFlash({
        won,
        profit,
        label: won ? "Trade won" : "Trade lost",
        sub: `${marketBySymbol(top.symbol)?.short ?? top.symbol} · ${dir}`,
        id: top.id,
      });
      // Highlight the settled digit on the strip (green won / red lost).
      if (top.kind === "digit" && top.exit_digit != null) {
        setFlashDigit({ digit: Number(top.exit_digit), won });
      }
      if (won) celebrateWin();
      else signalLoss();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [closed]);

  // Clear the on-chart result flash after a few seconds.
  useEffect(() => {
    if (!resultFlash) return;
    const t = setTimeout(() => setResultFlash(null), 4000);
    return () => clearTimeout(t);
  }, [resultFlash]);

  useEffect(() => {
    if (!flashDigit) return;
    const t = setTimeout(() => setFlashDigit(null), 2800);
    return () => clearTimeout(t);
  }, [flashDigit]);

  // Hold each freshly-settled trade in the Open panel for ~1.6s with its outcome.
  useEffect(() => {
    if (!closedInitRef.current) {
      closed.forEach((t) => seenClosedRef.current.add(t.id));
      closedInitRef.current = true;
      return;
    }
    const nowMs = Date.now();
    const fresh = closed.filter((t) => !seenClosedRef.current.has(t.id));
    fresh.forEach((t) => seenClosedRef.current.add(t.id));
    // Only flash trades that just settled (avoid replaying old ones on reloads).
    const toFlash = fresh.filter((t) => {
      const s = t.settled_at ? new Date(t.settled_at).getTime() : nowMs;
      return nowMs - s < 12000;
    });
    if (!toFlash.length) return;
    setSettledFlash((prev) => [...toFlash, ...prev].slice(0, 8));
    toFlash.forEach((t) => {
      setTimeout(() => setSettledFlash((prev) => prev.filter((x) => x.id !== t.id)), 1800);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [closed]);

  // Draw open Rise/Fall & Multiplier positions on the chart (entry + stop-out lines).
  const chartMarkers = openTrades
    .filter((t) => t.symbol === symbol && (t.kind === "rise_fall" || t.kind === "mult"))
    .flatMap((t) => {
      const up = t.direction === "rise" || t.direction === "up";
      const color = up ? "#00E39A" : "#FF4D6D";
      const label =
        t.kind === "mult"
          ? `${up ? "UP" : "DOWN"} x${t.multiplier} · ${money(Number(t.stake))}`
          : `${up ? "RISE" : "FALL"} · ${money(Number(t.stake))}`;
      const out: { price: number; color: string; label: string }[] = [
        { price: Number(t.entry_price), color, label },
      ];
      if (t.kind === "mult" && t.stop_out_price) {
        out.push({ price: Number(t.stop_out_price), color: "#FFB020", label: "stop-out" });
      }
      return out;
    });

  // Shade "in the money / out of the money" between entry and live price for
  // open Rise/Fall & Multiplier positions on this market.
  const chartZones =
    feed.last != null
      ? openTrades
          .filter((t) => t.symbol === symbol && (t.kind === "rise_fall" || t.kind === "mult"))
          .map((t) => {
            const up = t.direction === "rise" || t.direction === "up";
            const entry = Number(t.entry_price);
            const cur = feed.last!.price;
            return { from: entry, to: cur, win: up ? cur >= entry : cur <= entry };
          })
      : [];

  const showToast = useCallback((msg: string, ok: boolean) => {
    setToast({ msg, ok });
    setTimeout(() => setToast(null), 3000);
  }, []);

  useEffect(() => {
    if (!hasOpenMult) return;
    const id = setInterval(() => refresh(), 6000);
    return () => clearInterval(id);
  }, [hasOpenMult, refresh]);

  // Price alert (in-app): arm a target for the current market, seeding the
  // previous price so crossing is measured from now.
  const armAlert = useCallback(
    (price: number) => {
      alertPrevRef.current = feed.last?.price ?? null;
      setAlertPrice(price);
    },
    [feed.last]
  );

  // Clear the alert when the market changes.
  useEffect(() => {
    setAlertPrice(null);
    alertPrevRef.current = null;
  }, [symbol]);

  // Fire the alert the moment the live price crosses the target.
  useEffect(() => {
    if (alertPrice == null || !feed.last) return;
    const cur = feed.last.price;
    const prev = alertPrevRef.current;
    if (prev != null && prev !== cur) {
      const crossed =
        (prev < alertPrice && cur >= alertPrice) || (prev > alertPrice && cur <= alertPrice);
      if (crossed) {
        showToast(`🔔 ${market.short} reached ${alertPrice.toFixed(dp)}`, true);
        beep();
        setAlertPrice(null);
      }
    }
    alertPrevRef.current = cur;
  }, [feed.last, alertPrice, market.short, dp, showToast]);

  // Move the sim chart so the price visibly ends on the winning/losing side.
  function steerToOutcome(t: any) {
    const won = t.forced_outcome === "win";
    const entry = Number(t.entry_price) || feed.last?.price || 0;
    const nowSec = Math.floor(Date.now() / 1000);
    if (t.kind === "digit") {
      const sub = t.subtype as DigitSubtype;
      const pred = t.prediction || t.direction;
      const bar = Number(t.barrier ?? 0);
      // Same seeded digit the server will settle to (varied per trade).
      const d = pickForcedDigit(sub, pred, bar, won, Number(t.id));
      const scaleD = Math.pow(10, dp);
      let scaled = Math.round(entry * scaleD);
      scaled = scaled - (((scaled % 10) + 10) % 10) + d; // set last digit to d
      testFeed.steer(scaled / scaleD, Number(t.expiry_epoch) || nowSec + digitTicks, true, entry);
    } else {
      const up = t.direction === "rise" || t.direction === "up";
      const wantHigher = (up && won) || (!up && !won);
      let target: number;
      if (t.kind === "mult" && !won && t.stop_out_price) {
        // Losing multiplier: drive the price a hair PAST the stop-out so the
        // position visibly reaches stop-out and auto-closes at a full loss,
        // instead of hovering at a partial loss forever (multipliers have no
        // expiry). Matches how a real broker force-closes a stopped-out trade.
        const so = Number(t.stop_out_price);
        const beyond = Math.max(0.02, Math.abs(entry) * 0.0008);
        target = up ? so - beyond : so + beyond;
      } else {
        const delta = Math.max(0.02, Math.abs(entry) * 0.004);
        target = wantHigher ? entry + delta : entry - delta;
      }
      const deadline = Number(t.expiry_epoch) > nowSec ? Number(t.expiry_epoch) : nowSec + 25;
      // No tease for LOSING trades and for multipliers (which can be closed
      // early): the price sits firmly on the outcome side from entry, so a
      // losing position is never briefly in profit.
      const straight = !won || t.kind === "mult";
      testFeed.steer(target, deadline, false, entry, straight);
    }
  }

  async function place(direction: string, extra?: Record<string, unknown>) {
    if (!stakeValid || placing) return;
    // Unlock audio during this tap so the win/loss sound can play at settle.
    primeAudio();
    setPlacing(direction);
    try {
      let body: Record<string, unknown>;
      if (contract === "rise_fall")
        body = { kind: "rise_fall", symbol, direction, stake: stakeCents, duration };
      else if (contract === "mult")
        body = { kind: "mult", symbol, direction, stake: stakeCents, multiplier };
      else
        body = {
          kind: "digit",
          symbol,
          direction,
          stake: stakeCents,
          subtype,
          barrier,
          ticks: digitTicks,
          // Client's live tick — lets digit trades place instantly (entry price
          // doesn't affect a digit outcome, so this is safe).
          entry: feed.last ? { price: feed.last.price, epoch: feed.last.epoch } : undefined,
          ...extra,
        };
      // Test accounts trade the SIM market: send the sim's current price as the
      // entry (all contract types, so the entry line matches the chart) and flag
      // test mode so the server rolls the outcome by the admin win %.
      if (sim) {
        if (feed.last) body.entry = { price: feed.last.price, epoch: feed.last.epoch };
        // Only a REAL test account rolls by the admin %. Demo uses its own
        // favourable rate on the server (never testMode).
        if (!demo) body.testMode = true;
      }
      // Practice trade with virtual funds (server rolls a favourable outcome).
      if (demo) body.demo = true;
      const res = await fetch("/api/trade", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (!res.ok) showToast(json.error || "Trade failed.", false);
      else {
        if (typeof json.balance === "number") setBalance(json.balance);
        // Test accounts: steer the sim chart toward the server-decided result.
        if (sim && json.trade?.forced_outcome) steerToOutcome(json.trade);
        showToast(`${direction.toUpperCase()} · ${market.short} · ${money(stakeCents)}`, true);
        refresh();
      }
    } catch {
      showToast("Network error. Try again.", false);
    } finally {
      setPlacing(null);
    }
  }

  // AUTO bot supports time-settled contracts only (Rise/Fall + Digits).
  const botContract: "rise_fall" | "digit" = contract === "mult" ? "digit" : contract;

  const [resettingDemo, setResettingDemo] = useState(false);
  async function resetDemo() {
    setResettingDemo(true);
    try {
      const res = await fetch("/api/demo/reset", { method: "POST" });
      const json = await res.json();
      if (res.ok) {
        if (typeof json.demoBalance === "number") setBalance(json.demoBalance);
        await refresh();
        showToast("Demo balance reset to $10,000", true);
      } else {
        showToast(json.error || "Could not reset demo.", false);
      }
    } catch {
      showToast("Network error resetting demo.", false);
    } finally {
      setResettingDemo(false);
    }
  }

  return (
    <div className="mx-auto flex max-w-[1640px] flex-col px-2 py-2 sm:px-3 sm:py-3 lg:h-[calc(100vh-4rem)] lg:overflow-hidden">
      <EntryScanner
        open={scannerOpen}
        onClose={() => setScannerOpen(false)}
        markets={markets}
        onLoad={(r: ScanResult) => {
          // Load the scanned market into the terminal and open the Auto-Trader.
          setSymbol(r.symbol);
          setContract("digit");
          setSubtype(r.subtype);
          setBarrier(r.barrier);
          setMode("auto");
          setBotPreset({ side: r.direction, key: Date.now() });
          setScannerOpen(false);
          showToast(`Loaded ${marketBySymbol(r.symbol)?.short ?? r.symbol} · ${r.predictionLabel}`, true);
        }}
      />
      <Onboarding />
      <TradeReceipt trade={receipt} onClose={() => setReceipt(null)} />
      {/* Unified workspace — a single high-end surface split into seamless
          panes (positions · chart · ticket) instead of separate floating
          columns, so the whole dashboard reads as one page. */}
      <div className="card flex min-h-0 flex-1 flex-col overflow-hidden lg:flex-row lg:divide-x lg:divide-border">
        {/* Positions — drops to the bottom on phones */}
        <section className="order-last flex min-h-0 flex-col overflow-hidden border-t border-border max-h-[46vh] lg:order-none lg:w-[290px] lg:shrink-0 lg:border-t-0 lg:max-h-none">
          <div className="flex items-center gap-1.5 border-b border-border px-2.5 py-2">
            {(["open", "closed"] as const).map((t) => (
              <button
                key={t}
                onClick={() => setPosTab(t)}
                className={`rounded-lg px-3 py-1.5 text-xs font-semibold capitalize transition ${
                  posTab === t ? "bg-surface2 text-fg" : "text-muted hover:text-fg"
                }`}
              >
                {t} ({t === "open" ? openTrades.length : closed.length})
              </button>
            ))}
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto">
            {posTab === "open" ? (
              <OpenPositions
                trades={openTrades}
                settled={settledFlash}
                onSettled={refresh}
                liveSymbol={symbol}
                livePrice={feed.last?.price ?? null}
                showToast={showToast}
                setBalance={setBalance}
                onSelect={setReceipt}
              />
            ) : (
              <ClosedPositions trades={closed} onSelect={setReceipt} />
            )}
          </div>
        </section>

        {/* Chart + live digits — shown first on phones */}
        <section className="order-first flex h-[36vh] flex-col overflow-hidden lg:order-none lg:h-auto lg:min-h-0 lg:flex-1">
            <div className="flex items-center justify-between gap-2 border-b border-border px-3 py-2.5 sm:px-4">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <MarketDropdown symbol={symbol} onSelect={setSymbol} />
                  <ConnBadge connected={feed.connected} />
                  <AlertControl
                    current={feed.last?.price ?? null}
                    dp={dp}
                    target={alertPrice}
                    onArm={armAlert}
                    onClear={() => setAlertPrice(null)}
                  />
                </div>
                <div className="truncate text-[11px] text-muted">
                  {market.volatility} volatility · synthetic index
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-3 sm:gap-4">
                {curDigit != null && (
                  <div className="hidden text-center sm:block">
                    <div className="text-[9px] uppercase tracking-wider text-muted">Last digit</div>
                    <div className="tabular text-2xl font-black leading-none text-brand">
                      {curDigit}
                    </div>
                  </div>
                )}
                <div className="text-right">
                  <div
                    className={`tabular text-xl font-bold leading-none sm:text-2xl ${
                      rising ? "text-up" : "text-down"
                    }`}
                  >
                    {feed.last ? feed.last.price.toFixed(dp) : "—"}
                  </div>
                  <div
                    className={`mt-0.5 text-xs font-semibold ${
                      changePct >= 0 ? "text-up" : "text-down"
                    }`}
                  >
                    {changePct >= 0 ? "▲ +" : "▼ "}
                    {changePct.toFixed(2)}%
                  </div>
                </div>
              </div>
            </div>
            <div className="hidden items-center gap-4 border-b border-border px-4 py-1.5 text-[11px] text-muted sm:flex">
              <span>
                High <span className="tabular text-up">{hi ? hi.toFixed(dp) : "—"}</span>
              </span>
              <span>
                Low <span className="tabular text-down">{lo ? lo.toFixed(dp) : "—"}</span>
              </span>
              <span className="ml-auto">{demo ? "Demo · practice market" : "Live · Deriv feed"}</span>
            </div>
            <div className="relative min-h-0 flex-1">
              {feed.points.length === 0 ? (
                <ChartSkeleton connected={feed.connected} />
              ) : (
                <div className="h-full">
                  <PriceChart points={feed.points} up={rising} decimals={dp} markers={chartMarkers} zones={chartZones} />
                </div>
              )}

              {/* Live open positions on THIS market — shown right on the chart */}
              <ChartPositions trades={openTrades.filter((t) => t.symbol === symbol)} livePrice={feed.last?.price ?? null} />

              {/* Result flash — the win/loss reveal before it drops to history */}
              {resultFlash && (
                <div className="pointer-events-none absolute inset-x-0 top-4 z-20 flex justify-center">
                  <div
                    className={`animate-fade-up rounded-2xl border px-6 py-3 text-center shadow-card backdrop-blur ${
                      resultFlash.won ? "border-up/50 bg-up/15" : "border-down/50 bg-down/15"
                    }`}
                  >
                    <div className={`tabular text-3xl font-black ${resultFlash.won ? "text-up" : "text-down"}`}>
                      {money(resultFlash.profit, { sign: true })}
                    </div>
                    <div className="mt-0.5 text-[11px] font-semibold uppercase tracking-wider text-muted">
                      {resultFlash.label} · {resultFlash.sub}
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Digit strip — part of the chart, shown while trading digits */}
            {contract === "digit" && (
              <div className="shrink-0 border-t border-border bg-surface2/70 px-2 py-3 sm:px-4">
                <div className="mb-2 flex items-center justify-between px-1">
                  <span className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-fg">
                    <Hash className="h-3.5 w-3.5 text-brand" /> Live last digits
                  </span>
                  <span className="hidden text-[11px] text-muted sm:block">tap a number to set your barrier</span>
                </div>
                <DigitHeatmap
                  points={feed.points}
                  decimals={dp}
                  onPick={(d) => setBarrier(d)}
                  selected={subtype !== "even_odd" ? barrier : null}
                  flash={flashDigit}
                />
              </div>
            )}
          </section>

        {/* Ticket */}
        <section className="min-h-0 overflow-y-auto border-t border-border p-3 sm:p-3.5 lg:w-[360px] lg:shrink-0 lg:border-t-0">
            {/* Manual / Auto + AI */}
            <div className="mb-2 flex items-center gap-2 sm:mb-3">
              <div className="flex flex-1 rounded-xl bg-surface2 p-1">
                {(["manual", "auto"] as const).map((mo) => (
                  <button
                    key={mo}
                    onClick={() => {
                      setMode(mo);
                      if (mo === "auto" && contract === "mult") setContract("digit");
                    }}
                    className={`flex-1 rounded-lg py-1.5 text-xs font-semibold capitalize transition ${
                      mode === mo ? "bg-brand text-white shadow-glow" : "text-muted hover:text-fg"
                    }`}
                  >
                    {mo}
                  </button>
                ))}
              </div>
              <button
                onClick={() => setScannerOpen(true)}
                className="btn btn-brand px-3 py-2 text-xs font-semibold"
              >
                <Sparkles className="h-3.5 w-3.5" /> AI
              </button>
            </div>

            <div className={`mb-2 grid gap-1.5 sm:mb-3 ${mode === "auto" ? "grid-cols-2" : "grid-cols-3"}`}>
              {(mode === "auto"
                ? ([["rise_fall", "Rise/Fall"], ["digit", "Digits"]] as [Contract, string][])
                : ([["rise_fall", "Rise/Fall"], ["digit", "Digits"], ["mult", "Multipliers"]] as [Contract, string][])
              ).map(([c, label]) => (
                <button
                  key={c}
                  onClick={() => setContract(c)}
                  className={`btn py-2 text-xs ${contract === c ? "btn-brand" : "btn-ghost"}`}
                >
                  {label}
                </button>
              ))}
            </div>

            <div className="mb-1 flex items-center justify-between">
              <label className="text-xs font-medium text-muted">Stake (USD)</label>
              <span className="flex items-center gap-1.5 text-[11px] text-muted">
                {demo && (
                  <button
                    onClick={resetDemo}
                    disabled={resettingDemo}
                    className="rounded-md border border-gold/40 bg-gold/10 px-1.5 py-0.5 text-[10px] font-semibold text-gold transition hover:bg-gold/20 disabled:opacity-50"
                  >
                    {resettingDemo ? "…" : "Reset demo"}
                  </button>
                )}
                <Wallet className="h-3 w-3" /> {loading ? "—" : money(balance)}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setStake(String(Math.max(0, Math.round((stakeNum - 1) * 100) / 100)))}
                className="btn btn-ghost h-10 w-10 shrink-0 p-0 text-lg"
              >
                −
              </button>
              <input
                className="input tabular text-center"
                inputMode="decimal"
                value={stake}
                onChange={(e) => setStake(e.target.value.replace(/[^0-9.]/g, ""))}
              />
              <button
                onClick={() => setStake(String(Math.round((stakeNum + 1) * 100) / 100))}
                className="btn btn-ghost h-10 w-10 shrink-0 p-0 text-lg"
              >
                +
              </button>
            </div>
            {stakeNum > 0 && (
              <div className="mt-1 text-right text-[11px] text-muted">
                ≈ KES {Math.round(stakeNum * (config?.usdKesRate ?? 130)).toLocaleString("en-US")}
              </div>
            )}
            <div className="mt-2 grid grid-cols-6 gap-1.5">
              {QUICK_STAKES.map((q) => (
                <button
                  key={q}
                  onClick={() => setStake(String(q))}
                  className={`btn py-1.5 text-[11px] ${
                    stakeNum === q ? "btn-brand" : "btn-ghost"
                  }`}
                >
                  {q}
                </button>
              ))}
            </div>

            {contract === "rise_fall" && (
              <RiseFallControls
                auto={mode === "auto"}
                duration={duration}
                setDuration={setDuration}
                stakeCents={stakeCents}
                placing={placing}
                stakeValid={stakeValid}
                onPlace={place}
              />
            )}
            {contract === "mult" && mode === "manual" && (
              <MultControls
                multiplier={multiplier}
                setMultiplier={setMultiplier}
                stakeCents={stakeCents}
                placing={placing}
                stakeValid={stakeValid}
                onPlace={place}
              />
            )}
            {contract === "digit" && (
              <DigitControls
                auto={mode === "auto"}
                subtype={subtype}
                setSubtype={setSubtype}
                barrier={barrier}
                setBarrier={setBarrier}
                ticks={digitTicks}
                setTicks={setDigitTicks}
                stakeCents={stakeCents}
                placing={placing}
                stakeValid={stakeValid}
                onPlace={place}
              />
            )}

            {mode === "auto" && (
              <BotPanel
                symbol={symbol}
                contract={botContract}
                subtype={subtype}
                barrier={barrier}
                ticks={digitTicks}
                duration={duration}
                baseStakeCents={stakeCents}
                stakeValid={stakeValid}
                markets={markets}
                sim={sim}
                demo={demo}
                presetSide={botPreset?.side}
                presetKey={botPreset?.key}
                getSimEntry={() =>
                  feed.last ? { price: feed.last.price, epoch: feed.last.epoch } : null
                }
                onSimTrade={(t) => {
                  // Show the bot's trade play out on the sim chart when it's on
                  // the market currently displayed.
                  if (sim && t?.forced_outcome && t.symbol === symbol) steerToOutcome(t);
                }}
                setBalance={setBalance}
                refresh={refresh}
                showToast={showToast}
              />
            )}

            {!stakeValid && stakeNum > 0 && (
              <p className="mt-2 text-center text-xs text-down">
                {stakeCents > balance ? (
                  demo ? (
                    <>
                      Not enough demo funds —{" "}
                      <button onClick={resetDemo} disabled={resettingDemo} className="underline">
                        {resettingDemo ? "resetting…" : "reset to $10,000"}
                      </button>
                    </>
                  ) : (
                    <>
                      Not enough balance —{" "}
                      <Link href="/wallet" className="underline">
                        deposit
                      </Link>
                    </>
                  )
                ) : stakeCents < MIN_STAKE ? (
                  "Below minimum ($0.50)."
                ) : (
                  "Above maximum stake."
                )}
              </p>
            )}
          </section>
      </div>

      {toast && (
        <div
          className={`fixed bottom-5 left-1/2 z-50 -translate-x-1/2 rounded-xl border px-4 py-3 text-sm font-medium shadow-card ${
            toast.ok ? "border-up/40 bg-surface text-up" : "border-down/40 bg-surface text-down"
          }`}
        >
          {toast.msg}
        </div>
      )}
    </div>
  );
}

/* ---------------- Contract controls ---------------- */

function RiseFallControls({
  auto,
  duration,
  setDuration,
  stakeCents,
  placing,
  stakeValid,
  onPlace,
}: any) {
  const payout = (stakeCents / 100) * PAYOUT_MULTIPLIER;
  return (
    <>
      <label className="mb-1 mt-3 block text-xs font-medium text-muted">
        <Timer className="mr-1 inline h-3.5 w-3.5" /> Duration
      </label>
      <div className="grid grid-cols-5 gap-1.5">
        {DURATIONS.map((d) => (
          <button
            key={d.seconds}
            onClick={() => setDuration(d.seconds)}
            className={`btn py-1.5 text-xs ${duration === d.seconds ? "btn-brand" : "btn-ghost"}`}
          >
            {d.label}
          </button>
        ))}
      </div>
      {auto ? null : (
      <>
      <PayoutRow label="Potential payout" value={money(cents(payout))} />
      <div className="mt-2.5 grid grid-cols-2 gap-2.5">
        <BuyButton color="up" label="RISE" sub={placing === "rise" ? "placing…" : "higher"} icon={<ArrowUp className="h-4 w-4" />} disabled={!stakeValid || placing} onClick={() => onPlace("rise")} />
        <BuyButton color="down" label="FALL" sub={placing === "fall" ? "placing…" : "lower"} icon={<ArrowDown className="h-4 w-4" />} disabled={!stakeValid || placing} onClick={() => onPlace("fall")} />
      </div>
      </>
      )}
    </>
  );
}

function MultControls({
  multiplier,
  setMultiplier,
  stakeCents,
  placing,
  stakeValid,
  onPlace,
}: any) {
  const stopOutPct = (100 / multiplier).toFixed(2);
  return (
    <>
      <label className="mb-1 mt-3 block text-xs font-medium text-muted">
        <TrendingUp className="mr-1 inline h-3.5 w-3.5" /> Multiplier
      </label>
      <div className="grid grid-cols-4 gap-1.5">
        {MULTIPLIERS.map((m) => (
          <button
            key={m}
            onClick={() => setMultiplier(m)}
            className={`btn py-1.5 text-xs ${multiplier === m ? "btn-brand" : "btn-ghost"}`}
          >
            x{m}
          </button>
        ))}
      </div>
      <div className="mt-3 rounded-xl border border-border bg-surface2/60 px-3 py-2 text-[11px]">
        <div className="flex items-center justify-between">
          <span className="text-muted">P&L moves</span>
          <span className="font-bold text-brand">{multiplier}× market</span>
        </div>
        <div className="mt-0.5 flex items-center justify-between">
          <span className="text-muted">Stop out at</span>
          <span className="font-bold text-down">{stopOutPct}% move</span>
        </div>
      </div>
      <div className="mt-2.5 grid grid-cols-2 gap-2.5">
        <BuyButton color="up" label="UP" sub={placing === "up" ? "placing…" : "higher"} icon={<ArrowUp className="h-4 w-4" />} disabled={!stakeValid || placing} onClick={() => onPlace("up")} />
        <BuyButton color="down" label="DOWN" sub={placing === "down" ? "placing…" : "lower"} icon={<ArrowDown className="h-4 w-4" />} disabled={!stakeValid || placing} onClick={() => onPlace("down")} />
      </div>
    </>
  );
}

const DIGIT_SUBTYPES: [DigitSubtype, string][] = [
  ["over_under", "Over / Under"],
  ["even_odd", "Even / Odd"],
  ["matches_differs", "Matches / Differs"],
];

function DigitControls({
  auto,
  subtype,
  setSubtype,
  barrier,
  setBarrier,
  ticks,
  setTicks,
  stakeCents,
  placing,
  stakeValid,
  onPlace,
}: any) {
  const stake = stakeCents / 100;
  function payoutFor(pred: string) {
    const mult = digitPayoutMult(subtype, pred, barrier);
    return { total: money(cents(stake * mult)), pct: `${Math.round((mult - 1) * 100)}%` };
  }

  const needsDigit = subtype !== "even_odd";

  return (
    <>
      <div className="mt-3 grid grid-cols-3 gap-1.5">
        {DIGIT_SUBTYPES.map(([s, label]) => (
          <button
            key={s}
            onClick={() => setSubtype(s)}
            className={`btn px-1 py-1.5 text-[10px] ${subtype === s ? "btn-brand" : "btn-ghost"}`}
          >
            {label}
          </button>
        ))}
      </div>

      {needsDigit && (
        <div className="mt-3 flex items-center justify-between rounded-xl border border-border bg-surface2/60 px-3 py-2">
          <span className="text-xs text-muted">
            {subtype === "over_under" ? "Barrier digit" : "Target digit"}
          </span>
          <div className="flex items-center gap-2">
            <span className="tabular flex h-7 w-7 items-center justify-center rounded-lg bg-brand text-sm font-bold text-white">
              {barrier}
            </span>
            <span className="text-[10px] text-muted">tap chart digits</span>
          </div>
        </div>
      )}

      {!auto && (
      <div className="mt-2.5 grid grid-cols-2 gap-2.5">
        {subtype === "even_odd" && (
          <>
            <DigitBuyButton label="EVEN" payout={payoutFor("even")} color="up" disabled={!stakeValid || placing} placing={placing === "even"} onClick={() => onPlace("even")} />
            <DigitBuyButton label="ODD" payout={payoutFor("odd")} color="down" disabled={!stakeValid || placing} placing={placing === "odd"} onClick={() => onPlace("odd")} />
          </>
        )}
        {subtype === "over_under" && (
          <>
            <DigitBuyButton label={`OVER ${barrier}`} payout={payoutFor("over")} color="up" disabled={!stakeValid || placing || barrier > 8} placing={placing === "over"} onClick={() => onPlace("over")} />
            <DigitBuyButton label={`UNDER ${barrier}`} payout={payoutFor("under")} color="down" disabled={!stakeValid || placing || barrier < 1} placing={placing === "under"} onClick={() => onPlace("under")} />
          </>
        )}
        {subtype === "matches_differs" && (
          <>
            <DigitBuyButton label={`MATCHES ${barrier}`} payout={payoutFor("matches")} color="up" disabled={!stakeValid || placing} placing={placing === "matches"} onClick={() => onPlace("matches")} />
            <DigitBuyButton label={`DIFFERS ${barrier}`} payout={payoutFor("differs")} color="down" disabled={!stakeValid || placing} placing={placing === "differs"} onClick={() => onPlace("differs")} />
          </>
        )}
      </div>
      )}
    </>
  );
}

/* ---------------- Small pieces ---------------- */

/* In-app price alert: pick a target price for the current market; you get a
   toast + chime the moment the live price crosses it (works while the tab is open). */
function AlertControl({
  current,
  dp,
  target,
  onArm,
  onClear,
}: {
  current: number | null;
  dp: number;
  target: number | null;
  onArm: (price: number) => void;
  onClear: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [val, setVal] = useState("");

  function openPopover() {
    setVal(current != null ? current.toFixed(dp) : "");
    setOpen(true);
  }

  function arm() {
    const p = Number(val);
    if (Number.isFinite(p) && p > 0) {
      onArm(p);
      setOpen(false);
    }
  }

  return (
    <div className="relative">
      <button
        onClick={() => (open ? setOpen(false) : openPopover())}
        title="Set a price alert"
        className={`flex h-6 items-center gap-1 rounded-full px-2 text-[10px] font-semibold transition ${
          target != null ? "bg-brand/15 text-brand" : "bg-surface2 text-muted hover:text-fg"
        }`}
      >
        {target != null ? <BellRing className="h-3 w-3" /> : <Bell className="h-3 w-3" />}
        {target != null ? target.toFixed(dp) : "Alert"}
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute left-0 top-full z-50 mt-1 w-52 rounded-xl border border-border bg-surface p-3 shadow-card">
            <div className="mb-1.5 text-[11px] font-semibold text-muted">Alert me when price hits</div>
            <div className="flex gap-1.5">
              <input
                className="input tabular h-9 text-sm"
                inputMode="decimal"
                value={val}
                onChange={(e) => setVal(e.target.value.replace(/[^0-9.]/g, ""))}
                onKeyDown={(e) => e.key === "Enter" && arm()}
                autoFocus
              />
              <button onClick={arm} className="btn btn-brand h-9 shrink-0 px-3 text-xs">
                Set
              </button>
            </div>
            {target != null && (
              <button
                onClick={() => {
                  onClear();
                  setOpen(false);
                }}
                className="mt-2 w-full text-[11px] text-down hover:underline"
              >
                Clear alert
              </button>
            )}
          </div>
        </>
      )}
    </div>
  );
}

/* Symbol dropdown in the chart header — the single place to switch markets. */
function MarketDropdown({ symbol, onSelect }: { symbol: string; onSelect: (s: string) => void }) {
  const [open, setOpen] = useState(false);
  const market = marketBySymbol(symbol)!;
  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex max-w-[56vw] items-center gap-1.5 rounded-lg px-1.5 py-0.5 text-sm font-bold transition hover:bg-surface2 sm:max-w-none sm:text-base"
      >
        <span className="truncate">{market.name}</span>
        <ChevronDown className={`h-4 w-4 shrink-0 text-muted transition ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute left-0 top-full z-50 mt-1 max-h-72 w-64 overflow-y-auto rounded-xl border border-border bg-surface p-1 shadow-card">
            {MARKETS.map((m) => (
              <button
                key={m.symbol}
                onClick={() => {
                  onSelect(m.symbol);
                  setOpen(false);
                }}
                className={`flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm transition ${
                  m.symbol === symbol ? "bg-brand/10 text-brand" : "hover:bg-surface2"
                }`}
              >
                <span className="font-medium">{m.name}</span>
                <span className="text-[10px] text-muted">{m.short}</span>
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

// Compact live open-position badges drawn over the chart, so the trade you just
// placed is visible playing out (countdown / live P&L) right on the price.
function ChartPositions({ trades, livePrice }: { trades: Trade[]; livePrice: number | null }) {
  const [now, setNow] = useState(() => Math.floor(Date.now() / 1000));
  useEffect(() => {
    if (!trades.length) return;
    const id = setInterval(() => setNow(Math.floor(Date.now() / 1000)), 500);
    return () => clearInterval(id);
  }, [trades.length]);
  if (!trades.length) return null;

  return (
    <div className="pointer-events-none absolute left-2 top-2 z-10 flex flex-col gap-1.5">
      {trades.slice(0, 3).map((t) => {
        const up = ["rise", "up", "even", "over", "matches"].includes(t.direction);
        const label =
          t.kind === "mult"
            ? `${up ? "UP" : "DOWN"} ×${t.multiplier}`
            : t.kind === "digit"
            ? `${t.direction.toUpperCase()}${t.subtype !== "even_odd" ? " " + t.barrier : ""}`
            : up
            ? "RISE"
            : "FALL";
        let right: React.ReactNode;
        if (t.kind === "mult") {
          const pnl =
            livePrice != null
              ? multiplierPnl({
                  direction: t.direction as "up" | "down",
                  entry: Number(t.entry_price),
                  current: livePrice,
                  stakeCents: Number(t.stake),
                  multiplier: Number(t.multiplier),
                })
              : null;
          right = (
            <span className={`tabular font-bold ${pnl == null ? "text-muted" : pnl >= 0 ? "text-up" : "text-down"}`}>
              {pnl == null ? "—" : money(pnl, { sign: true })}
            </span>
          );
        } else {
          const secs = Math.max(0, Number(t.expiry_epoch) - now);
          right = secs <= 0 ? <span className="font-semibold text-gold">settling…</span> : <span className="tabular font-bold">{secs}s</span>;
        }
        return (
          <div key={t.id} className="flex items-center gap-2 rounded-lg border border-border bg-bg/80 px-2.5 py-1 text-[11px] shadow-card backdrop-blur">
            <span className={`h-1.5 w-1.5 animate-pulse rounded-full ${up ? "bg-up" : "bg-down"}`} />
            <span className={`font-bold ${up ? "text-up" : "text-down"}`}>{label}</span>
            <span className="text-muted">{money(Number(t.stake))}</span>
            {right}
          </div>
        );
      })}
    </div>
  );
}

function ConnBadge({ connected }: { connected: boolean }) {
  return (
    <span
      className={`flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold ${
        connected ? "bg-up/10 text-up" : "bg-muted/10 text-muted"
      }`}
    >
      {connected ? <Wifi className="h-2.5 w-2.5" /> : <WifiOff className="h-2.5 w-2.5" />}
      {connected ? "LIVE" : "connecting"}
    </span>
  );
}

function ChartSkeleton({ connected }: { connected: boolean }) {
  return (
    <div className="flex h-full min-h-[220px] flex-col items-center justify-center gap-3">
      <div className="relative h-10 w-10">
        <div className="absolute inset-0 animate-ping rounded-full bg-brand/30" />
        <div className="absolute inset-2 rounded-full bg-brand/60" />
      </div>
      <p className="text-sm text-muted">{connected ? "Loading market…" : "Connecting to live market…"}</p>
    </div>
  );
}

function PayoutRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="mt-3 flex items-center justify-between rounded-xl border border-border bg-surface2/60 px-3 py-2">
      <span className="flex items-center gap-1.5 text-xs text-muted">
        <Zap className="h-3.5 w-3.5 text-gold" /> {label}
      </span>
      <span className="tabular font-bold text-brand">{value}</span>
    </div>
  );
}

function BuyButton({ color, label, sub, icon, disabled, onClick }: any) {
  const bg =
    color === "up"
      ? "linear-gradient(180deg,#00e3a0,#00b87e)"
      : "linear-gradient(180deg,#ff5b6a,#e13b4b)";
  return (
    <button onClick={onClick} disabled={disabled} className="btn flex-col gap-0 py-2.5 text-white" style={{ background: bg }}>
      <span className="flex items-center gap-1 text-sm font-bold">
        {icon} {label}
      </span>
      <span className="text-[10px] opacity-90">{sub}</span>
    </button>
  );
}

function DigitBuyButton({
  label,
  payout,
  color,
  disabled,
  placing,
  onClick,
}: {
  label: string;
  payout: { total: string; pct: string };
  color: "up" | "down";
  disabled: boolean;
  placing: boolean;
  onClick: () => void;
}) {
  const bg =
    color === "up"
      ? "linear-gradient(180deg,#00e3a0,#00b87e)"
      : "linear-gradient(180deg,#ff5b6a,#e13b4b)";
  return (
    <button onClick={onClick} disabled={disabled} className="btn flex-col items-stretch gap-0 px-3 py-2 text-white" style={{ background: bg }}>
      <span className="flex items-center justify-between">
        <span className="text-sm font-bold">{placing ? "placing…" : label}</span>
        <span className="text-[11px] font-bold opacity-95">+{payout.pct}</span>
      </span>
      <span className="text-left text-[10px] opacity-90">Payout {payout.total}</span>
    </button>
  );
}

/* ---------------- Positions ---------------- */

function OpenPositions({ trades, settled = [], onSettled, liveSymbol, livePrice, showToast, setBalance, onSelect }: any) {
  const [now, setNow] = useState(() => Math.floor(Date.now() / 1000));
  const settling = useRef<Set<number>>(new Set());
  const [closing, setClosing] = useState<number | null>(null);

  useEffect(() => {
    const id = setInterval(() => setNow(Math.floor(Date.now() / 1000)), 500);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    const expired = (trades as Trade[]).filter(
      (t) =>
        (t.kind === "rise_fall" || t.kind === "digit") &&
        t.status === "open" &&
        Number(t.expiry_epoch) <= now &&
        !settling.current.has(t.id)
    );
    if (!expired.length) return;
    (async () => {
      for (const t of expired) {
        settling.current.add(t.id);
        try {
          await fetch("/api/trade/settle", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ id: t.id }),
          });
        } catch {
          settling.current.delete(t.id);
        }
      }
      onSettled();
    })();
  }, [now, trades, onSettled]);

  async function closeMult(id: number, auto = false) {
    if (!auto) setClosing(id);
    try {
      const res = await fetch("/api/trade/close", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      const json = await res.json();
      if (!res.ok) {
        if (auto) settling.current.delete(id); // let it retry next tick
        else showToast(json.error || "Could not close.", false);
      } else {
        if (typeof json.balance === "number") setBalance(json.balance);
        const won = json.trade?.status === "won";
        showToast(auto ? "Stopped out — position closed" : won ? "Closed in profit" : "Position closed", won);
        onSettled();
      }
    } catch {
      if (auto) settling.current.delete(id);
      else showToast("Network error closing position.", false);
    } finally {
      if (!auto) setClosing(null);
    }
  }

  // Auto stop-out: the moment an open multiplier's live price reaches its
  // stop-out level, force-close it — the max a multiplier can lose is its stake
  // (the margin), so equity can never go negative. This mirrors a real broker
  // and closes the position INSTANTLY on the chart the trader is watching,
  // instead of waiting for the periodic server sweep (which also can't see the
  // simulated price on test/demo trades). Guarded by `settling` so it fires once.
  useEffect(() => {
    if (livePrice == null) return;
    const stopped = (trades as Trade[]).filter(
      (t) =>
        t.kind === "mult" &&
        t.status === "open" &&
        t.symbol === liveSymbol &&
        t.stop_out_price != null &&
        !settling.current.has(t.id) &&
        (t.direction === "up"
          ? livePrice <= Number(t.stop_out_price)
          : livePrice >= Number(t.stop_out_price))
    );
    for (const t of stopped) {
      settling.current.add(t.id);
      void closeMult(t.id, true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [livePrice, trades, liveSymbol]);

  const list = trades as Trade[];
  const settledList = (settled as Trade[]).filter((s) => !list.some((t) => t.id === s.id));
  if (!list.length && !settledList.length) {
    return (
      <div className="flex h-full min-h-[80px] items-center justify-center px-4 py-6 text-center text-xs text-muted">
        No open positions yet.
      </div>
    );
  }

  function digitLabel(t: Trade) {
    if (t.subtype === "even_odd") return t.direction.toUpperCase();
    if (t.subtype === "over_under") return `${t.direction.toUpperCase()} ${t.barrier}`;
    return `${t.direction === "matches" ? "MATCH" : "DIFF"} ${t.barrier}`;
  }

  function labelOf(t: Trade) {
    if (t.kind === "mult") return `${t.direction === "up" ? "UP" : "DOWN"} ×${t.multiplier}`;
    if (t.kind === "digit") return digitLabel(t);
    return t.direction === "rise" ? "RISE" : "FALL";
  }

  return (
    <div className="flex flex-col gap-2 p-2">
      {/* Just-settled trades resolving before they drop to history */}
      {settledList.map((t) => {
        const won = t.status === "won";
        const up = ["rise", "up", "even", "over", "matches"].includes(t.direction);
        const profit = won ? Number(t.payout) - Number(t.stake) : -Number(t.stake);
        return (
          <div
            key={`s-${t.id}`}
            onClick={() => onSelect?.(t)}
            className={`animate-settle-out flex cursor-pointer items-center justify-between rounded-xl border px-3.5 py-2.5 ${
              won ? "border-up/40 bg-up/10" : "border-down/40 bg-down/10"
            }`}
          >
            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <span className="text-sm font-semibold">{marketBySymbol(t.symbol)?.short ?? t.symbol}</span>
                <span className={`rounded px-1 py-0.5 text-[9px] font-bold ${up ? "bg-up/15 text-up" : "bg-down/15 text-down"}`}>{labelOf(t)}</span>
              </div>
              <div className={`text-[11px] font-semibold ${won ? "text-up" : "text-down"}`}>
                {won ? "WON" : "LOST"}
                {t.kind === "digit" && t.exit_digit != null ? ` · digit ${t.exit_digit}` : ""}
              </div>
            </div>
            <span className={`tabular text-sm font-bold ${won ? "text-up" : "text-down"}`}>{money(profit, { sign: true })}</span>
          </div>
        );
      })}
      {list.map((t) => {
        const m = marketBySymbol(t.symbol);
        const isLive = t.symbol === liveSymbol && livePrice != null;

        if (t.kind === "mult") {
          const pnl = isLive
            ? multiplierPnl({
                direction: t.direction as "up" | "down",
                entry: Number(t.entry_price),
                current: livePrice!,
                stakeCents: Number(t.stake),
                multiplier: Number(t.multiplier),
              })
            : null;
          const win = (pnl ?? 0) >= 0;
          return (
            <Row key={t.id} onClick={() => onSelect?.(t)} m={m?.short ?? t.symbol} tag={`${t.direction === "up" ? "UP" : "DOWN"} x${t.multiplier}`} tagColor={t.direction === "up" ? "up" : "down"} sub={`${money(Number(t.stake))} · ${Number(t.entry_price).toFixed(2)}`}>
              <span className={`tabular text-sm font-bold ${pnl == null ? "text-muted" : win ? "text-up" : "text-down"}`}>
                {pnl == null ? "—" : money(pnl, { sign: true })}
              </span>
              <button onClick={(e) => { e.stopPropagation(); closeMult(t.id); }} disabled={closing === t.id} className="btn btn-ghost px-2 py-1 text-[11px]">
                {closing === t.id ? "…" : "Close"}
              </button>
            </Row>
          );
        }

        const secs = Math.max(0, Number(t.expiry_epoch) - now);
        const isSettling = secs <= 0;

        if (t.kind === "digit") {
          const up = ["even", "over", "matches"].includes(t.direction);
          return (
            <Row key={t.id} onClick={() => onSelect?.(t)} m={m?.short ?? t.symbol} tag={digitLabel(t)} tagColor={up ? "up" : "down"} sub={`${money(Number(t.stake))} → ${money(Number(t.payout))}`}>
              {isSettling ? (
                <span className="text-xs font-medium text-gold">settling…</span>
              ) : (
                <span className="tabular text-base font-bold">{secs}s</span>
              )}
            </Row>
          );
        }

        const winning = isLive
          ? t.direction === "rise"
            ? livePrice! > t.entry_price
            : livePrice! < t.entry_price
          : null;
        return (
          <Row key={t.id} onClick={() => onSelect?.(t)} m={m?.short ?? t.symbol} tag={t.direction === "rise" ? "RISE" : "FALL"} tagColor={t.direction === "rise" ? "up" : "down"} sub={`${money(Number(t.stake))} → ${money(Number(t.payout))}`}>
            <div className="text-right">
              {isSettling ? (
                <span className="text-xs font-medium text-gold">settling…</span>
              ) : (
                <span className="tabular text-base font-bold">{secs}s</span>
              )}
              {isLive && !isSettling && (
                <div className={`text-[10px] font-semibold ${winning ? "text-up" : "text-down"}`}>
                  {winning ? "in the money" : "out of the money"}
                </div>
              )}
            </div>
          </Row>
        );
      })}
    </div>
  );
}

function Row({
  m,
  tag,
  tagColor,
  sub,
  children,
  onClick,
}: {
  m: string;
  tag: string;
  tagColor: "up" | "down";
  sub: string;
  children: React.ReactNode;
  onClick?: () => void;
}) {
  return (
    <div
      onClick={onClick}
      className={`flex items-center justify-between rounded-xl border border-border bg-surface2/40 px-3.5 py-2.5 ${
        onClick ? "cursor-pointer transition hover:border-brand/40 hover:bg-surface2/70" : ""
      }`}
    >
      <div className="min-w-0">
        <div className="flex items-center gap-1.5">
          <span className="text-sm font-semibold">{m}</span>
          <span className={`rounded px-1 py-0.5 text-[9px] font-bold ${tagColor === "up" ? "bg-up/15 text-up" : "bg-down/15 text-down"}`}>
            {tag}
          </span>
        </div>
        <div className="tabular text-[11px] text-muted">{sub}</div>
      </div>
      <div className="flex items-center gap-2">{children}</div>
    </div>
  );
}

function ClosedPositions({ trades, onSelect }: { trades: Trade[]; onSelect?: (t: Trade) => void }) {
  if (!trades.length) {
    return (
      <div className="flex h-full min-h-[80px] items-center justify-center px-4 py-6 text-center text-xs text-muted">
        No closed trades yet.
      </div>
    );
  }
  const label = (t: Trade) => {
    if (t.kind === "mult") return `${t.direction === "up" ? "UP" : "DOWN"} x${t.multiplier}`;
    if (t.kind === "digit")
      return t.subtype === "even_odd" ? t.direction.toUpperCase() : `${t.direction.toUpperCase()} ${t.barrier}`;
    return t.direction === "rise" ? "RISE" : "FALL";
  };
  const profit = (t: Trade) =>
    t.kind === "mult"
      ? Number(t.payout) - Number(t.stake)
      : t.status === "won"
      ? Number(t.payout) - Number(t.stake)
      : -Number(t.stake);

  return (
    <div className="flex flex-col gap-2 p-2">
      {trades.map((t) => {
        const won = t.status === "won";
        const up = ["rise", "up", "even", "over", "matches"].includes(t.direction);
        return (
          <Row key={t.id} onClick={() => onSelect?.(t)} m={marketBySymbol(t.symbol)?.short ?? t.symbol} tag={label(t)} tagColor={up ? "up" : "down"} sub={`${money(Number(t.stake))} stake`}>
            <span className={`tabular text-sm font-bold ${won ? "text-up" : "text-down"}`}>
              {money(profit(t), { sign: true })}
            </span>
          </Row>
        );
      })}
    </div>
  );
}
