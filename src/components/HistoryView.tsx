"use client";

import { useMemo, useState } from "react";
import { useApp, Trade, Txn } from "./app-context";
import { marketBySymbol } from "@/lib/markets";
import { money, shortTime, txnLabel, methodLabel } from "@/lib/format";
import { ArrowUp, ArrowDown, ArrowDownToLine, ArrowUpFromLine } from "lucide-react";
import { TradeReceipt } from "./TradeReceipt";

type Tab = "trades" | "transactions";
type TradeFilter = "all" | "rise_fall" | "digit" | "mult";

const FILTERS: [TradeFilter, string][] = [
  ["all", "All"],
  ["rise_fall", "Rise/Fall"],
  ["digit", "Digits"],
  ["mult", "Multipliers"],
];

export function HistoryView() {
  const { data, demo } = useApp();
  // History is scoped to the active account (real vs demo).
  const trades = (data?.closedTrades ?? []).filter((t) => !!t.is_demo === demo);
  const txns = (data?.transactions ?? []).filter((t) => !!t.is_demo === demo);

  const [tab, setTab] = useState<Tab>("trades");
  const [filter, setFilter] = useState<TradeFilter>("all");
  const [receipt, setReceipt] = useState<Trade | null>(null);

  const wins = trades.filter((t) => t.status === "won").length;
  const losses = trades.filter((t) => t.status === "lost").length;
  const settled = wins + losses;
  const winRate = settled ? Math.round((wins / settled) * 100) : 0;
  const pnl = trades.reduce((sum, t) => sum + tradeProfit(t), 0);

  const shown = useMemo(
    () => (filter === "all" ? trades : trades.filter((t) => t.kind === filter)),
    [trades, filter]
  );

  return (
    <div className="space-y-5">
      <TradeReceipt trade={receipt} onClose={() => setReceipt(null)} />
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Trades" value={String(settled)} />
        <Stat label="Win rate" value={`${winRate}%`} accent="brand" />
        <Stat label="Wins" value={String(wins)} accent="up" />
        <Stat label="Net P&L" value={money(pnl, { sign: true })} accent={pnl >= 0 ? "up" : "down"} />
      </div>

      {/* Trades / Transactions toggle */}
      <div className="flex w-full max-w-xs rounded-xl bg-surface2 p-1">
        {(["trades", "transactions"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`flex-1 rounded-lg py-1.5 text-sm font-semibold capitalize transition ${
              tab === t ? "bg-brand text-white shadow-glow" : "text-muted hover:text-fg"
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {tab === "trades" ? (
        <div className="card overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-5 py-3">
            <span className="font-bold">Trade history</span>
            <div className="flex flex-wrap gap-1">
              {FILTERS.map(([f, label]) => (
                <button
                  key={f}
                  onClick={() => setFilter(f)}
                  className={`rounded-lg px-2.5 py-1 text-xs font-semibold transition ${
                    filter === f ? "bg-surface2 text-fg" : "text-muted hover:text-fg"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
          {shown.length === 0 ? (
            <div className="p-8 text-center text-sm text-muted">
              No trades here yet. Head to the terminal and place your first trade.
            </div>
          ) : (
            <div className="divide-y divide-border">
              {shown.map((t) => (
                <TradeRow key={t.id} t={t} onSelect={setReceipt} />
              ))}
            </div>
          )}
        </div>
      ) : (
        <div className="card overflow-hidden">
          <div className="border-b border-border px-5 py-3 font-bold">Transactions</div>
          {txns.length === 0 ? (
            <div className="p-8 text-center text-sm text-muted">No deposits or withdrawals yet.</div>
          ) : (
            <div className="divide-y divide-border">
              {txns
                .filter((x) => ["deposit", "withdrawal", "bonus", "adjustment"].includes(x.type))
                .map((x) => (
                  <TxnRow key={x.id} x={x} />
                ))}
            </div>
          )}
        </div>
      )}

      <p className="px-1 text-center text-[11px] leading-relaxed text-muted">
        Trading synthetic indices carries risk and may not be suitable for everyone. Only trade with
        money you can afford to lose. Past results don’t guarantee future outcomes.
      </p>
    </div>
  );
}

function tradeProfit(t: Trade): number {
  if (t.kind === "mult") return Number(t.payout) - Number(t.stake);
  return t.status === "won" ? Number(t.payout) - Number(t.stake) : -Number(t.stake);
}

function TradeRow({ t, onSelect }: { t: Trade; onSelect?: (t: Trade) => void }) {
  const m = marketBySymbol(t.symbol);
  const dp = m?.decimals ?? 2;
  const won = t.status === "won";
  const profit = tradeProfit(t);
  const up = ["rise", "up", "even", "over", "matches"].includes(t.direction);
  const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
  const dirLabel =
    t.kind === "mult"
      ? `${up ? "Up" : "Down"} ×${t.multiplier}`
      : t.kind === "digit"
      ? t.subtype === "even_odd"
        ? cap(t.direction)
        : `${cap(t.direction)} ${t.barrier}`
      : up
      ? "Rise"
      : "Fall";

  // A plain-English receipt of what happened.
  const detail =
    t.kind === "digit"
      ? `Exit digit ${t.exit_digit ?? "—"} · ${money(Number(t.stake))} → ${won ? money(Number(t.payout)) : "$0.00"}`
      : `${Number(t.entry_price).toFixed(dp)} → ${t.exit_price != null ? Number(t.exit_price).toFixed(dp) : "—"} · ${money(Number(t.stake))} stake`;

  return (
    <div
      onClick={() => onSelect?.(t)}
      className={`flex items-center justify-between px-5 py-3 ${onSelect ? "cursor-pointer transition hover:bg-surface2/50" : ""}`}
    >
      <div className="flex items-center gap-3">
        <div className={`flex h-8 w-8 items-center justify-center rounded-lg ${up ? "bg-up/15 text-up" : "bg-down/15 text-down"}`}>
          {up ? <ArrowUp className="h-4 w-4" /> : <ArrowDown className="h-4 w-4" />}
        </div>
        <div>
          <div className="text-sm font-semibold">
            {m?.short ?? t.symbol} <span className="font-normal text-muted">{dirLabel}</span>
          </div>
          <div className="tabular text-[11px] text-muted">
            {detail} · {shortTime(t.created_at)}
          </div>
        </div>
      </div>
      <div className="text-right">
        <div className={`tabular text-sm font-bold ${won ? "text-up" : "text-down"}`}>
          {money(profit, { sign: true })}
        </div>
        <div className={`text-[10px] font-semibold uppercase ${won ? "text-up" : "text-down"}`}>
          {won ? "Won" : "Lost"}
        </div>
      </div>
    </div>
  );
}

function TxnRow({ x }: { x: Txn }) {
  const isCredit = Number(x.amount) >= 0;
  // Bonus credits appear to the user as a normal deposit.
  const kind = x.type === "bonus" ? "deposit" : x.type;
  const showMethod = x.type !== "bonus";
  const Icon = kind === "withdrawal" ? ArrowUpFromLine : ArrowDownToLine;
  const statusColor =
    x.status === "completed" ? "text-up" : x.status === "rejected" ? "text-down" : "text-gold";
  return (
    <div className="flex items-center justify-between px-5 py-3">
      <div className="flex items-center gap-3">
        <div className={`flex h-8 w-8 items-center justify-center rounded-lg ${isCredit ? "bg-up/15 text-up" : "bg-gold/15 text-gold"}`}>
          <Icon className="h-4 w-4" />
        </div>
        <div>
          <div className="text-sm font-semibold">
            {txnLabel(kind)} <span className="font-normal text-muted">{showMethod ? methodLabel(x.method) : ""}</span>
          </div>
          <div className="tabular text-[11px] text-muted">
            {x.reference ? `${x.reference} · ` : ""}
            {shortTime(x.created_at)}
          </div>
        </div>
      </div>
      <div className="text-right">
        <div className={`tabular text-sm font-bold ${isCredit ? "text-up" : "text-fg"}`}>
          {isCredit ? "+" : ""}
          {money(Math.abs(Number(x.amount)))}
        </div>
        <div className={`text-[10px] font-semibold uppercase ${statusColor}`}>{x.status}</div>
      </div>
    </div>
  );
}

function Stat({ label, value, accent }: { label: string; value: string; accent?: "brand" | "up" | "down" }) {
  const color =
    accent === "brand" ? "text-brand" : accent === "up" ? "text-up" : accent === "down" ? "text-down" : "text-fg";
  return (
    <div className="card p-4">
      <div className="text-[11px] uppercase tracking-wider text-muted">{label}</div>
      <div className={`tabular mt-1 text-xl font-bold ${color}`}>{value}</div>
    </div>
  );
}
