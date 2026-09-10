import { LOGO_FROM, LOGO_TO } from "@/lib/brand";

export function Logo({ className = "h-8 w-8" }: { className?: string }) {
  // Voltrix mark: a rising price wave — the curve of a volatility index —
  // inside a gradient tile, with a live-price node at the crest.
  return (
    <svg
      className={className}
      viewBox="0 0 32 32"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
    >
      <rect width="32" height="32" rx="9" fill="url(#stg)" />
      <rect
        width="32"
        height="32"
        rx="9"
        fill="url(#stgloss)"
        fillOpacity="0.35"
      />
      {/* faint trailing wave for depth */}
      <path
        d="M4 20.5c2.7 0 3.4-6 6-6s3.4 9 6 9 3.4-8 6-8"
        stroke="#fff"
        strokeOpacity="0.18"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* primary sine wave, trending up */}
      <path
        d="M4 18.5C6.6 18.5 7.6 11.5 10.5 11.5S14.3 21 17.5 21 21 14 24 13.6"
        stroke="#fff"
        strokeWidth="2.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="24" cy="13.6" r="2.6" fill="#fff" />
      <circle cx="24" cy="13.6" r="2.6" fill="url(#stg)" fillOpacity="0.15" />
      <defs>
        <linearGradient id="stg" x1="0" y1="0" x2="32" y2="32">
          <stop stopColor={LOGO_FROM} />
          <stop offset="1" stopColor={LOGO_TO} />
        </linearGradient>
        <linearGradient id="stgloss" x1="16" y1="0" x2="16" y2="32">
          <stop stopColor="#fff" />
          <stop offset="0.5" stopColor="#fff" stopOpacity="0" />
          <stop offset="1" stopColor="#000" stopOpacity="0.12" />
        </linearGradient>
      </defs>
    </svg>
  );
}
