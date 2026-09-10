// Brand identity for the whole app. Can be overridden per deployment with
// NEXT_PUBLIC_BRAND_NAME (NEXT_PUBLIC_ vars are inlined at build time so this
// works in both client and server code).
export const BRAND_NAME = (process.env.NEXT_PUBLIC_BRAND_NAME || "Voltrix").trim();
export const BRAND_TAGLINE = "Trade at the speed of insight";

// Logo mark gradient (electric blue → violet).
export const LOGO_FROM = "#22D3EE";
export const LOGO_TO = "#7C3AED";

// Brand accent as concrete hex/rgb values, for places that can't use the CSS
// token (canvas charts, Recharts, emails, inline SVG).
export const BRAND_HEX = "#4F7CFF";
export const BRAND_HEX_LIGHT = "#7C9CFF";
export const BRAND_HEX_DARK = "#3355E0";
export const BRAND_RGB = "79,124,255";
