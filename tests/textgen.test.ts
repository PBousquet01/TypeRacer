import { describe, expect, test } from "bun:test";
import { seededRandom } from "../lib/bots";
import {
  buildText,
  DEFAULT_TEXT_OPTIONS,
  passageLevel,
  stripAccents,
  stripPunctuation,
  wordFits,
  type TextOptions,
} from "../lib/textgen";
import passages from "../server/seed/passages.json";

const fr = {
  passages: passages.fr,
  words: (await Bun.file(new URL("../server/seed/words-fr.txt", import.meta.url)).text()).split(/\s+/).filter(Boolean),
};
const options = (o: Partial<TextOptions> = {}): TextOptions => ({ ...DEFAULT_TEXT_OPTIONS, kind: "words", ...o });
const build = (o: Partial<TextOptions>, seed = 1) => buildText(fr, options(o), seededRandom(seed));
const words = (text: string) => text.split(" ");

describe("race texts", () => {
  test("CONF-04: the text has the length the host asked for, in words", () => {
    for (const length of [10, 25, 50, 100]) {
      expect(words(build({ length }))).toHaveLength(length);
      expect(words(build({ length, kind: "sentences" }))).toHaveLength(length);
    }
  });

  test("CONF-05: complexity is measured: word length, accents, apostrophes", () => {
    expect(passageLevel("the cat sat on a mat")).toBe("easy");
    expect(passageLevel("extraordinary circumstances overwhelmed everyone")).toBe("hard");
    expect([wordFits("chat", "easy"), wordFits("clé", "easy"), wordFits("maison", "easy")]).toEqual([true, false, false]);
    expect([wordFits("maison", "medium"), wordFits("printemps", "medium")]).toEqual([true, false]);
    expect([wordFits("lac", "hard"), wordFits("printemps", "hard")]).toEqual([false, true]);
    const plain = (text: string) => stripPunctuation(text).toLowerCase().split(" ");
    for (const seed of [1, 2, 3]) {
      for (const w of plain(build({ complexity: "easy", punctuation: false, capitals: false }, seed))) {
        expect(wordFits(w, "easy")).toBe(true);
      }
      for (const w of plain(build({ complexity: "hard", punctuation: false, capitals: false }, seed))) {
        expect([...w].length).toBeGreaterThanOrEqual(5);
      }
    }
  });

  test("CONF-06: punctuation, capitals and accents can be taken out of any text", () => {
    for (const kind of ["sentences", "words"] as const) {
      const bareText = build({ kind, punctuation: false, capitals: false, accents: false });
      expect(bareText).toMatch(/^[a-z0-9' ]+$/);
    }
    expect(stripAccents("Été à l'île")).toBe("Ete a l'ile");
    expect(stripPunctuation("Bonjour, toi ! C'est « ici ».")).toBe("Bonjour toi C'est ici");
  });

  test("CONF-06: random words get numbers, capitals and punctuation when asked", () => {
    const text = build({ length: 100, numbers: true, capitals: true, punctuation: true });
    expect(text).toMatch(/\d/);
    expect(text).toMatch(/[A-ZÀ-Ý]/);
    expect(text).toMatch(/[.,]/);
    expect(build({ length: 100, numbers: false })).not.toMatch(/\d/);
  });

  test("CONF-07: excluded characters never appear; included ones are in every word", () => {
    const text = build({ length: 100, exclude: "ea", punctuation: false, capitals: false });
    expect(stripAccents(text)).not.toMatch(/[ea]/); // "é" counts as an "e"
    const practice = build({ length: 50, include: "v", punctuation: false, capitals: false });
    for (const w of words(practice)) expect(stripAccents(w)).toContain("v");
    // Nothing left with the include filter: it's dropped rather than the race failing.
    expect(words(build({ length: 10, include: "q", exclude: "u" }))).toHaveLength(10);
  });
});
