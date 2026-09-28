// The typing engine's rules, as plain functions: a state goes in, the next
// state comes out. No React here, so the rules can be tested on their own;
// hooks/useTypingEngine.ts wires them to the page.

// Like Monkeytype: you can't keep typing more than a few characters past a
// mistake. You have to go back and fix it first.
export const MAX_CHARS_PAST_MISTAKE = 5;

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
export function applyInput(state: TypingState, value: string, text: string, now: number): TypingState | null {
  const { input } = state;
  if (correctPrefixLength(input, text) === text.length) return null; // already finished

  // Only typing or deleting at the end counts, so a moved cursor or an
  // edit in the middle can't desynchronise the engine.
  const isTyping = value.length > input.length && value.startsWith(input);
  const isDeleting = value.length < input.length && input.startsWith(value);
  if (!isTyping && !isDeleting) return null;

  // Checked on the new value, not the old one: a single input event can add
  // several characters at once (autocorrect, dictation, a phone keyboard).
  if (isTyping) {
    if (value.length > text.length) return null;
    if (value.length > correctPrefixLength(value, text) + MAX_CHARS_PAST_MISTAKE) return null;
  }

  // Accuracy counts every key pressed, fixed mistakes included.
  const added = isTyping ? value.slice(input.length) : "";
  let newMistakes = 0;
  for (let i = 0; i < added.length; i++) {
    if (added[i] !== text[input.length + i]) newMistakes++;
  }

  const done = correctPrefixLength(value, text) === text.length;
  return {
    input: value,
    startedAt: state.startedAt ?? now,
    finishedAt: done ? now : null,
    keystrokes: state.keystrokes + added.length,
    mistakes: state.mistakes + newMistakes,
  };
}

/**
 * Whether to tell the server about `correctChars`: at every completed word
 * and at the very end, and never the same number twice.
 */
export function shouldReport(text: string, correctChars: number, alreadyReported: number): boolean {
  if (correctChars <= alreadyReported) return false;
  return text[correctChars - 1] === " " || correctChars === text.length;
}
