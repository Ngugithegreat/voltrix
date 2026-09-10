"use client";

import { useEffect, useState } from "react";
import { TrendingUp } from "lucide-react";
import { money } from "@/lib/format";

type Win = { name: string; profitCents: number; market: string };

// A subtle, auto-scrolling ticker of recent wins — social proof for the landing
// page. Renders nothing until there's real data, so it never looks empty/fake.
export function WinsTicker() {
  const [wins, setWins] = useState<Win[]>([]);

  useEffect(() => {
    let alive = true;
    fetch("/api/public/wins", { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => {
        if (alive && Array.isArray(j.wins)) setWins(j.wins.filter((w: Win) => w.profitCents > 0));
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  if (wins.length < 3) return null; // need enough to scroll convincingly

  // Duplicate the list so the marquee loops seamlessly.
  const loop = [...wins, ...wins];

  return (
    <div className="relative overflow-hidden border-y border-border/60 bg-surface/40 py-2.5">
      {/* edge fades */}
      <div className="pointer-events-none absolute inset-y-0 left-0 z-10 w-16 bg-gradient-to-r from-bg to-transparent" />
      <div className="pointer-events-none absolute inset-y-0 right-0 z-10 w-16 bg-gradient-to-l from-bg to-transparent" />
      <div className="ticker-track flex w-max items-center gap-8">
        {loop.map((w, i) => (
          <span key={i} className="flex shrink-0 items-center gap-2 text-sm">
            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-up/15 text-up">
              <TrendingUp className="h-3.5 w-3.5" />
            </span>
            <span className="font-semibold">{w.name}</span>
            <span className="text-muted">won</span>
            <span className="tabular font-bold text-up">{money(w.profitCents)}</span>
            <span className="text-muted">on {w.market}</span>
          </span>
        ))}
      </div>
    </div>
  );
}
