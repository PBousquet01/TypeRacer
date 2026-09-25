"use client";

import { useState } from "react";
import Chocobo from "./Chocobo";
import { FieldLabel } from "./ui";
import { availableMounts, isCustomColor } from "@/lib/chocobos";
import { cn } from "@/lib/cn";

interface MountPickerProps {
  value: string;
  onChange: (color: string) => void;
  unlocks: string[];
}

export default function MountPicker({ value, onChange, unlocks }: MountPickerProps) {
  const [customColor, setCustomColor] = useState(isCustomColor(value) ? value : "#7a4fd6");

  return (
    <fieldset className="m-0 grid gap-2 border-0 p-0">
      <FieldLabel as="legend">Your chocobo</FieldLabel>
      <div className="grid grid-cols-3 gap-2">
        {availableMounts(unlocks).map((c) => {
          const selected = value === c.id;
          return (
            <button
              key={c.id}
              type="button"
              className={cn(
                "grid cursor-pointer justify-items-center gap-1.5 border-2 px-1.5 py-2.5 font-display text-micro uppercase",
                selected
                  ? "border-accent bg-accent/10 text-accent light:bg-accent/12"
                  : "border-edge/25 bg-ink/60 text-muted light:border-ink/20 light:bg-ink/4",
              )}
              onClick={() => onChange(c.id)}
              aria-pressed={selected}
            >
              <Chocobo color={c.id} size={34} />
              <span>{c.label}</span>
            </button>
          );
        })}
      </div>

      <label
        className={cn(
          "mt-2 flex cursor-pointer items-center gap-2.5 border-2 px-3 py-2.5",
          isCustomColor(value)
            ? "border-accent bg-ink/60 light:bg-accent/12"
            : "border-edge/25 bg-ink/60 light:border-ink/20 light:bg-ink/4",
        )}
      >
        <Chocobo color={customColor} size={30} />
        <span className="grid flex-1 gap-1 font-display text-micro text-muted uppercase">
          Mix your own
          <span className="font-body text-label/none text-accent">{customColor.toUpperCase()}</span>
        </span>
        <input
          type="color"
          className="h-[30px] w-11 cursor-pointer border-2 border-edge/40 bg-transparent p-0 light:bg-transparent [&::-webkit-color-swatch]:border-0 [&::-webkit-color-swatch-wrapper]:p-0.5"
          value={customColor}
          onChange={(e) => {
            setCustomColor(e.target.value);
            onChange(e.target.value);
          }}
          onClick={() => onChange(customColor)}
          aria-label="Custom chocobo colour"
        />
      </label>
    </fieldset>
  );
}
