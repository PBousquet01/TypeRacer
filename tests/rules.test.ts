import { describe, expect, test } from "bun:test";
import { rawWpmOf, raceStatus, scoreOf } from "../lib/rules";
import { USERNAME_RE, cleanRiderName } from "../lib/names";
import { en } from "../lib/i18n/en";
import { fr } from "../lib/i18n/fr";

describe("scoreOf (TXT-9)", () => {
  test("is WPM × accuracy", () => {
    expect(scoreOf(60, 90)).toBe(54);
  });
  test("a careful typist can beat a faster, sloppy one", () => {
    expect(scoreOf(83, 99)).toBeGreaterThan(scoreOf(108, 70));
  });
});

describe("names", () => {
  test("rider names keep letters of any language, digits, spaces, - and _", () => {
    expect(cleanRiderName("Éloïse")).toBe("Éloïse");
    expect(cleanRiderName("  Cloud   Strife_7 ")).toBe("Cloud Strife_7");
    expect(cleanRiderName("e\u0301mile")).toBe("émile");
  });
  test("AUTH-02: rider names are 3 to 20 characters", () => {
    expect(cleanRiderName("ab")).toBeNull();
    expect(cleanRiderName("   ")).toBeNull();
    expect(cleanRiderName("abc")).toBe("abc");
    expect(cleanRiderName("a".repeat(20))).toBe("a".repeat(20));
    expect(cleanRiderName("a".repeat(21))).toBeNull();
  });
  test("rider names refuse special characters", () => {
    for (const bad of ["<b>bob</b>", "bob!", "b@b", "🐤🐤🐤", "bo\nb", "b\u200bob", "z\u0301\u0301\u0301a", 42, null]) {
      expect(cleanRiderName(bad)).toBeNull();
    }
  });
  test("usernames are 3 to 16 plain letters, digits, - and _", () => {
    expect(USERNAME_RE.test("phil_01")).toBe(true);
    expect(USERNAME_RE.test("ab")).toBe(false);
    expect(USERNAME_RE.test("a".repeat(17))).toBe(false);
    expect(USERNAME_RE.test("élo")).toBe(false);
    expect(USERNAME_RE.test("bob smith")).toBe(false);
  });
});

describe("dictionaries (UX-5)", () => {
  test("every server code has a French and an English message", () => {
    for (const code of Object.keys(en.errors) as (keyof typeof en.errors)[]) {
      expect(fr.errors[code]).toBeTruthy();
      expect(fr.errors[code]).not.toBe(en.errors[code]);
    }
  });
  test("French places", () => {
    expect(fr.common.place(1)).toBe("1ER");
    expect(fr.common.place(2)).toBe("2E");
    expect(en.common.place(3)).toBe("3RD");
  });
  test("mount names follow each language's word order", () => {
    expect(en.mount.label("yellow")).toBe("Yellow chocobo");
    expect(fr.mount.label("yellow")).toBe("Chocobo jaune");
  });
});

test("RES-02: how a race ended, and raw WPM", () => {
  expect(raceStatus({ finished: true, away: false, abandoned: false })).toBe("finished");
  expect(raceStatus({ finished: false, away: false, abandoned: false })).toBe("timeout");
  expect(raceStatus({ finished: false, away: true, abandoned: false })).toBe("abandoned");
  expect(raceStatus({ finished: false, away: false, abandoned: true })).toBe("abandoned");
  expect(rawWpmOf(300, 60_000)).toBe(60); // 300 keys in a minute: 60 "words"
  expect(rawWpmOf(10, 500)).toBe(0); // under a second: not meaningful yet
});
