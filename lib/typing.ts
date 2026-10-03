// The typing engine's rules, as plain functions: a state goes in, the next
// state comes out. No React here, so the rules can be tested on their own;
// hooks/useTypingEngine.ts wires them to the page.

// Like Monkeytype: you can't keep typing more than a few characters past a
// mistake. You have to go back and fix it first.
export const MAX_CHARS_PAST_MISTAKE = 5;

/**
 * CONF-08: "correct" (the default) holds you at a mistake until it's fixed,
 * as above. "free" lets you carry on: the wrong character stays, counts
 * against your accuracy and your net WPM, and you finish once you've typed as
 * many characters as the text has.
 */
export type ErrorMode = "correct" | "free";

export interface TypingState {
  input: string; // everything typed so far
  startedAt: number | null; // time of the first keystroke (the timer starts there, like Monkeytype)
  finishedAt: number | null; // time the last character was typed correctly
  keystrokes: number; // every character typed, right or wrong
  mistakes: number; // characters typed that didn't match the text
}

export const EMPTY_STATE: TypingState = {
  input: "",
  startedAt: null,
  finishedAt: null,
  keystrokes: 0,
  mistakes: 0,
};

/** How many characters from the start match the text, stopping at the first mistake. */
export function correctPrefixLength(input: string, text: string): number {
  let i = 0;
  while (i < input.length && input[i] === text[i]) i++;
  return i;
}

/** How many characters typed match the text, wherever they are. */
export function correctCount(input: string, text: string): number {
  let n = 0;
  for (let i = 0; i < input.length; i++) if (input[i] === text[i]) n++;
  return n;
}

/**
 * How far along the text a rider is: the right characters from the start in
 * "correct" mode, every character typed in "free" mode.
 */
export function progressChars(input: string, text: string, mode: ErrorMode = "correct"): number {
  return mode === "free" ? Math.min(input.length, text.length) : correctPrefixLength(input, text);
}

/** Share of keys that were right, fixed mistakes included. */
export function accuracyOf(keystrokes: number, mistakes: number): number {
  return keystrokes ? Math.round(((keystrokes - mistakes) / keystrokes) * 100) : 100;
}

/** A "word" is 5 characters by convention; only correct ones count. */
export function wpmOf(correctChars: number, elapsedMs: number): number {
  return elapsedMs >= 1000 ? Math.round(correctChars / 5 / (elapsedMs / 60000)) : 0;
}

/**
 * The input box now holds `value`. Returns the next state, or null when the
 * change isn't allowed (and the box should stay as it was).
 */
export function applyInput(
  state: TypingState,
  value: string,
  text: string,
  now: number,
  mode: ErrorMode = "correct",
): TypingState | null {
  const { input } = state;
  if (progressChars(input, text, mode) === text.length) return null; // already finished

  // Only typing or deleting at the end counts, so a moved cursor or an
  // edit in the middle can't desynchronise the engine.
  const isTyping = value.length > input.length && value.startsWith(input);
  const isDeleting = value.length < input.length && input.startsWith(value);
  if (!isTyping && !isDeleting) return null;

  // Checked on the new value, not the old one: a single input event can add
  // several characters at once (autocorrect, dictation, a phone keyboard).
  if (isTyping) {
    if (value.length > text.length) return null;
    if (mode === "correct" && value.length > correctPrefixLength(value, text) + MAX_CHARS_PAST_MISTAKE) return null;
  }

  // Accuracy counts every key pressed, fixed mistakes included.
  const added = isTyping ? value.slice(input.length) : "";
  let newMistakes = 0;
  for (let i = 0; i < added.length; i++) {
    if (added[i] !== text[input.length + i]) newMistakes++;
  }

  const done = progressChars(value, text, mode) === text.length;
  return {
    input: value,
    startedAt: state.startedAt ?? now,
    finishedAt: done ? now : null,
    keystrokes: state.keystrokes + added.length,
    mistakes: state.mistakes + newMistakes,
  };
}

// What the browser sends to the server is the keys themselves, never a
// verdict: the server runs them through applyInput again (replayKeys) and
// works out the progress and the accuracy itself. A page whose code has been
// tampered with can show its own rider anything, but it can't make the
// server count a wrong key as a right one.
export const BACKSPACE = "\b";

/** The keys that turned `input` into `value`: the characters added, or one BACKSPACE per character removed. */
export function keysBetween(input: string, value: string): string {
  if (value.startsWith(input)) return value.slice(input.length);
  if (input.startsWith(value)) return BACKSPACE.repeat(input.length - value.length);
  return "";
}

/**
 * Applies `keys` one at a time, as a keyboard would. A key the rules refuse is
 * skipped. `onMiss` hears about every wrong key that was accepted, with the
 * character that should have been typed (RES-03: the missed-keys heatmap).
 */
export function replayKeys(
  state: TypingState,
  keys: string,
  text: string,
  now: number,
  onMiss?: (expected: string) => void,
  mode: ErrorMode = "correct",
): TypingState {
  let current = state;
  for (let i = 0; i < keys.length; i++) {
    const at = current.input.length;
    const value = keys[i] === BACKSPACE ? current.input.slice(0, -1) : current.input + keys[i];
    const next = applyInput(current, value, text, now, mode);
    if (next && keys[i] !== BACKSPACE && keys[i] !== text[at]) onMiss?.(text[at]);
    current = next ?? current;
  }
  return current;
}

/**
 * Whether to send the server a report now that `correctChars` are right: at
 * every completed word and at the very end, and never the same point twice.
 */
export function shouldReport(text: string, correctChars: number, alreadyReported: number): boolean {
  if (correctChars <= alreadyReported) return false;
  return text[correctChars - 1] === " " || correctChars === text.length;
}
