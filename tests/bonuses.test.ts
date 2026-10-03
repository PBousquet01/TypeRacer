import { describe, expect, test } from "bun:test";
import {
  awardCheckpoint,
  checkpointsPassed,
  laggards,
  lengthen,
  pickWords,
  shorten,
  type Contender,
} from "../lib/bonuses";
import { seededRandom } from "../lib/bots";

const rider = (id: string, progress: number, extra: Partial<Contender> = {}): Contender => ({
  id,
  progress,
  finished: false,
  bonuses: 0,
  ...extra,
});

describe("comeback bonuses", () => {
  test("BONUS-01: checkpoints at 25, 50 and 75 % of the leader's text", () => {
    expect([0, 0.24, 0.25, 0.5, 0.74, 0.75, 1].map(checkpointsPassed)).toEqual([0, 0, 1, 2, 2, 3, 3]);
  });

  test("BONUS-01: lagging means last, or more than 25 % behind the leader", () => {
    const field = [rider("lead", 0.6), rider("close", 0.5), rider("middle", 0.4), rider("far", 0.3), rider("last", 0.2)];
    expect(laggards(field).map((c) => c.id)).toEqual(["last", "far"]);
    // Two riders: the one behind is last, so always lagging.
    expect(laggards([rider("a", 0.3), rider("b", 0.29)]).map((c) => c.id)).toEqual(["b"]);
  });

  test("BONUS-01: no more than 3 bonuses each, and nothing for riders who finished", () => {
    const field = [rider("lead", 0.9), rider("full", 0.1, { bonuses: 3 }), rider("done", 1, { finished: true }), rider("ok", 0.2)];
    expect(laggards(field).map((c) => c.id)).toEqual(["ok"]);
  });

  test("BONUS-02: the leader is slowed at most once per checkpoint; the others shorten their own text", () => {
    const field = [rider("lead", 0.5), ...Array.from({ length: 6 }, (_, i) => rider(`r${i}`, 0.1 + i * 0.01))];
    for (let seed = 0; seed < 50; seed++) {
      const awards = awardCheckpoint(field, seed, () => true);
      expect(awards).toHaveLength(6);
      const onLeader = awards.filter((a) => a.target === "lead");
      expect(onLeader.length).toBeLessThanOrEqual(1);
      for (const a of awards) {
        if (a.kind === "shorten") expect(a.target).toBe(a.to);
        else expect(a.target).toBe("lead");
      }
    }
  });

  test("BONUS-02: all three kinds come up, and the same seed gives the same bonuses", () => {
    const field = [rider("lead", 0.5), rider("behind", 0.1)];
    const kinds = new Set(Array.from({ length: 60 }, (_, seed) => awardCheckpoint(field, seed, () => true)[0].kind));
    expect([...kinds].sort()).toEqual(["fog", "lengthen", "shorten"]);
    expect(awardCheckpoint(field, 7, () => true)).toEqual(awardCheckpoint(field, 7, () => true));
  });

  test("BONUS-02: a text too short to lose words gives the leader +3 words instead", () => {
    const field = [rider("lead", 0.5), rider("behind", 0.1)];
    for (let seed = 0; seed < 30; seed++) {
      const [award] = awardCheckpoint(field, seed, () => false);
      expect(award.kind).not.toBe("shorten");
    }
  });

  test("BONUS-04: words change only at the end, after where the rider is", () => {
    const text = "one two three four five six seven eight";
    expect(lengthen(text, ["nine", "ten", "eleven"])).toBe(`${text} nine ten eleven`);
    expect(shorten(text, 0)).toBe("one two three four five");
    expect(shorten(text, 20)).toBeNull(); // only 3 characters would be left ahead of them
    expect(shorten("a b c", 0)).toBeNull();
    const picked = pickWords(text, 3, seededRandom(1));
    expect(picked).toHaveLength(3);
    for (const w of picked) expect(text.split(" ")).toContain(w);
  });
});
