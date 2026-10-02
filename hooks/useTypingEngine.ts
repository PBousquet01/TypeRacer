"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  accuracyOf,
  applyInput,
  correctPrefixLength,
  EMPTY_STATE,
  keysBetween,
  shouldReport,
  wpmOf,
  type TypingState,
} from "@/lib/typing";

export type CharState = "pending" | "correct" | "wrong";

export interface TypingEngine {
  input: string;
  handleChange: (value: string) => boolean; // false when the change was refused
  charStates: CharState[];
  correctChars: number;
  hasMistake: boolean;
  elapsedMs: number;
  wpm: number;
  accuracy: number;
  isDone: boolean;
}

interface EngineOptions {
  enabled: boolean;
  onKeys?: (base: number, keys: string) => void;
  // Picking a race back up after a reload: the server's count of correct
  // characters and when the race started. The keystrokes before the reload
  // are gone from this tab, so the figure on screen counts them as clean;
  // the server kept the real count, and the result comes from the server.
  resume?: { correctChars: number; startedAt: number } | null;
}

/**
 * The typing engine. The rules live in lib/typing.ts; this hook keeps the
 * state and the clock. What it works out (right or wrong, WPM, accuracy) is
 * only for this rider's screen. At every completed word and at the end,
 * `onKeys(base, keys)` hands over the keys pressed since the last report,
 * `base` being how many characters were right at that point; the server
 * judges those keys itself to move the chocobo and compute the score.
 */
export function useTypingEngine(text: string, { enabled, onKeys, resume }: EngineOptions): TypingEngine {
  const [typing, setTyping] = useState<TypingState>(() => {
    const done = resume ? Math.min(resume.correctChars, text.length) : 0;
    if (done === 0) return EMPTY_STATE;
    return { ...EMPTY_STATE, input: text.slice(0, done), startedAt: resume!.startedAt, keystrokes: done };
  });
  const [now, setNow] = useState(0);
  // The keys pressed since the last report, and where that report left off.
  const unsentRef = useRef({ base: typing.input.length, keys: "" });

  const { input, startedAt, finishedAt, keystrokes, mistakes } = typing;
  const correctChars = correctPrefixLength(input, text);
  const isDone = correctChars === text.length;

  useEffect(() => {
    if (!startedAt || finishedAt) return;
    const id = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(id);
  }, [startedAt, finishedAt]);

  function handleChange(value: string): boolean {
    if (!enabled) return false;
    const time = Date.now();
    const next = applyInput(typing, value, text, time);
    if (!next) return false;

    setTyping(next);
    setNow(time);

    // Read from the box, not from the verdict above: the server gets what
    // the keyboard produced and decides for itself whether it was right.
    const unsent = unsentRef.current;
    unsent.keys += keysBetween(input, value);
    const nextCorrect = correctPrefixLength(next.input, text);
    if (shouldReport(text, nextCorrect, unsent.base)) {
      onKeys?.(unsent.base, unsent.keys);
      unsentRef.current = { base: nextCorrect, keys: "" };
    }
    return true;
  }

  const charStates = useMemo(
    () =>
      Array.from(text, (ch, i): CharState => {
        if (i >= input.length) return "pending";
        return input[i] === ch ? "correct" : "wrong";
      }),
    [text, input],
  );

  const elapsedMs = startedAt ? Math.max(0, (finishedAt ?? now) - startedAt) : 0;

  return {
    input,
    handleChange,
    charStates,
    correctChars,
    hasMistake: correctChars < input.length,
    elapsedMs,
    wpm: wpmOf(correctChars, elapsedMs),
    accuracy: accuracyOf(keystrokes, mistakes),
    isDone,
  };
}
