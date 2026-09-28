"use client";

import { useEffect, useRef } from "react";
import type { CharState, TypingEngine } from "@/hooks/useTypingEngine";
import { cn } from "@/lib/cn";
import { useT } from "@/lib/i18n";

const CHAR_STYLE: Record<CharState, string> = {
  pending: "text-dim",
  correct: "text-strong",
  wrong: "bg-ember text-ink line-through",
};

export const PROMPT_BOX = "relative frame bg-window px-[30px] py-[26px] max-wide:px-4 max-wide:py-5";
export const PROMPT_TEXT =
  "mx-auto max-w-[1000px] font-body text-[clamp(15px,1.7vw,21px)]/[1.85] break-words whitespace-pre-wrap text-pretty";
export const PROMPT_HINT = "mx-auto mt-5 max-w-[1000px] font-body text-xs/[1.6] text-muted uppercase";

interface TypingBoxProps {
  text: string;
  engine: TypingEngine;
  enabled: boolean;
}

export default function TypingBox({ text, engine, enabled }: TypingBoxProps) {
  const t = useT();
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (enabled) inputRef.current?.focus();
  }, [enabled]);

  return (
    <div className={cn(PROMPT_BOX, "cursor-text focus-within:border-accent")} onClick={() => inputRef.current?.focus()}>
      <input
        ref={inputRef}
        className="pointer-events-none absolute size-px border-0 p-0 opacity-0"
        value={engine.input}
        onChange={(e) => {
          // A refused key changes no state; make sure the hidden box doesn't
          // keep it either, so it always holds exactly what the engine has.
          if (!engine.handleChange(e.target.value)) e.target.value = engine.input;
        }}
        onPaste={(e) => e.preventDefault()}
        disabled={!enabled || engine.isDone}
        autoComplete="off"
        autoCorrect="off"
        autoCapitalize="off"
        spellCheck={false}
        aria-label={t.race.typeHere}
      />
      <p className={PROMPT_TEXT}>
        {Array.from(text).map((ch, i) => (
          <span
            key={i}
            className={
              i === engine.input.length
                ? "animate-blink bg-accent text-ink motion-reduce:animate-none light:text-white"
                : CHAR_STYLE[engine.charStates[i] ?? "pending"]
            }
          >
            {ch}
          </span>
        ))}
      </p>
      <p className={PROMPT_HINT}>
        {engine.hasMistake ? t.race.hintMistake : t.race.hintNormal}
      </p>
    </div>
  );
}
