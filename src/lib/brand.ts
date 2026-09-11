// Brand identity for the whole app. Can be overridden per deployment with
// NEXT_PUBLIC_BRAND_NAME (NEXT_PUBLIC_ vars are inlined at build time so this
// works in both client and server code).
export const BRAND_NAME = (process.env.NEXT_PUBLIC_BRAND_NAME || "NovaTraders").trim();
export const BRAND_TAGLINE = "Trade the moment it ignites";

// Logo mark gradient (gold -> ember orange, a supernova burst).
export const LOGO_FROM = "#FFD166";
export const LOGO_TO = "#FF5D3E";

// Brand accent as concrete hex/rgb values, for places that can't use the CSS
// token (canvas charts, Recharts, emails, inline SVG).
export const BRAND_HEX = "#FF8A3D";
export const BRAND_HEX_LIGHT = "#FFB066";
export const BRAND_HEX_DARK = "#E0621A";
export const BRAND_RGB = "255,138,61";
