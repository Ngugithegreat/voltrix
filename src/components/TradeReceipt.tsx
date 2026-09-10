"use client";

import { useEffect } from "react";
import { X, CheckCircle2, XCircle, Clock, ArrowUpRight, ArrowDownRight } from "lucide-react";
import type { Trade } from "./app-context";
import { money, shortTime } from "@/lib/format";
import { marketBySymbol, decimalsFor } from "@/lib/markets";
import { BRAND_NAME } from "@/lib/brand";

// A clean, shareable-looking trade receipt — the detail card that makes the
// platform feel like a real broker. Opens for any position (open or settled).
export function TradeReceipt({ trade, onClose }: { trade: Trade | null; onClose: () => void }) {
  useEffect(() => {
    if (!trade) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [trade, onClose]);

  if (!trade) return null;

  const t = trade;
  const dp = decimalsFor(t.symbol);
  const short = marketBySymbol(t.symbol)?.short ?? t.symbol;
  const open = t.status === "open";
  const won = t.status === "won";
  const up = ["rise", "up", "even", "over", "matches"].includes(t.direction);

  const contractLabel =
    t.kind === "mult"
      ? `Multiplier ${t.direction === "up" ? "Up" : "Down"} ×${t.multiplier}`
      : t.kind === "digit"
      ? `Digits · ${t.direction.toUpperCase()}${t.subtype !== "even_odd" ? " " + t.barrier : ""}`
      : `Rise/Fall · ${t.direction === "rise" ? "Rise" : "Fall"}`;

  const stake = Number(t.stake);
  const payout = Number(t.payout);
  const pnl = open ? 0 : won ? payout - stake : -stake;

  const statusColor = open ? "text-gold" : won ? "text-up" : "text-down";
  const StatusIcon = open ? Clock : won ? CheckCircle2 : XCircle;
  const statusText = open ? "In progress" : won ? "Won" : "Lost";

  return (
    <div
      className="fixed inset-0 z-[60] flex items-end justify-center bg-black/60 p-0 backdrop-blur-sm sm:items-center sm:p-4"
      onClick={onClose}
    >
      <div
        className="card w-full max-w-md overflow-hidden rounded-t-3xl sm:rounded-3xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="relative flex items-center justify-between border-b border-border px-5 py-4">
          <div className="flex items-center gap-2">
            <span className={`flex h-9 w-9 items-center justify-center rounded-full bg-surface2 ${statusColor}`}>
              <StatusIcon className="h-5 w-5" />
            </span>
            <div>
              <div className="text-sm font-bold">Trade receipt</div>
              <div className="text-[11px] text-muted">#{t.id}{t.is_demo ? " · Demo" : ""}</div>
            </div>
          </div>
          <button onClick={onClose} className="btn btn-ghost h-8 w-8 p-0">
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Hero: result + P&L */}
        <div className="flex flex-col items-center gap-1 px-5 py-6 text-center">
          <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-bold ${
            open ? "bg-gold/15 text-gold" : won ? "bg-up/15 text-up" : "bg-down/15 text-down"
          }`}>
            <StatusIcon className="h-3.5 w-3.5" /> {statusText}
          </span>
          {!open && (
            <div className={`tabular mt-2 text-3xl font-black ${won ? "text-up" : "text-down"}`}>
              {money(pnl, { sign: true })}
            </div>
          )}
          <div className="mt-1 flex items-center gap-1.5 text-sm text-muted">
            <span className="font-semibold text-fg">{short}</span>
            <span className={`inline-flex items-center gap-0.5 rounded px-1.5 py-0.5 text-[11px] font-bold ${up ? "bg-up/15 text-up" : "bg-down/15 text-down"}`}>
              {up ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
              {contractLabel}
            </span>
          </div>
        </div>

        {/* Details */}
        <div className="divide-y divide-border border-t border-border text-sm">
          <RowKV k="Stake" v={money(stake)} />
          <RowKV k={open ? "Potential payout" : won ? "Payout" : "Payout"} v={money(payout)} />
          <RowKV k="Entry price" v={Number(t.entry_price).toFixed(dp)} />
          {t.exit_price != null && <RowKV k="Exit price" v={Number(t.exit_price).toFixed(dp)} />}
          {t.kind === "digit" && t.exit_digit != null && <RowKV k="Last digit" v={String(t.exit_digit)} />}
          {t.kind === "mult" && t.stop_out_price != null && (
            <RowKV k="Stop-out" v={Number(t.stop_out_price).toFixed(dp)} />
          )}
          <RowKV k="Placed" v={shortTime(t.created_at)} />
          {t.settled_at && <RowKV k="Settled" v={shortTime(t.settled_at)} />}
        </div>

        <div className="px-5 py-3 text-center text-[11px] text-muted">
          {BRAND_NAME} · contract #{t.id}
        </div>
      </div>
    </div>
  );
}

function RowKV({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex items-center justify-between px-5 py-2.5">
      <span className="text-muted">{k}</span>
      <span className="tabular font-semibold">{v}</span>
    </div>
  );
}
