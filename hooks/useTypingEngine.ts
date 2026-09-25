"use client";

import { useEffect, useMemo, useRef, useState } from "react";

// Like Monkeytype: you can't keep typing more than a few characters past a
// mistake. You have to go back and fix it first.
const MAX_CHARS_PAST_MISTAKE = 5;

/** How many characters from the start match the text, stopping at the first mistake. */
export type CharState = "pending" | "correct" | "wrong";

export interface TypingEngine {
  input: string;
  handleChange: (value: string) => void;
  charStates: CharState[];
  correctChars: number;
  hasMistake: boolean;
  elapsedMs: number;
  wpm: number;
  accuracy: number;
  isDone: boolean;
}

interface TypingState {
  input: string; // everything typed so far
  startedAt: number | null; // time of the first keystroke (the timer starts there, like Monkeytype)
  finishedAt: number | null; // time the last character was typed correctly
  keystrokes: number; // every character typed, right or wrong
  mistakes: number; // characters typed that didn't match the text
}

function correctPrefixLength(input: string, text: string): number {
  let i = 0;
  while (i < input.length && input[i] === text[i]) i++;
  return i;
}

/**
 * The typing engine. `onProgress(n)` reports how many characters from the
 * start are correct, at every completed word and at the end; the server
 * moves the chocobo from that and decides the finish order.
 */
export function useTypingEngine(
  text: string,
  { enabled, onProgress }: { enabled: boolean; onProgress?: (correctChars: number) => void },
): TypingEngine {
  const [typing, setTyping] = useState<TypingState>({
    input: "",
    startedAt: null,
    finishedAt: null,
    keystrokes: 0,
    mistakes: 0,
  });
  const [now, setNow] = useState(0);
  // The last progress value sent to the server, so we don't send it twice.
  const reportedRef = useRef(0);

  const { input, startedAt, finishedAt, keystrokes, mistakes } = typing;
  const correctChars = correctPrefixLength(input, text);
  const isDone = correctChars === text.length;

  useEffect(() => {
    if (!startedAt || finishedAt) return;
    const id = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(id);
  }, [startedAt, finishedAt]);

  function handleChange(value: string) {
    if (!enabled || isDone) return;

    // Only typing or deleting at the end counts, so a moved cursor or an
    // edit in the middle can't desynchronise the engine.
    const isTyping = value.length > input.length && value.startsWith(input);
    const isDeleting = value.length < input.length && input.startsWith(value);
    if (!isTyping && !isDeleting) return;

    if (isTyping) {
      if (value.length > text.length) return;
      const hasMistake = correctChars < input.length;
      if (hasMistake && value.length > correctChars + MAX_CHARS_PAST_MISTAKE) return;
    }

    // Accuracy counts every key pressed, fixed mistakes included.
    const added = isTyping ? value.slice(input.length) : "";
    let newMistakes = 0;
    for (let i = 0; i < added.length; i++) {
      if (added[i] !== text[input.length + i]) newMistakes++;
    }

    const time = Date.now();
    const newCorrect = correctPrefixLength(value, text);
    const done = newCorrect === text.length;

    setTyping({
      input: value,
      startedAt: startedAt ?? time,
      finishedAt: done ? time : null,
      keystrokes: keystrokes + added.length,
      mistakes: mistakes + newMistakes,
    });
    setNow(time);

    const wordCompleted = text[newCorrect - 1] === " ";
    if (newCorrect > reportedRef.current && (wordCompleted || done)) {
      reportedRef.current = newCorrect;
      onProgress?.(newCorrect);
    }
  }

  const charStates = useMemo(
    () =>
      Array.from(text, (ch, i): CharState => {
        if (i >= input.length) return "pending";
        return input[i] === ch ? "correct" : "wrong";
      }),
    [text, input],
  );

  // A "word" is 5 characters by convention; only correct ones count.
  const elapsedMs = startedAt ? Math.max(0, (finishedAt ?? now) - startedAt) : 0;
  const wpm = elapsedMs >= 1000 ? Math.round(correctChars / 5 / (elapsedMs / 60000)) : 0;
  const accuracy = keystrokes ? Math.round(((keystrokes - mistakes) / keystrokes) * 100) : 100;

  const hasMistake = correctChars < input.length;

  return { input, handleChange, charStates, correctChars, hasMistake, elapsedMs, wpm, accuracy, isDone };
}
