"use client";

import { useEffect, useRef } from "react";

type Star = { x: number; y: number; r: number; phase: number; speed: number };
type Flare = { x: number; y: number; born: number; life: number; hue: number };
type Comet = { x: number; y: number; vx: number; vy: number; born: number; life: number };

// Deterministic PRNG so server/client agree on the first paint before the
// canvas takes over (avoids a hydration flash of differently-seeded stars).
function mulberry32(seed: number) {
  return function () {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Ambient supernova/starfield backdrop for the NovaTraders landing page.
 * Canvas + rAF: a field of twinkling stars, occasional soft "nova" flares
 * that bloom and fade, and rare comet streaks. Degrades to a single static
 * frame under prefers-reduced-motion. Purely decorative — no interaction.
 */
export function NovaField({ density = 1, className = "" }: { density?: number; className?: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const rand = mulberry32(20260910);
    let stars: Star[] = [];
    let flares: Flare[] = [];
    let comet: Comet | null = null;
    let raf = 0;
    let width = 0;
    let height = 0;
    let dpr = 1;

    function resize() {
      const rect = canvas!.getBoundingClientRect();
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      width = rect.width;
      height = rect.height;
      canvas!.width = Math.max(1, Math.floor(width * dpr));
      canvas!.height = Math.max(1, Math.floor(height * dpr));
      ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);

      const count = Math.floor((width * height) / 9000 * density);
      stars = Array.from({ length: count }, () => ({
        x: rand() * width,
        y: rand() * height,
        r: rand() * 1.4 + 0.3,
        phase: rand() * Math.PI * 2,
        speed: rand() * 0.6 + 0.2,
      }));
    }

    function spawnFlare() {
      flares.push({
        x: rand() * width,
        y: rand() * height * 0.85,
        born: performance.now(),
        life: 3200 + rand() * 1800,
        hue: rand() > 0.5 ? 28 : 340, // ember-orange or nova-pink
      });
    }

    function spawnComet() {
      const fromLeft = rand() > 0.5;
      const y = rand() * height * 0.6;
      comet = {
        x: fromLeft ? -40 : width + 40,
        y,
        vx: (fromLeft ? 1 : -1) * (5 + rand() * 3),
        vy: 1.2 + rand() * 0.8,
        born: performance.now(),
        life: 1600,
      };
    }

    let lastFlareAt = performance.now() - 2000;
    let lastCometAt = performance.now();

    function drawStatic() {
      ctx!.clearRect(0, 0, width, height);
      for (const s of stars) {
        ctx!.globalAlpha = 0.55;
        ctx!.fillStyle = "#fff";
        ctx!.beginPath();
        ctx!.arc(s.x, s.y, s.r, 0, Math.PI * 2);
        ctx!.fill();
      }
      ctx!.globalAlpha = 1;
    }

    function frame(t: number) {
      ctx!.clearRect(0, 0, width, height);

      // Stars: gentle twinkle
      for (const s of stars) {
        const tw = 0.35 + 0.65 * (0.5 + 0.5 * Math.sin(t * 0.001 * s.speed + s.phase));
        ctx!.globalAlpha = tw;
        ctx!.fillStyle = "#fff";
        ctx!.beginPath();
        ctx!.arc(s.x, s.y, s.r, 0, Math.PI * 2);
        ctx!.fill();
      }
      ctx!.globalAlpha = 1;

      // Nova flares: soft radial bloom that expands and fades
      flares = flares.filter((f) => t - f.born < f.life);
      for (const f of flares) {
        const p = (t - f.born) / f.life; // 0..1
        const eased = 1 - Math.pow(1 - p, 2);
        const radius = 18 + eased * 90;
        const alpha = Math.sin(p * Math.PI) * 0.35;
        const grad = ctx!.createRadialGradient(f.x, f.y, 0, f.x, f.y, radius);
        grad.addColorStop(0, `hsla(${f.hue}, 100%, 70%, ${alpha})`);
        grad.addColorStop(1, `hsla(${f.hue}, 100%, 60%, 0)`);
        ctx!.fillStyle = grad;
        ctx!.beginPath();
        ctx!.arc(f.x, f.y, radius, 0, Math.PI * 2);
        ctx!.fill();
      }
      if (t - lastFlareAt > 2600 + rand() * 2000) {
        spawnFlare();
        lastFlareAt = t;
      }

      // Comet: rare streak with a fading tail
      if (comet && t - comet.born < comet.life) {
        const p = (t - comet.born) / comet.life;
        comet.x += comet.vx;
        comet.y += comet.vy;
        const alpha = Math.sin(p * Math.PI);
        const tailX = comet.x - comet.vx * 6;
        const tailY = comet.y - comet.vy * 6;
        const grad = ctx!.createLinearGradient(comet.x, comet.y, tailX, tailY);
        grad.addColorStop(0, `rgba(255,230,180,${alpha})`);
        grad.addColorStop(1, "rgba(255,230,180,0)");
        ctx!.strokeStyle = grad;
        ctx!.lineWidth = 1.6;
        ctx!.beginPath();
        ctx!.moveTo(comet.x, comet.y);
        ctx!.lineTo(tailX, tailY);
        ctx!.stroke();
      } else if (t - lastCometAt > 9000 + rand() * 7000) {
        spawnComet();
        lastCometAt = t;
      }

      raf = requestAnimationFrame(frame);
    }

    resize();
    const onResize = () => resize();
    window.addEventListener("resize", onResize);

    if (reduced) {
      drawStatic();
    } else {
      raf = requestAnimationFrame(frame);
    }

    return () => {
      window.removeEventListener("resize", onResize);
      if (raf) cancelAnimationFrame(raf);
    };
  }, [density]);

  return <canvas ref={canvasRef} className={className} aria-hidden />;
}
