import { ImageResponse } from "next/og";
import { LOGO_FROM, LOGO_TO } from "@/lib/brand";

// Browser-tab favicon (generated so it follows the brand colour per deployment).
export const size = { width: 32, height: 32 };
export const contentType = "image/png";

const WAVE = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" fill="none"><path d="M4 18.5C6.6 18.5 7.6 11.5 10.5 11.5S14.3 21 17.5 21 21 14 24 13.6" stroke="#fff" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/><circle cx="24" cy="13.6" r="2.9" fill="#fff"/></svg>`;

export default function Icon() {
  const wave = `data:image/svg+xml;base64,${Buffer.from(WAVE).toString("base64")}`;
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: `linear-gradient(135deg, ${LOGO_FROM} 0%, ${LOGO_TO} 100%)`,
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={wave} width={26} height={26} alt="" />
      </div>
    ),
    size
  );
}
