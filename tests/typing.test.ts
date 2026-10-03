import { describe, expect, test } from "bun:test";
import {
  accuracyOf,
  applyInput,
  correctPrefixLength,
  EMPTY_STATE,
  keysBetween,
  MAX_CHARS_PAST_MISTAKE,
  replayKeys,
  progressChars,
  correctCount,
  shouldReport,
  wpmOf,
  type TypingState,
} from "../lib/typing";

const TEXT = "the quick bird";

/** Types `keys` one character at a time, the way a real keyboard fills the box. */
function typeKeys(keys: string, state: TypingState = EMPTY_STATE, text = TEXT): TypingState {
  let s = state;
  for (const key of keys) {
    const next = key === "\b" ? applyInput(s, s.input.slice(0, -1), text, 1000) : applyInput(s, s.input + key, text, 1000);
    if (next) s = next;
  }
  return s;
}

describe("correctPrefixLength", () => {
  test("counts matching characters from the start", () => {
    expect(correctPrefixLength("the qu", TEXT)).toBe(6);
  });
  test("stops at the first mistake", () => {
    expect(correctPrefixLength("thx quick", TEXT)).toBe(2);
  });
});

describe("applyInput", () => {
  test("typing correctly advances with no mistakes", () => {
    const s = typeKeys("the ");
    expect(s.input).toBe("the ");
    expect(s.keystrokes).toBe(4);
    expect(s.mistakes).toBe(0);
  });

  test("the timer starts at the first keystroke", () => {
    const s = applyInput(EMPTY_STATE, "t", TEXT, 5000)!;
    expect(s.startedAt).toBe(5000);
    expect(applyInput(s, "th", TEXT, 6000)!.startedAt).toBe(5000);
  });

  test("a wrong key counts as a mistake", () => {
    const s = typeKeys("thx");
    expect(s.mistakes).toBe(1);
    expect(correctPrefixLength(s.input, TEXT)).toBe(2);
  });

  test(`can't type more than ${MAX_CHARS_PAST_MISTAKE} characters past a mistake`, () => {
    const s = typeKeys("thxxxxxxxxxx"); // one wrong key, then keeps going
    expect(s.input.length).toBe(2 + MAX_CHARS_PAST_MISTAKE);
  });

  test("the limit also holds when several characters arrive at once", () => {
    // autocorrect, dictation or a phone keyboard can insert a whole chunk in one event
    expect(applyInput(EMPTY_STATE, "txxxxxxxxxxx", TEXT, 1000)).toBeNull();
    expect(applyInput(EMPTY_STATE, "thxxxxx", TEXT, 1000)?.input).toBe("thxxxxx");
  });

  test("fixed mistakes still count against accuracy", () => {
    const s = typeKeys("thx\be");
    expect(s.input).toBe("the");
    expect(s.mistakes).toBe(1);
    expect(s.keystrokes).toBe(4);
    expect(accuracyOf(s.keystrokes, s.mistakes)).toBe(75);
  });

  test("edits in the middle are ignored", () => {
    const s = typeKeys("the qu");
    expect(applyInput(s, "tXe qu", TEXT, 1000)).toBeNull();
  });

  test("pasting text past the end is ignored", () => {
    expect(applyInput(EMPTY_STATE, TEXT + " extra", TEXT, 1000)).toBeNull();
  });

  test("finishing records the time and blocks further input", () => {
    const s = applyInput(typeKeys(TEXT.slice(0, -1)), TEXT, TEXT, 9000)!;
    expect(s.finishedAt).toBe(9000);
    expect(applyInput(s, TEXT.slice(0, -1), TEXT, 9500)).toBeNull();
  });
});

describe("shouldReport", () => {
  test("reports at the end of each word", () => {
    expect(shouldReport(TEXT, 4, 0)).toBe(true); // "the "
    expect(shouldReport(TEXT, 3, 0)).toBe(false); // mid-word
  });
  test("reports the finish", () => {
    expect(shouldReport(TEXT, TEXT.length, 10)).toBe(true);
  });
  test("never reports the same count twice", () => {
    expect(shouldReport(TEXT, 4, 4)).toBe(false);
  });
});

describe("accuracyOf and wpmOf", () => {
  test("accuracy is 100% before any key", () => {
    expect(accuracyOf(0, 0)).toBe(100);
  });
  test("a word is five characters", () => {
    expect(wpmOf(250, 60_000)).toBe(50); // 250 chars in a minute = 50 words
  });
  test("no wpm in the first second", () => {
    expect(wpmOf(10, 900)).toBe(0);
  });
});

describe("what the server is sent, and what it makes of it", () => {
  test("keysBetween gives the characters added, or one backspace per character removed", () => {
    expect(keysBetween("the", "the q")).toBe(" q");
    expect(keysBetween("the qx", "the ")).toBe("\b\b");
    expect(keysBetween("the", "tha")).toBe("");
  });
  test("replaying the keys gives the same state as typing them", () => {
    const keys = "the quixk\b\bck bird";
    expect(replayKeys(EMPTY_STATE, keys, TEXT, 1000)).toEqual(typeKeys(keys));
  });
  test("a wrong key is wrong for the server whatever the page claimed", () => {
    const s = replayKeys(EMPTY_STATE, "xxxxx", TEXT, 1000);
    expect(correctPrefixLength(s.input, TEXT)).toBe(0);
    expect(s.mistakes).toBe(5);
  });
  test("keys the rules refuse are skipped", () => {
    const s = replayKeys(EMPTY_STATE, "\b" + "x".repeat(20), TEXT, 1000);
    expect(s.input.length).toBe(MAX_CHARS_PAST_MISTAKE);
  });
});

test("RES-03: replaying keys reports which characters were missed", () => {
  const missed: string[] = [];
  // Two wrong tries at the "e", then a wrong "o" where the "a" belongs.
  replayKeys(EMPTY_STATE, "thx\bw\be co\bat", "the cat", 0, (c) => missed.push(c));
  expect(missed).toEqual(["e", "e", "a"]);
});

test("CONF-08: in free mode a rider carries on past mistakes and finishes at the text's length", () => {
  const text = "the cat sat";
  let state = EMPTY_STATE;
  for (const value of ["tha", "tha xyz", "tha xyz sat"]) {
    state = applyInput(state, value, text, 0, "free") ?? state;
  }
  expect(state.input).toBe("tha xyz sat"); // far more than 5 characters past the first mistake
  expect(progressChars(state.input, text, "free")).toBe(text.length);
  expect(correctCount(state.input, text)).toBe(7); // "th", " ", " sat"
  expect(state.mistakes).toBe(4);
  expect(applyInput(state, "tha xyz sat!", text, 0, "free")).toBeNull(); // finished: nothing more
  // The same keys in "correct" mode stop 5 characters past the mistake.
  expect(applyInput(EMPTY_STATE, "tha xyz s", text, 0)).toBeNull();
});
