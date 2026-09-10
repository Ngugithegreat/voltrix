"use client";

import { useMemo } from "react";
import type { Point } from "@/lib/useDerivFeed";
import { lastDigit } from "@/lib/markets";
import { BRAND_HEX, BRAND_RGB } from "@/lib/brand";

/**
 * Live last-digit frequency ring strip (0-9). Each digit is a circular gauge
 * whose fill reflects how often it has appeared recently; the current tick's
 * digit is highlighted. Clean and readable at a glance.
 */
export function DigitHeatmap({
  points,
  decimals,
  window = 50,
  onPick,
  selected,
  flash,
}: {
  points: Point[];
  decimals: number;
  window?: number;
  onPick?: (d: number) => void;
  selected?: number | null;
  flash?: { digit: number; won: boolean } | null;
}) {
  const { pcts, current, hot } = useMemo(() => {
    const recent = points.slice(-window);
    const counts = new Array(10).fill(0);
    for (const p of recent) counts[lastDigit(p.price, decimals)]++;
    const total = recent.length || 1;
    const pcts = counts.map((c) => (c / total) * 100);
    const current = recent.length ? lastDigit(recent[recent.length - 1].price, decimals) : null;
    let hot = 0;
    for (let i = 1; i < 10; i++) if (pcts[i] > pcts[hot]) hot = i;
    return { pcts, current, hot };
  }, [points, decimals, window]);

  const maxPct = Math.max(...pcts, 1);
  const R = 15;
  const C = 2 * Math.PI * R;

  return (
    <div className="grid grid-cols-10 gap-0.5 sm:gap-1.5">
      {pcts.map((pct, d) => {
        const isCurrent = d === current;
        const isHot = d === hot;
        const isSel = selected === d;
        const isFlash = !!flash && flash.digit === d;
        const flashColor = flash?.won ? "#00E39A" : "#FF4D6D";
        const frac = pct / maxPct;
        const stroke = isFlash ? flashColor : isCurrent ? BRAND_HEX : isHot ? "#00E39A" : "#8b93a6";
        return (
          <button
            key={d}
            onClick={onPick ? () => onPick(d) : undefined}
            className={`group flex flex-col items-center gap-0.5 rounded-lg py-1 transition sm:gap-1 sm:rounded-xl sm:py-1.5 ${
              isSel ? "bg-brand/10 ring-1 ring-brand" : ""
            } ${onPick ? "cursor-pointer hover:bg-surface2" : "cursor-default"}`}
          >
            <div
              className={`relative h-8 w-8 transition-transform duration-200 sm:h-12 sm:w-12 ${
                isFlash ? "z-10 scale-125" : ""
              }`}
            >
              {/* WON/LOST pill + caret above the settled digit */}
              {isFlash && (
                <>
                  <span
                    className="absolute -top-6 left-1/2 -translate-x-1/2 whitespace-nowrap rounded px-1.5 py-0.5 text-[8px] font-black uppercase tracking-wide text-white shadow-card sm:text-[9px]"
                    style={{ background: flashColor }}
                  >
                    {flash!.won ? "Won" : "Lost"}
                  </span>
                  <span
                    className="absolute -top-1.5 left-1/2 h-0 w-0 -translate-x-1/2 border-x-[5px] border-t-[6px] border-x-transparent"
                    style={{ borderTopColor: flashColor }}
                  />
                </>
              )}
              {isCurrent && !isFlash && (
                <span className="absolute -top-2 left-1/2 h-0 w-0 -translate-x-1/2 border-x-4 border-t-4 border-x-transparent border-t-brand" />
              )}
              <svg viewBox="0 0 40 40" className="h-8 w-8 sm:h-12 sm:w-12">
                {isFlash && (
                  <circle cx="20" cy="20" r={R + 3} fill={flashColor} fillOpacity={0.14}>
                    <animate attributeName="r" values={`${R};${R + 4};${R}`} dur="0.9s" repeatCount="indefinite" />
                    <animate attributeName="fill-opacity" values="0.22;0.05;0.22" dur="0.9s" repeatCount="indefinite" />
                  </circle>
                )}
                <circle cx="20" cy="20" r={R} fill="none" stroke="rgb(var(--border))" strokeWidth="3.5" />
                <circle
                  cx="20"
                  cy="20"
                  r={R}
                  fill="none"
                  stroke={stroke}
                  strokeWidth={isFlash ? 4.5 : 3.5}
                  strokeLinecap="round"
                  strokeDasharray={C}
                  strokeDashoffset={isFlash ? 0 : C * (1 - Math.max(0.04, frac))}
                  transform="rotate(-90 20 20)"
                  style={
                    isFlash
                      ? { filter: `drop-shadow(0 0 8px ${flashColor})` }
                      : isCurrent
                      ? { filter: `drop-shadow(0 0 4px rgba(${BRAND_RGB},0.6))` }
                      : undefined
                  }
                />
                <text
                  x="20"
                  y="20"
                  textAnchor="middle"
                  dominantBaseline="central"
                  fontSize={isFlash ? 17 : 14}
                  fontWeight={isFlash ? 800 : 700}
                  fill={isFlash ? flashColor : isCurrent ? BRAND_HEX : "rgb(var(--fg))"}
                >
                  {d}
                </text>
              </svg>
            </div>
            <span className="tabular text-[9px] font-semibold text-muted sm:text-[10px]">{pct.toFixed(0)}%</span>
          </button>
        );
      })}
    </div>
  );
}
