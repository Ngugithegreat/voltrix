"use client";

import type { Point } from "@/lib/useDerivFeed";

export function Sparkline({
  points,
  up,
  width = 88,
  height = 30,
}: {
  points: Point[];
  up: boolean;
  width?: number;
  height?: number;
}) {
  if (points.length < 2) {
    return <div style={{ width, height }} />;
  }
  const ys = points.map((p) => p.price);
  const min = Math.min(...ys);
  const max = Math.max(...ys);
  const range = max - min || 1;
  const stepX = width / (points.length - 1);
  const color = up ? "#00E39A" : "#FF4D6D";

  const coords = points.map((p, i) => {
    const x = i * stepX;
    const y = height - ((p.price - min) / range) * (height - 4) - 2;
    return [x, y] as const;
  });
  const d = coords.map(([x, y], i) => `${i === 0 ? "M" : "L"}${x.toFixed(1)} ${y.toFixed(1)}`).join(" ");
  const areaD = `${d} L${width} ${height} L0 ${height} Z`;
  const gid = `sg-${up ? "u" : "d"}`;

  return (
    <svg width={width} height={height} className="overflow-visible">
      <defs>
        <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity={0.28} />
          <stop offset="100%" stopColor={color} stopOpacity={0} />
        </linearGradient>
      </defs>
      <path d={areaD} fill={`url(#${gid})`} />
      <path d={d} fill="none" stroke={color} strokeWidth={1.5} strokeLinejoin="round" />
    </svg>
  );
}
