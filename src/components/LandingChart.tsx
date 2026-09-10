"use client";

import { useDerivFeed } from "@/lib/useDerivFeed";
import { PriceChart } from "./PriceChart";

export function LandingChart() {
  const feed = useDerivFeed("R_100");
  const rising =
    feed.last && feed.prev ? feed.last.price >= feed.prev.price : true;

  return (
    <div className="card p-4">
      <div className="mb-1 flex items-center justify-between">
        <div>
          <div className="text-sm font-bold">Volatility 100 Index</div>
          <div className="flex items-center gap-1.5 text-[11px] text-muted">
            <span
              className={`h-1.5 w-1.5 rounded-full ${
                feed.connected ? "bg-up animate-pulseSoft" : "bg-muted"
              }`}
            />
            {feed.connected ? "Live market" : "connecting…"}
          </div>
        </div>
        <div
          className={`tabular text-2xl font-bold ${rising ? "text-up" : "text-down"}`}
        >
          {feed.last ? feed.last.price.toFixed(2) : "—"}
        </div>
      </div>
      <PriceChart points={feed.points} up={rising} />
    </div>
  );
}
