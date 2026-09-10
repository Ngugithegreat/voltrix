import type { MetadataRoute } from "next";
import { BRAND_NAME, BRAND_HEX_DARK } from "@/lib/brand";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: `${BRAND_NAME} — Trade Volatility Indices`,
    short_name: BRAND_NAME,
    description:
      "Trade Volatility Indices live with instant M-Pesa deposits and withdrawals.",
    start_url: "/trade",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#0a0b10",
    theme_color: BRAND_HEX_DARK,
    categories: ["finance"],
    icons: [
      { src: "/apple-icon", sizes: "180x180", type: "image/png", purpose: "any" },
      { src: "/icon-maskable", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
