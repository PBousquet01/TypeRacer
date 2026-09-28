import { describe, expect, test } from "bun:test";
import { scoreOf } from "../lib/rules";
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
