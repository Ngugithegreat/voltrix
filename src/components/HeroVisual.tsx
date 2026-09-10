"use client";

import { useState } from "react";
import { LandingChart } from "./LandingChart";

/**
 * Hero visual for the landing page.
 *
 * Drop a licensed photo of a happy person at `public/hero-person.png`
 * (or .jpg) and it appears automatically, edge-faded so it blends into the
 * page background on both light and dark themes, with the live chart floating
 * over it as a glass card. Until that file exists we simply show the chart, so
 * the page always looks finished.
 */
export function HeroVisual() {
  const [hasPhoto, setHasPhoto] = useState(true);

  return (
    <div className="relative">
      {hasPhoto ? (
        <div className="relative">
          {/* soft brand glow behind the subject */}
          <div className="pointer-events-none absolute inset-6 -z-10 rounded-[2rem] bg-brand/20 blur-3xl" />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/hero-person.png"
            alt=""
            onError={() => setHasPhoto(false)}
            className="mx-auto w-full max-w-md select-none object-contain [mask-image:radial-gradient(120%_120%_at_50%_35%,#000_55%,transparent_100%)] [-webkit-mask-image:radial-gradient(120%_120%_at_50%_35%,#000_55%,transparent_100%)]"
            draggable={false}
          />
          {/* Live chart floats over the photo as a frosted card */}
          <div className="absolute -bottom-4 left-1/2 w-[85%] -translate-x-1/2 rounded-2xl border border-border bg-surface/70 p-2 shadow-card backdrop-blur-md sm:left-auto sm:right-0 sm:w-2/3 sm:translate-x-0">
            <LandingChart />
          </div>
        </div>
      ) : (
        <LandingChart />
      )}
    </div>
  );
}
