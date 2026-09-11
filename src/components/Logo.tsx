import { LOGO_FROM, LOGO_TO } from "@/lib/brand";

export function Logo({ className = "h-8 w-8" }: { className?: string }) {
  // NovaTraders mark: a four-point sparkle/supernova burst on a gradient
  // tile, with a small satellite spark catching the market's upward drift.
  return (
    <svg
      className={className}
      viewBox="0 0 32 32"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
    >
      <rect width="32" height="32" rx="9" fill="url(#ntg)" />
      <rect width="32" height="32" rx="9" fill="url(#ntgloss)" fillOpacity="0.35" />
      {/* primary burst */}
      <path
        d="M15.2 6.5c.3-1 1.7-1 2 0l1.1 3.6c.5 1.7 1.8 3 3.5 3.5l3.6 1.1c1 .3 1 1.7 0 2l-3.6 1.1c-1.7.5-3 1.8-3.5 3.5l-1.1 3.6c-.3 1-1.7 1-2 0l-1.1-3.6c-.5-1.7-1.8-3-3.5-3.5l-3.6-1.1c-1-.3-1-1.7 0-2l3.6-1.1c1.7-.5 3-1.8 3.5-3.5l1.1-3.6Z"
        fill="#fff"
      />
      {/* satellite spark */}
      <path
        d="M23.6 22.2c.15-.5.85-.5 1 0l.4 1.25c.16.5.55.9 1.05 1.05l1.25.4c.5.15.5.85 0 1l-1.25.4c-.5.16-.9.55-1.05 1.05l-.4 1.25c-.15.5-.85.5-1 0l-.4-1.25c-.16-.5-.55-.9-1.05-1.05l-1.25-.4c-.5-.15-.5-.85 0-1l1.25-.4c.5-.16.9-.55 1.05-1.05l.4-1.25Z"
        fill="#fff"
        fillOpacity="0.85"
      />
      <defs>
        <linearGradient id="ntg" x1="0" y1="0" x2="32" y2="32">
          <stop stopColor={LOGO_FROM} />
          <stop offset="1" stopColor={LOGO_TO} />
        </linearGradient>
        <linearGradient id="ntgloss" x1="16" y1="0" x2="16" y2="32">
          <stop stopColor="#fff" />
          <stop offset="0.5" stopColor="#fff" stopOpacity="0" />
          <stop offset="1" stopColor="#000" stopOpacity="0.12" />
        </linearGradient>
      </defs>
    </svg>
  );
}
