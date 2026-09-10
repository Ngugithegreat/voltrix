// High-end, theme-blended backdrop for the whole app: a soft colour mesh, a
// faint grid that fades out, glowing orbs, and a subtle upward "market line"
// motif along the bottom. Static so it never distracts while trading.
import { BRAND_RGB } from "@/lib/brand";

export function AppBackground() {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
      {/* colour mesh */}
      <div
        className="absolute inset-0"
        style={{
          backgroundImage:
            `radial-gradient(60% 45% at 15% 0%, rgba(${BRAND_RGB},0.22), transparent 60%),` +
            "radial-gradient(55% 45% at 100% 20%, rgb(91 141 239 / 0.18), transparent 60%)," +
            "radial-gradient(50% 50% at 50% 100%, rgb(236 72 153 / 0.10), transparent 65%)",
        }}
      />
      {/* faint grid, masked to fade toward the middle */}
      <div
        className="absolute inset-0 opacity-[0.6]"
        style={{
          backgroundImage:
            "linear-gradient(rgb(var(--border) / 0.7) 1px, transparent 1px), linear-gradient(90deg, rgb(var(--border) / 0.7) 1px, transparent 1px)",
          backgroundSize: "48px 48px",
          maskImage: "radial-gradient(ellipse 100% 60% at 50% -10%, #000 30%, transparent 78%)",
          WebkitMaskImage: "radial-gradient(ellipse 100% 60% at 50% -10%, #000 30%, transparent 78%)",
        }}
      />
      {/* glowing orbs */}
      <div className="absolute -top-40 left-[12%] h-[36rem] w-[36rem] rounded-full bg-brand/15 blur-[120px]" />
      <div className="absolute top-1/4 -right-40 h-[32rem] w-[32rem] rounded-full bg-indigo-500/15 blur-[120px]" />

      {/* subtle upward market line along the bottom */}
      <svg
        className="absolute inset-x-0 bottom-0 h-1/2 w-full"
        viewBox="0 0 1200 400"
        preserveAspectRatio="none"
        fill="none"
      >
        <defs>
          <linearGradient id="bgfill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={`rgba(${BRAND_RGB},0.16)`} />
            <stop offset="100%" stopColor={`rgba(${BRAND_RGB},0)`} />
          </linearGradient>
        </defs>
        <path
          d="M0 340 L120 320 L240 350 L360 300 L480 320 L600 250 L720 280 L840 200 L960 230 L1080 150 L1200 180 L1200 400 L0 400 Z"
          fill="url(#bgfill)"
        />
        <path
          d="M0 340 L120 320 L240 350 L360 300 L480 320 L600 250 L720 280 L840 200 L960 230 L1080 150 L1200 180"
          stroke={`rgba(${BRAND_RGB},0.35)`}
          strokeWidth="2"
        />
      </svg>
    </div>
  );
}
