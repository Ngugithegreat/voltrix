"use client";

import { useEffect, useState } from "react";

// Cycles through words with a slide-up + fade, in the brand gradient.
export function RotatingWord({
  words,
  interval = 2200,
}: {
  words: string[];
  interval?: number;
}) {
  const [i, setI] = useState(0);
  const [show, setShow] = useState(true);

  useEffect(() => {
    if (words.length < 2) return;
    const t = setInterval(() => {
      setShow(false);
      setTimeout(() => {
        setI((v) => (v + 1) % words.length);
        setShow(true);
      }, 280);
    }, interval);
    return () => clearInterval(t);
  }, [words.length, interval]);

  return (
    <span className="relative inline-flex overflow-hidden pb-[0.12em] align-bottom">
      <span
        className={`text-gradient inline-block transition-all duration-300 ease-out ${
          show ? "translate-y-0 opacity-100" : "translate-y-[0.5em] opacity-0"
        }`}
      >
        {words[i]}
      </span>
    </span>
  );
}
