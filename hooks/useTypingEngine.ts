"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  accuracyOf,
  applyInput,
  correctPrefixLength,
  EMPTY_STATE,
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
  onProgress?: (correctChars: number, accuracy?: number) => void;
  // Picking a race back up after a reload: the server's count of correct
  // characters and when the race started. The keystrokes before the reload
  // are gone, so they're counted as clean; accuracy is self-reported anyway.
  resume?: { correctChars: number; startedAt: number } | null;
}

/**
 * The typing engine. The rules live in lib/typing.ts; this hook keeps the
 * state and the clock. `onProgress(n)` reports how many characters from the
 * start are correct, at every completed word and at the end; the server
 * moves the chocobo from that and decides the finish order. The final report
 * also carries the accuracy, which the server needs for the score.
 */
export function useTypingEngine(text: string, { enabled, onProgress, resume }: EngineOptions): TypingEngine {
  const [typing, setTyping] = useState<TypingState>(() => {
    const done = resume ? Math.min(resume.correctChars, text.length) : 0;
    if (done === 0) return EMPTY_STATE;
    return { ...EMPTY_STATE, input: text.slice(0, done), startedAt: resume!.startedAt, keystrokes: done };
  });
  const [now, setNow] = useState(0);
  // The last progress value sent to the server, so we don't send it twice.
  const reportedRef = useRef(typing.input.length);

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

    const nextCorrect = correctPrefixLength(next.input, text);
    if (shouldReport(text, nextCorrect, reportedRef.current)) {
      reportedRef.current = nextCorrect;
      const done = nextCorrect === text.length;
      onProgress?.(nextCorrect, done ? accuracyOf(next.keystrokes, next.mistakes) : undefined);
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
