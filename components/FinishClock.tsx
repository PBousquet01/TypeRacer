"use client";

import { useEffect, useState } from "react";
import { formatTime } from "@/lib/format";
import { Stat } from "./ui";

export default function FinishClock({ deadline }: { deadline: number | null }) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!deadline) return;
    const id = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(id);
  }, [deadline]);

  if (!deadline) return null;
  return <Stat value={formatTime(Math.max(0, deadline - now))} label="LAST CALL" accent />;
}
