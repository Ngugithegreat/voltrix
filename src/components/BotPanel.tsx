"use client";

import { useEffect, useRef, useState } from "react";
import { Play, Square, Bot, Target, ShieldAlert } from "lucide-react";
import { money, cents } from "@/lib/format";
import { MAX_STAKE, DigitSubtype, marketBySymbol } from "@/lib/markets";
import type { MarketTick } from "@/lib/useDerivFeed";
import { primeAudio } from "@/lib/feedback";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

type Stats = { runs: number; wins: number; losses: number; pnlCents: number; stakeCents: number };
type RunLog = { n: number; label: string; stakeCents: number; profitCents: number; won: boolean };

const PRESETS = {
  Conservative: { martingale: "1.5", targetProfit: "20", stopLoss: "15", maxRuns: "30" },
  Balanced: { martingale: "2", targetProfit: "50", stopLoss: "30", maxRuns: "50" },
  Aggressive: { martingale: "2.5", targetProfit: "150", stopLoss: "80", maxRuns: "100" },
} as const;
type PresetName = keyof typeof PRESETS;

export function BotPanel({
  symbol,
  contract,
  subtype,
  barrier,
  ticks,
  duration,
  baseStakeCents,
  stakeValid,
  markets,
  sim,
  demo,
  getSimEntry,
  onSimTrade,
  presetSide,
  presetKey,
  setBalance,
  refresh,
  showToast,
}: {
  symbol: string;
  contract: "rise_fall" | "digit";
  subtype: DigitSubtype;
  barrier: number;
  ticks: number;
  duration: number;
  baseStakeCents: number;
  stakeValid: boolean;
  markets: Record<string, MarketTick>;
  sim?: boolean;
  demo?: boolean;
  getSimEntry?: () => { price: number; epoch: number } | null;
  onSimTrade?: (trade: any) => void;
  presetSide?: string;
  presetKey?: number;
  setBalance: (b: number) => void;
  refresh: () => void;
  showToast: (m: string, ok: boolean) => void;
}) {
  const sides: [string, string] =
    contract === "rise_fall"
      ? ["rise", "fall"]
      : subtype === "even_odd"
      ? ["even", "odd"]
      : subtype === "over_under"
      ? ["over", "under"]
      : ["matches", "differs"];

  const [side, setSide] = useState(sides[0]);
  const [martingale, setMartingale] = useState<string>(PRESETS.Balanced.martingale);
  const [targetProfit, setTargetProfit] = useState<string>(PRESETS.Balanced.targetProfit);
  const [stopLoss, setStopLoss] = useState<string>(PRESETS.Balanced.stopLoss);
  const [maxRuns, setMaxRuns] = useState<string>(PRESETS.Balanced.maxRuns);
  const [running, setRunning] = useState(false);
  const [stats, setStats] = useState<Stats>({ runs: 0, wins: 0, losses: 0, pnlCents: 0, stakeCents: baseStakeCents });
  const [log, setLog] = useState<RunLog[]>([]);
  const [botAlert, setBotAlert] = useState<{ kind: "tp" | "sl"; amount: number; pnl: number } | null>(null);
  const stopRef = useRef(false);

  // Keep the bot side valid when the contract / subtype changes.
  useEffect(() => {
    if (!sides.includes(side)) setSide(sides[0]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subtype, contract]);

  // When the Entry Scanner loads a pick, set the bot to that side.
  useEffect(() => {
    if (presetSide) setSide(presetSide);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [presetKey]);

  async function placeAndSettle(stakeCents: number) {
    const short = marketBySymbol(symbol)?.short ?? symbol;
    const label = `${short} ${side.toUpperCase()}${contract === "digit" && subtype !== "even_odd" ? " " + barrier : ""}`;
    const body: Record<string, unknown> =
      contract === "rise_fall"
        ? { kind: "rise_fall", symbol, direction: side, stake: stakeCents, duration }
        : { kind: "digit", symbol, direction: side, stake: stakeCents, subtype, barrier, ticks };

    // Demo vs test/sim. DEMO: flag the trade as demo so it debits/credits the
    // virtual demo_balance (never real money) and the server rolls its own
    // favourable rate. REAL test/sim: flag testMode so the server rolls by the
    // admin win %. Either way, when the trade is on the market currently
    // on-screen, send the sim's price as entry so the chart line matches.
    if (sim) {
      if (demo) body.demo = true;
      else body.testMode = true;
      if (getSimEntry && body.symbol === symbol) {
        const e = getSimEntry();
        if (e) body.entry = e;
      }
    }

    const res = await fetch("/api/trade", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const j = await res.json();
    if (!res.ok) return { error: j.error || "Trade failed." };
    if (typeof j.balance === "number") setBalance(j.balance);
    const trade = j.trade;

    // Let the terminal play the bot's trade out on the sim chart.
    if (sim && onSimTrade) onSimTrade(trade);
    // Surface the freshly-opened trade in the Open positions panel while it runs.
    refresh();

    const expiryMs = Number(trade.expiry_epoch) * 1000;
    while (Date.now() < expiryMs + 400) {
      if (stopRef.current) break;
      await sleep(300);
    }
    for (let i = 0; i < 20 && !stopRef.current; i++) {
      const sr = await fetch("/api/trade/settle", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: trade.id }),
      });
      const sj = await sr.json();
      if (sr.ok && sj.trade && sj.trade.status !== "open") {
        if (typeof sj.balance === "number") setBalance(sj.balance);
        const profit = sj.trade.status === "won" ? Number(sj.trade.payout) - stakeCents : -stakeCents;
        return { status: sj.trade.status as "won" | "lost", profit, label };
      }
      await sleep(1000);
    }
    return { error: "Could not settle in time." };
  }

  async function run() {
    if (!stakeValid) return showToast("Set a valid stake first.", false);
    primeAudio();
    stopRef.current = false;
    setRunning(true);
    setLog([]);
    const mult = Math.max(1, Number(martingale) || 2);
    const tpCents = cents(Number(targetProfit) || 0);
    const slCents = cents(Number(stopLoss) || 0);
    const runsCap = Math.max(1, Math.round(Number(maxRuns) || 50));

    let stake = baseStakeCents;
    let pnl = 0, runs = 0, wins = 0, losses = 0;
    let reason = "Bot stopped";
    setStats({ runs, wins, losses, pnlCents: 0, stakeCents: stake });

    while (!stopRef.current) {
      if (runs >= runsCap) { reason = "Max runs reached"; break; }
      if (tpCents > 0 && pnl >= tpCents) { reason = "🎯 Target profit reached"; break; }
      if (slCents > 0 && -pnl >= slCents) { reason = "🛑 Stop loss reached"; break; }

      const r = await placeAndSettle(stake);
      if ("soft" in r && r.soft) { await sleep(1200); continue; }
      if ("error" in r) { reason = r.error!; break; }

      runs++;
      pnl += r.profit;
      const won = r.status === "won";
      if (won) { wins++; stake = baseStakeCents; } else { losses++; stake = Math.min(Math.round(stake * mult), MAX_STAKE); }

      setStats({ runs, wins, losses, pnlCents: pnl, stakeCents: stake });
      setLog((prev) => [{ n: runs, label: r.label!, stakeCents: 0, profitCents: r.profit, won }, ...prev].slice(0, 12));
      refresh();
      await sleep(500);
    }

    stopRef.current = false;
    setRunning(false);
    // Pop an alert when a target / stop was hit; toast for other stops.
    if (reason.includes("Target profit")) setBotAlert({ kind: "tp", amount: tpCents, pnl });
    else if (reason.includes("Stop loss")) setBotAlert({ kind: "sl", amount: slCents, pnl });
    else showToast(`${reason} · P&L ${money(pnl, { sign: true })}`, pnl >= 0);
  }

  function stop() {
    stopRef.current = true;
    setRunning(false);
  }

  return (
    <div className="mt-3 space-y-3">
      {/* Target / stop alert popup */}
      {botAlert && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setBotAlert(null)} />
          <div
            className={`relative w-full max-w-xs rounded-2xl border bg-surface p-6 text-center shadow-glow ${
              botAlert.kind === "tp" ? "border-up/40" : "border-down/40"
            }`}
          >
            <div
              className={`mx-auto flex h-14 w-14 items-center justify-center rounded-full ${
                botAlert.kind === "tp" ? "bg-up/15 text-up" : "bg-down/15 text-down"
              }`}
            >
              {botAlert.kind === "tp" ? <Target className="h-7 w-7" /> : <ShieldAlert className="h-7 w-7" />}
            </div>
            <div className="mt-3 text-lg font-bold">
              {botAlert.kind === "tp" ? "Target profit reached 🎯" : "Stop loss reached 🛑"}
            </div>
            <p className="mt-1 text-sm text-muted">
              Your {botAlert.kind === "tp" ? "target profit" : "stop loss"} of{" "}
              <b className="text-fg">{money(botAlert.amount)}</b> was hit, so the bot stopped.
            </p>
            <div className="mt-3 rounded-xl border border-border bg-surface2/60 py-2">
              <div className="text-[10px] uppercase tracking-wider text-muted">Session P&amp;L</div>
              <div className={`tabular text-xl font-black ${botAlert.pnl >= 0 ? "text-up" : "text-down"}`}>
                {money(botAlert.pnl, { sign: true })}
              </div>
            </div>
            <button onClick={() => setBotAlert(null)} className="btn btn-brand mt-4 w-full py-2.5 text-sm">
              Done
            </button>
          </div>
        </div>
      )}

      {/* Side the bot trades */}
      <div>
        <label className="mb-1 block text-xs font-medium text-muted">Bot trades</label>
        <div className="grid grid-cols-2 gap-2">
          {sides.map((s) => (
            <button key={s} disabled={running} onClick={() => setSide(s)} className={`btn py-2 text-xs ${side === s ? "btn-brand" : "btn-ghost"}`}>
              {s.toUpperCase()}
              {contract === "digit" && subtype !== "even_odd" ? ` ${barrier}` : ""}
            </button>
          ))}
        </div>
      </div>

      {/* Params */}
      <div className="grid grid-cols-2 gap-2">
        <BotInput label="Martingale ×" value={martingale} onChange={setMartingale} disabled={running} />
        <BotInput label="Max runs" value={maxRuns} onChange={setMaxRuns} disabled={running} />
        <BotInput label="Target profit ($)" value={targetProfit} onChange={setTargetProfit} disabled={running} icon={<Target className="h-3 w-3 text-up" />} />
        <BotInput label="Stop loss ($)" value={stopLoss} onChange={setStopLoss} disabled={running} icon={<ShieldAlert className="h-3 w-3 text-down" />} />
      </div>

      {(running || stats.runs > 0) && (
        <div className="grid grid-cols-4 gap-2 rounded-xl border border-border bg-surface2/60 p-2 text-center">
          <BotStat label="Runs" value={String(stats.runs)} />
          <BotStat label="Wins" value={String(stats.wins)} accent="up" />
          <BotStat label="Losses" value={String(stats.losses)} accent="down" />
          <BotStat label="P&L" value={money(stats.pnlCents, { sign: true })} accent={stats.pnlCents >= 0 ? "up" : "down"} />
        </div>
      )}

      {running ? (
        <button onClick={stop} className="btn w-full py-3 text-white" style={{ background: "linear-gradient(180deg,#ff5b6a,#e13b4b)" }}>
          <Square className="h-4 w-4" /> Stop bot · next stake {money(stats.stakeCents)}
        </button>
      ) : (
        <button onClick={run} disabled={!stakeValid} className="btn btn-brand w-full py-3">
          <Play className="h-4 w-4" /> Start bot
        </button>
      )}

      {/* Run history */}
      {log.length > 0 && (
        <div className="rounded-xl border border-border bg-surface2/60">
          <div className="border-b border-border px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted">
            Run history
          </div>
          <div className="max-h-28 overflow-y-auto">
            {log.map((r) => (
              <div key={r.n} className="flex items-center justify-between px-3 py-1.5 text-[11px]">
                <span className="text-muted">
                  #{r.n} <span className="text-white">{r.label}</span>
                </span>
                <span className={`tabular font-bold ${r.won ? "text-up" : "text-down"}`}>
                  {money(r.profitCents, { sign: true })}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      <p className="flex items-start gap-1.5 text-[10px] leading-relaxed text-muted">
        <Bot className="mt-0.5 h-3 w-3 shrink-0" />
        The bot auto-places trades and multiplies your stake after a loss (martingale). It stops at
        your target profit, stop loss, or max runs. Keep this tab open while it runs.
      </p>
    </div>
  );
}

function BotInput({ label, value, onChange, disabled, icon }: { label: string; value: string; onChange: (v: string) => void; disabled?: boolean; icon?: React.ReactNode }) {
  return (
    <div>
      <label className="mb-1 flex items-center gap-1 text-[10px] font-medium text-muted">{icon} {label}</label>
      <input className="input tabular py-2 text-sm" inputMode="decimal" value={value} disabled={disabled} onChange={(e) => onChange(e.target.value.replace(/[^0-9.]/g, ""))} />
    </div>
  );
}

function BotStat({ label, value, accent }: { label: string; value: string; accent?: "up" | "down" }) {
  const c = accent === "up" ? "text-up" : accent === "down" ? "text-down" : "text-fg";
  return (
    <div>
      <div className="text-[9px] uppercase tracking-wider text-muted">{label}</div>
      <div className={`tabular text-sm font-bold ${c}`}>{value}</div>
    </div>
  );
}
