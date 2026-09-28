"use client";

import { useEffect, useState } from "react";
import { formatTime } from "@/lib/format";
import { Stat } from "./ui";
import { useT } from "@/lib/i18n";

export default function FinishClock({ deadline }: { deadline: number | null }) {
  const t = useT();
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!deadline) return;
    const id = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(id);
  }, [deadline]);

  if (!deadline) return null;
  return <Stat value={formatTime(Math.max(0, deadline - now))} label={t.race.lastCall} accent />;
}
