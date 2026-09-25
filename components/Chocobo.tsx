"use client";

import { useEffect, useState } from "react";
import { isCustomColor, mountAspect, mountLabel, needsOutline, presetSprite } from "@/lib/chocobos";
import { customSprite } from "@/lib/recolorSprite";
import { cn } from "@/lib/cn";

interface ChocoboProps {
  color: string;
  running?: boolean;
  stumbling?: boolean;
  size?: number;
}

export default function Chocobo({ color, running = false, stumbling = false, size = 36 }: ChocoboProps) {
  const custom = isCustomColor(color);
  const [mixed, setMixed] = useState<{ color: string; url: string } | null>(null);

  useEffect(() => {
    if (!custom) return;
    let active = true;
    customSprite(color)
      .then((url) => active && setMixed({ color, url }))
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [color, custom]);

  const src = custom && mixed?.color === color ? mixed.url : presetSprite(custom ? "yellow" : color);
  const aspect = mountAspect(custom ? "yellow" : color);
  const width = aspect >= 1 ? size : Math.round(size * aspect);
  const height = aspect >= 1 ? Math.round(size / aspect) : size;

  return (
    <span
      className={cn(
        "inline-block max-w-full leading-none motion-reduce:animate-none",
        stumbling ? "animate-stumble" : running && "animate-hop",
      )}
      style={{ width, height }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element -- local pixel art, next/image adds nothing */}
      <img
        src={src}
        alt={mountLabel(color)}
        width={width}
        height={height}
        className={cn("size-full object-contain [image-rendering:pixelated]", !custom && needsOutline(color) && "outline-ink")}
      />
    </span>
  );
}
