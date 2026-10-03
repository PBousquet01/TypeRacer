import { describe, expect, test } from "bun:test";
import { BOT_LEVELS, BOT_LEVEL_IDS, planBot, type BotKey, type BotLevel } from "../lib/bots";
import { accuracyOf, applyInput, BACKSPACE, correctPrefixLength, EMPTY_STATE } from "../lib/typing";
import passages from "../server/seed/passages.json";

const TEXTS: string[] = [...passages.en.slice(0, 3), ...passages.fr.slice(0, 3)];
const SEEDS = [1, 2, 3, 4, 5, 6, 7, 8];

/** Plays a plan through the typing rules, as the server does, and fails on any key the rules refuse. */
function play(plan: BotKey[], text: string) {
  let state = EMPTY_STATE;
  for (const { key, atMs } of plan) {
    const value = key === BACKSPACE ? state.input.slice(0, -1) : state.input + key;
    const next = applyInput(state, value, text, atMs);
    if (!next) throw new Error(`refused key ${JSON.stringify(key)} at ${state.input.length}`);
    state = next;
  }
  const ms = plan.at(-1)!.atMs;
  return {
    done: correctPrefixLength(state.input, text) === text.length,
    wpm: text.length / 5 / (ms / 60_000),
    accuracy: accuracyOf(state.keystrokes, state.mistakes),
    mistakes: state.mistakes,
  };
}

describe("bots", () => {
  test("BOT-05: the same seed plays the same race; another seed plays a different one", () => {
    const text = TEXTS[0];
    expect(planBot({ seed: 42, text, level: "expert" })).toEqual(planBot({ seed: 42, text, level: "expert" }));
    expect(planBot({ seed: 43, text, level: "expert" })).not.toEqual(planBot({ seed: 42, text, level: "expert" }));
  });

  test("BOT-01: every level finishes the text at a speed in its range", () => {
    for (const level of BOT_LEVEL_IDS) {
      const [low, high] = BOT_LEVELS[level].wpm;
      for (const text of TEXTS) {
        for (const seed of SEEDS) {
          const result = play(planBot({ seed, text, level }), text);
          expect(result.done).toBe(true);
          expect(result.wpm).toBeGreaterThanOrEqual(low - 0.5);
          expect(result.wpm).toBeLessThanOrEqual(high + 0.5);
        }
      }
    }
  });

  test("BOT-01, BOT-03: slower levels make more mistakes", () => {
    const mistakeRate = (level: BotLevel) => {
      let mistakes = 0;
      let chars = 0;
      for (const text of TEXTS) {
        for (const seed of SEEDS) {
          mistakes += play(planBot({ seed, text, level }), text).mistakes;
          chars += text.length;
        }
      }
      return mistakes / chars;
    };
    const rates = BOT_LEVEL_IDS.map(mistakeRate);
    for (let i = 1; i < rates.length; i++) expect(rates[i]).toBeLessThan(rates[i - 1]);
    // Close to the level's rate: a slip often drags one or two more characters along.
    expect(rates[0]).toBeGreaterThan(BOT_LEVELS.noob.errorRate * 0.6);
    expect(rates[0]).toBeLessThan(BOT_LEVELS.noob.errorRate * 2.5);
  });

  test("BOT-02: the speed varies; no metronome", () => {
    const plan = planBot({ seed: 7, text: TEXTS[1], level: "intermediate" });
    const gaps = plan.slice(1).map((k, i) => k.atMs - plan[i].atMs);
    const mean = gaps.reduce((a, b) => a + b, 0) / gaps.length;
    const spread = Math.sqrt(gaps.reduce((a, b) => a + (b - mean) ** 2, 0) / gaps.length);
    expect(spread / mean).toBeGreaterThan(0.3);
    expect(new Set(gaps).size).toBeGreaterThan(gaps.length / 4);
  });

  test("BOT-02: bots hesitate before hard words", () => {
    const easy = "the cat sat on the mat and the dog ran to the box ".repeat(4).trim();
    const hard = "the Quizzical 1984-model Phénomène sat on Extraordinaire mats ".repeat(4).trim();
    const pauseBeforeWords = (text: string) => {
      let total = 0;
      let count = 0;
      for (const seed of SEEDS) {
        const plan = planBot({ seed, text, level: "intermediate", errorMode: "free" });
        // Per-character time, so the stretch to the target speed doesn't hide the pauses.
        const perChar = plan.at(-1)!.atMs / plan.length;
        plan.forEach((k, i) => {
          if (i > 0 && plan[i - 1].key === " ") {
            total += (k.atMs - plan[i - 1].atMs) / perChar;
            count++;
          }
        });
      }
      return total / count;
    };
    expect(pauseBeforeWords(hard)).toBeGreaterThan(pauseBeforeWords(easy) * 1.2);
  });

  test("BOT-03: in correct mode a bot fixes every slip; in free mode it never backspaces", () => {
    const text = TEXTS[2];
    const fixing = planBot({ seed: 3, text, level: "noob" });
    expect(fixing.some((k) => k.key === BACKSPACE)).toBe(true);
    expect(play(fixing, text).done).toBe(true);

    const free = planBot({ seed: 3, text, level: "noob", errorMode: "free" });
    expect(free.some((k) => k.key === BACKSPACE)).toBe(false);
    expect(free).toHaveLength(text.length);
    let state = EMPTY_STATE;
    for (const { key, atMs } of free) state = applyInput(state, state.input + key, text, atMs, "free") ?? state;
    expect(state.input).toHaveLength(text.length); // the free rules let the bot finish
    expect(state.mistakes).toBeGreaterThan(0);
  });

  test("the fastest bot stays under the server's anti-cheat limit", () => {
    for (const text of TEXTS) {
      for (const seed of SEEDS) {
        let state = EMPTY_STATE;
        for (const { key, atMs } of planBot({ seed, text, level: "impossible" })) {
          const value = key === BACKSPACE ? state.input.slice(0, -1) : state.input + key;
          state = applyInput(state, value, text, atMs) ?? state;
          // Same rule as the referee: no more than 25 characters a second, plus 10.
          expect(correctPrefixLength(state.input, text)).toBeLessThanOrEqual((atMs / 1000) * 25 + 10);
        }
      }
    }
  });
});
