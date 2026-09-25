"use client";

import { useEffect, useState } from "react";
import { Eyebrow } from "./ui";

export default function Countdown({ startsIn }: { startsIn: number }) {
  const [secondsLeft, setSecondsLeft] = useState(Math.ceil(startsIn / 1000));

  useEffect(() => {
    const endsAt = Date.now() + startsIn;
    const id = setInterval(() => {
      setSecondsLeft(Math.max(0, Math.ceil((endsAt - Date.now()) / 1000)));
    }, 100);
    return () => clearInterval(id);
  }, [startsIn]);

  return (
    <div
      className="absolute inset-0 grid place-content-center justify-items-center gap-3 bg-[rgba(7,11,28,0.78)] light:bg-[rgba(215,227,245,0.85)]"
      aria-live="assertive"
    >
      <span className="font-display text-[44px]/none text-accent [text-shadow:4px_4px_0_var(--ink)] light:[text-shadow:3px_3px_0_rgba(16,26,63,0.22)]">
        {secondsLeft > 0 ? secondsLeft : "Kweh!"}
      </span>
      <Eyebrow>{secondsLeft > 0 ? "GATES OPEN IN" : "GO"}</Eyebrow>
    </div>
  );
}
