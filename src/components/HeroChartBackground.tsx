"use client";

import { useEffect, useRef } from "react";
import { BRAND_RGB } from "@/lib/brand";

/**
 * A live, continuously-drifting line chart rendered on a canvas, used as a
 * subtle high-end backdrop for the landing hero. Theme-aware and respects
 * prefers-reduced-motion (renders a still chart when motion is reduced).
 */
export function HeroChartBackground() {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const parent = canvas.parentElement;
    if (!parent) return;

    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const COUNT = 64;

    let w = 0;
    let h = 0;
    let v = 0.5;
    let slope = 0;
    const vals: number[] = [];

    function nextVal() {
      slope += (Math.random() - 0.5) * 0.06;
      slope *= 0.9;
      v += slope;
      if (v < 0.15) {
        v = 0.15;
        slope = Math.abs(slope);
      }
      if (v > 0.85) {
        v = 0.85;
        slope = -Math.abs(slope);
      }
      return v;
    }
    for (let i = 0; i < COUNT + 2; i++) vals.push(nextVal());

    function resize() {
      // Measure the canvas's own CSS box (it is w-full/h-full of its parent),
      // with sensible fallbacks so it never collapses to the 300x150 default.
      const rect = canvas!.getBoundingClientRect();
      w = Math.round(rect.width || parent!.clientWidth || window.innerWidth);
      h = Math.round(rect.height || parent!.clientHeight || 700);
      canvas!.width = Math.max(1, Math.floor(w * dpr));
      canvas!.height = Math.max(1, Math.floor(h * dpr));
      ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(parent);
    window.addEventListener("resize", resize);

    let phase = 0;
    const speed = 0.014; // columns per frame
    let raf = 0;

    function trace(step: number, offset: number, yAt: (val: number) => number) {
      ctx!.beginPath();
      for (let i = 0; i < vals.length; i++) {
        const x = i * step - offset;
        const yy = yAt(vals[i]);
        if (i === 0) {
          ctx!.moveTo(x, yy);
        } else {
          const px = (i - 1) * step - offset;
          const py = yAt(vals[i - 1]);
          const cx = (px + x) / 2;
          ctx!.bezierCurveTo(cx, py, cx, yy, x, yy);
        }
      }
    }

    function draw() {
      const light = document.documentElement.classList.contains("light");
      const step = w / COUNT;
      const offset = phase * step;
      // Keep the busy part in the lower band so it never crowds the headline.
      const yAt = (val: number) => h - (0.04 + val * 0.52) * h;

      ctx!.clearRect(0, 0, w, h);

      // filled area under the line
      trace(step, offset, yAt);
      ctx!.lineTo((vals.length - 1) * step - offset, h);
      ctx!.lineTo(-step, h);
      ctx!.closePath();
      const grad = ctx!.createLinearGradient(0, 0, 0, h);
      grad.addColorStop(0, `rgba(${BRAND_RGB},${light ? 0.12 : 0.2})`);
      grad.addColorStop(1, `rgba(${BRAND_RGB},0)`);
      ctx!.fillStyle = grad;
      ctx!.fill();

      // the line itself
      trace(step, offset, yAt);
      ctx!.strokeStyle = `rgba(${BRAND_RGB},${light ? 0.26 : 0.4})`;
      ctx!.lineWidth = 2;
      ctx!.lineJoin = "round";
      ctx!.stroke();

      if (!reduce) {
        phase += speed;
        if (phase >= 1) {
          phase -= 1;
          vals.push(nextVal());
          vals.shift();
        }
      }
      raf = requestAnimationFrame(draw);
    }
    draw();

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      window.removeEventListener("resize", resize);
    };
  }, []);

  return <canvas ref={ref} className="h-full w-full" aria-hidden />;
}
