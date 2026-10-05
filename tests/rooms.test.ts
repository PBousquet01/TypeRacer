import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { client, freshCode, sleep, startGameServer, type ClientOptions, type TestClient } from "./helpers";
import { publicRooms, quickRaceRoom } from "../server/rooms";
import type { BonusEvent, InviteSummary, RoomSummary } from "../lib/types";
import { migrate } from "../server/db";
import { FINISH_GRACE_MS, MAX_RIDERS } from "../lib/rules";
import { MAX_CHARS_PAST_MISTAKE } from "../lib/typing";

let server: Awaited<ReturnType<typeof startGameServer>>;
const opened: TestClient[] = [];

async function open(code: string, name: string, role: "host" | "rider", options: ClientOptions = {}) {
  const c = await client(server.url, code, name, role, options);
  opened.push(c);
  return c;
}

/** A socket as a hand-written client sees it: any event, any arguments. */
const raw = (c: TestClient) => c.socket as unknown as { emit: (event: string, ...args: unknown[]) => void };

/** `count` wrong keys, each one fixed with a backspace, before `passage` typed cleanly. */
const sloppy = (passage: string, count: number) => (passage[0] === "~" ? "!\b" : "~\b").repeat(count) + passage;

/** A room with a host and two ready riders. */
async function readyRoom() {
  const code = freshCode();
  const host = await open(code, "Host", "host");
  await host.join();
  const a = await open(code, "Alice", "rider");
  const b = await open(code, "Bob", "rider");
  await a.join();
  await b.join();
  a.socket.emit("toggleReady");
  b.socket.emit("toggleReady");
  await host.until((r) => r.players.filter((p) => p.ready).length === 2);
  return { code, host, a, b };
}

beforeAll(async () => {
  await migrate(); // race texts come from the database (TXT-3)
  server = await startGameServer();
});

afterAll(async () => {
  opened.forEach((c) => c.close());
  await server?.close();
});

describe("lobby rules", () => {
  test("COURSE-3: a race needs two ready riders", async () => {
    const code = freshCode();
    const host = await open(code, "Host", "host");
    await host.join();
    const a = await open(code, "Alice", "rider");
    await a.join();
    a.socket.emit("toggleReady");
    await host.until((r) => r.players.some((p) => p.ready));

    expect(await host.startRace()).toEqual({ error: "need-riders" });
  });

  test("only the host can start", async () => {
    const { a } = await readyRoom();
    expect(await a.startRace()).toEqual({ error: "host-only" });
  });

  test("a double click on Start starts one race", async () => {
    const { host } = await readyRoom();
    let countdowns = 0;
    host.socket.on("roomUpdate", (r) => r.status === "countdown" && countdowns++);
    const replies = await Promise.all([host.startRace(), host.startRace()]);
    expect(replies).toContainEqual({ ok: true });
    expect(replies).toContainEqual({ error: "already-started" });
    await sleep(200);
    expect(countdowns).toBe(1);
  });

  test(`SALLE-05: a room takes ${MAX_RIDERS} riders by default, not one more`, async () => {
    const code = freshCode();
    const host = await open(code, "Host", "host");
    await host.join();
    expect((await host.until(() => true)).settings.capacity).toBe(MAX_RIDERS);
    for (let i = 0; i < MAX_RIDERS; i++) {
      const r = await open(code, `R${i}`, "rider");
      expect(await r.join()).toMatchObject({ ok: true });
    }
    const extra = await open(code, "Extra", "rider");
    expect(await extra.join()).toEqual({ error: "room-full" });
  }, 20_000);

  test("SALLE-05: the host sets the capacity; a riding host and bots fill it, the room never drops below who's in", async () => {
    const code = freshCode();
    const host = await open(code, "Host", "host");
    await host.join();
    raw(host).emit("updateSettings", { capacity: 1 }); // under the minimum: refused
    raw(host).emit("updateSettings", { capacity: MAX_RIDERS + 1 }); // over the maximum: refused
    host.socket.emit("updateSettings", { capacity: 3, hostRides: true });
    await host.until((r) => r.settings.capacity === 3);

    const a = await open(code, "Alice", "rider");
    expect(await a.join()).toMatchObject({ ok: true });
    host.socket.emit("addBot", "beginner");
    await host.until((r) => r.players.some((p) => p.bot));
    host.socket.emit("addBot", "beginner"); // host + Alice + bot = 3: full
    const b = await open(code, "Bob", "rider");
    expect(await b.join()).toEqual({ error: "room-full" });

    host.socket.emit("updateSettings", { capacity: 2 }); // three are in: refused
    host.socket.emit("updateSettings", { hostRides: false });
    await host.until((r) => !r.settings.hostRides);
    expect(host.room!.settings.capacity).toBe(3);
    expect(host.room!.players.filter((p) => p.bot)).toHaveLength(1);
    expect(await b.join()).toMatchObject({ ok: true }); // a watching host frees a place

    host.socket.emit("updateSettings", { hostRides: true }); // full again: the host can't start riding
    await sleep(150);
    expect(host.room!.settings.hostRides).toBe(false);
  });

  test("AUTH-03, SALLE-01: a guest can't open a room, even on a code the server issued", async () => {
    const code = freshCode();
    const guest = await open(code, "Guest", "host", { guest: true });
    expect(await guest.join()).toEqual({ error: "sign-in-to-host" });
    const host = await open(code, "Host", "host");
    expect(await host.join()).toMatchObject({ ok: true, role: "host" }); // the code is still the host's
  });

  test("riders need a room that exists", async () => {
    const a = await open(freshCode(), "Alice", "rider");
    expect(await a.join()).toEqual({ error: "no-room" });
  });

  test("TECH-07: a join of the wrong shape is refused, and a bad acknowledgement can't crash the server", async () => {
    const code = freshCode();
    const host = await open(code, "Host", "host");
    const answer = (payload: unknown) =>
      new Promise((resolve) => raw(host).emit("joinRoom", payload, resolve));
    expect(await answer(42)).toEqual({ error: "bad-request" });
    expect(await answer({ code, name: "Host", role: "boss" })).toEqual({ error: "bad-request" });
    expect(await answer({ code, name: ["Host"] })).toEqual({ error: "name-format" });

    raw(host).emit("joinRoom", { code, name: "Host", role: "host" }, "not a function");
    await sleep(100);
    const rider = await open(code, "Alice", "rider");
    expect(await rider.join()).toMatchObject({ ok: true }); // the server is still up, and the room exists
  });

  test("SALLE-02: room codes are six unambiguous characters", () => {
    for (let i = 0; i < 200; i++) {
      expect(freshCode()).toMatch(/^[A-HJKMNP-Z2-9]{6}$/);
    }
  });

  test("SALLE-02: a malformed code is refused", async () => {
    for (const code of ["", "ABC", "ABCDEFG", "ABCDE0", "ABCDEL"]) {
      const host = await open(code, "Host", "host");
      expect(await host.join()).toEqual({ error: "bad-code" });
    }
  });

  test("SALLE-02: a host can't open a room on a code the server didn't issue", async () => {
    const host = await open("HHHHHH", "Host", "host");
    expect(await host.join()).toEqual({ error: "no-room" });
  });

  test("SALLE-02: an issued code opens one room, and a pasted code with dashes still finds it", async () => {
    const code = freshCode();
    const host = await open(code, "Host", "host");
    expect(await host.join()).toMatchObject({ ok: true, role: "host" });
    const rider = await open(`${code.slice(0, 3)}-${code.slice(3).toLowerCase()}`, "Alice", "rider");
    expect(await rider.join()).toMatchObject({ ok: true, role: "rider" });
  });

  test("a rider name that breaks the rules is refused", async () => {
    const code = freshCode();
    const host = await open(code, "Host", "host");
    await host.join();
    for (const name of ["", "x", "<img src=x>", "a".repeat(17)]) {
      const rider = await open(code, name, "rider");
      expect(await rider.join()).toEqual({ error: "name-format" });
    }
    expect(host.room?.players.length).toBe(1);
  });

  test("a guest can't ride a locked mount", async () => {
    const code = freshCode();
    const host = await open(code, "Host", "host");
    await host.join();
    const a = await open(code, "Alice", "rider");
    await a.join({ color: "fox" });
    await a.until((r) => r.players.length === 2);
    expect(a.me()?.color).toBe("yellow");
  });

  test("COURSE-11: the host's settings reach riders; riders can't change them", async () => {
    const { host, a } = await readyRoom();
    a.socket.emit("updateSettings", { language: "fr" });
    await sleep(150);
    expect(host.room?.settings.language).toBe("en");

    host.socket.emit("updateSettings", { language: "fr", kind: "words" });
    const seen = await a.until((r) => r.settings.language === "fr");
    expect(seen.settings.kind).toBe("words");
  });

  test("invalid settings are ignored", async () => {
    const { host } = await readyRoom();
    host.socket.emit("updateSettings", { language: "de" as "en", kind: "code" as "words" });
    raw(host).emit("updateSettings", { language: "fr", hostRides: "yes" }); // one bad value spoils the message
    raw(host).emit("updateSettings", "fr");
    await sleep(150);
    expect(host.room?.settings).toMatchObject({ language: "en", kind: "sentences", hostRides: false, visibility: "code", bonuses: false });
  });

  test("CONF-01, CONF-04 to CONF-07: the host's text settings shape the race text", async () => {
    const { host, a } = await readyRoom();
    host.socket.emit("updateSettings", { length: 10, complexity: "easy", punctuation: false, maxTimeMs: 60_000 });
    raw(host).emit("updateSettings", { maxTimeMs: 5_000 }); // under 30 s: refused
    raw(host).emit("updateSettings", { length: 5000 }); // too long: refused
    const r = await host.until((x) => x.settings.length === 10 && x.settings.maxTimeMs === 60_000);
    await sleep(150);
    expect(host.room!.settings).toMatchObject({ length: 10, complexity: "easy", punctuation: false, maxTimeMs: 60_000 });
    expect(r.settings.capitals).toBe(true); // untouched settings keep their value

    expect(await host.startRace()).toEqual({ ok: true });
    const { text } = await a.until((x) => x.status === "countdown");
    expect(text.split(" ")).toHaveLength(10);
    expect(text).not.toMatch(/[.,;:!?]/);

    host.socket.emit("updateSettings", { maxTimeMs: null }); // too late: the race has started
    await sleep(150);
    expect(host.room!.settings.maxTimeMs).toBe(60_000);
  });

  test("CONF-08: in free mode a rider finishes with mistakes left in, and they count", async () => {
    const { host, a, b } = await readyRoom();
    host.socket.emit("updateSettings", { errorMode: "free", length: 10 });
    await host.until((x) => x.settings.errorMode === "free" && x.settings.length === 10);
    expect(await host.startRace()).toEqual({ ok: true });
    const { text } = await a.until((x) => x.status === "racing");
    // Alice gets every third letter wrong and never fixes anything.
    const typed = [...text].map((c, i) => (i % 3 === 1 && c !== " " ? (c === "x" ? "y" : "x") : c)).join("");
    await sleep((text.length / 20) * 1000);
    a.socket.emit("typed", 0, typed);
    b.socket.emit("typed", 0, text);
    const r = await host.until((x) => x.status === "finished");
    const alice = r.players.find((p) => p.name === "Alice")!;
    const bob = r.players.find((p) => p.name === "Bob")!;
    expect(alice.finished).toBe(true);
    const wrong = [...typed].filter((c, i) => c !== text[i]).length;
    expect(alice.errors).toBe(wrong);
    expect(alice.accuracy).toBeLessThan(100);
    expect(alice.wpm!).toBeLessThan(alice.rawWpm!); // net WPM leaves the wrong characters out
    expect(bob).toMatchObject({ errors: 0, accuracy: 100 });
  }, 20_000);

  test("TECH-07: setWatching with the wrong types is ignored", async () => {
    const { host } = await readyRoom();
    const alice = host.room!.players.find((p) => p.name === "Alice")!;
    raw(host).emit("setWatching", alice.id, "true");
    raw(host).emit("setWatching", { id: alice.id }, true);
    await sleep(150);
    expect(host.room?.players.find((p) => p.name === "Alice")?.watching).toBe(false);
  });

  test("COURSE-5: a host who rides counts towards the minimum and races", async () => {
    const code = freshCode();
    const host = await open(code, "Host", "host");
    await host.join();
    const a = await open(code, "Alice", "rider");
    await a.join();
    a.socket.emit("toggleReady");
    await host.until((r) => r.players.some((p) => p.ready));
    expect(await host.startRace()).toEqual({ error: "need-riders" }); // a watching host doesn't count (H-12)

    host.socket.emit("updateSettings", { hostRides: true });
    await host.until((r) => r.settings.hostRides);
    expect(await host.startRace()).toEqual({ ok: true });
    const r = await host.until((x) => x.status === "countdown");
    expect(r.players.find((p) => p.name === "Host")?.racing).toBe(true);
  });

  test("COURSE-6: the host sends a rider to the stands, where they can't ready up", async () => {
    const { host, a } = await readyRoom();
    const alice = host.room!.players.find((p) => p.name === "Alice")!;
    const bob = host.room!.players.find((p) => p.name === "Bob")!;
    a.socket.emit("setWatching", bob.id, true); // only the host can
    await sleep(150);
    host.socket.emit("setWatching", alice.id, true);
    const r = await host.until((x) => x.players.some((p) => p.name === "Alice" && p.watching));
    expect(r.players.find((p) => p.name === "Alice")?.ready).toBe(false);
    expect(r.players.find((p) => p.name === "Bob")?.watching).toBe(false);

    a.socket.emit("toggleReady");
    await sleep(150);
    expect(host.room?.players.find((p) => p.name === "Alice")?.ready).toBe(false);
    expect(await host.startRace()).toEqual({ error: "need-riders" });

    host.socket.emit("setWatching", alice.id, false);
    await host.until((x) => x.players.some((p) => p.name === "Alice" && !p.watching));
    a.socket.emit("toggleReady");
    await host.until((x) => x.players.some((p) => p.name === "Alice" && p.ready));
  });

  test("COURSE-14: a riding host who drops keeps their lane and the host seat", async () => {
    const code = freshCode();
    let host = await open(code, "Host", "host");
    await host.join();
    host.socket.emit("updateSettings", { hostRides: true });
    const a = await open(code, "Alice", "rider");
    await a.join();
    a.socket.emit("toggleReady");
    await host.until((r) => r.settings.hostRides && r.players.some((p) => p.ready));
    await host.startRace();
    const r = await host.until((x) => x.status === "racing", 5000);
    await sleep(1000); // 20 characters in under a second would trip the anti-cheat
    host.socket.emit("typed", 0, r.text.slice(0, 20));
    await sleep(200);
    host.close();
    await a.until((x) => x.hostAway);

    host = await open(code, "Host", "host"); // same tab, same clientId
    expect(await host.join()).toMatchObject({ ok: true, role: "host" });
    const back = await a.until((x) => x.hostId !== null);
    const me = back.players.find((p) => p.name === "Host")!;
    expect(me.role).toBe("host");
    expect(me.racing).toBe(true);
    expect(me.charIndex).toBe(20);
  }, 10_000);
});

describe("a full race", () => {
  let room: Awaited<ReturnType<typeof readyRoom>>;
  let text = "";
  let length = 0;

  test("the race starts after a countdown", async () => {
    room = await readyRoom();
    expect(await room.host.startRace()).toEqual({ ok: true });
    const countdown = await room.host.until((r) => r.status === "countdown");
    expect(countdown.text.length).toBeGreaterThan(40); // a real passage from the bank
    text = countdown.text;
    length = text.length;
    await room.host.until((r) => r.status === "racing", 5000);
  });

  test("progress faster than a human is ignored (anti-cheat)", async () => {
    room.a.socket.emit("typed", 0, text);
    await sleep(300);
    expect(room.host.room?.players.find((p) => p.name === "Alice")?.finished).toBe(false);
  });

  test("the server judges the keys: wrong ones don't move the bird", async () => {
    await sleep(1000); // 20 characters in under a second would trip the anti-cheat
    room.b.socket.emit("typed", 0, "~".repeat(20)); // a tampered page calling these 20 keys right
    room.b.socket.emit("typed", 20, text.slice(20, 40)); // or claiming to be 20 characters in
    raw(room.b).emit("typed", "0", text.slice(0, 20)); // TECH-07: wrong types are dropped too
    raw(room.b).emit("typed", 0, [text.slice(0, 20)]);
    room.a.socket.emit("typed", 0, text.slice(0, 20));
    await sleep(200); // mid-race progress goes out in the `positions` feed, not in room updates
    room.a.close();
    const r = await room.host.until((x) => x.players.some((p) => p.name === "Alice" && p.away));
    expect(r.players.find((p) => p.name === "Bob")?.charIndex).toBe(0);
    expect(r.players.find((p) => p.name === "Alice")?.charIndex).toBe(20);
  });

  test("COURSE-7: someone arriving mid-race watches", async () => {
    const late = await open(room.code, "Late", "rider");
    expect(await late.join()).toMatchObject({ ok: true, note: "late-arrival" });
    const seen = await room.host.until((r) => r.players.some((p) => p.name === "Late"));
    expect(seen.players.find((p) => p.name === "Late")?.racing).toBe(false);
  });

  test("COURSE-14: a dropped rider keeps their lane and progress", async () => {
    room.a = await open(room.code, "Alice", "rider"); // same tab, same clientId
    await room.a.join();
    const back = await room.host.until((r) => r.players.some((p) => p.name === "Alice" && !p.away));
    expect(back.players.find((p) => p.name === "Alice")?.charIndex).toBe(20);
  });

  test("COURSE-15: the first finish starts the last call", async () => {
    await sleep(Math.ceil(length / 25) * 1000); // stay under the ~300 WPM limit
    room.b.socket.emit("typed", 0, sloppy(text, Math.round(length / 2))); // Bob crosses first, sloppily
    const r = await room.host.until((x) => x.finishIn !== null);
    expect(r.finishIn!).toBeGreaterThan(FINISH_GRACE_MS - 2000);
  }, 15_000);

  test("TXT-9: the careful rider wins on score, even crossing second", async () => {
    await sleep(1200);
    room.a.socket.emit("typed", 20, text.slice(20)); // last finisher: the race ends on the spot
    const r = await room.host.until((x) => x.status === "finished");
    const alice = r.players.find((p) => p.name === "Alice")!;
    const bob = r.players.find((p) => p.name === "Bob")!;
    expect(alice.accuracy).toBe(100); // counted by the server from the keys it received
    // Bob's wrong keys from earlier count too (the 5 the rules let through before he had to fix them).
    const wrong = Math.round(length / 2) + MAX_CHARS_PAST_MISTAKE;
    expect(bob.accuracy).toBe(Math.round((length / (length + wrong)) * 100));
    expect(alice.score).toBe(alice.wpm!);
    expect(bob.timeMs!).toBeLessThan(alice.timeMs!);
    expect(alice.place).toBe(1);
    expect(bob.place).toBe(2);
    // RES-02: raw WPM counts the wrong keys too; errors are the wrong keys.
    expect(alice).toMatchObject({ errors: 0, status: "finished" });
    expect(alice.rawWpm).toBeGreaterThanOrEqual(alice.wpm!);
    expect(bob).toMatchObject({ errors: wrong, status: "finished" });
    expect(bob.rawWpm!).toBeGreaterThan(bob.wpm!);
  });

  test("a finished rider's result can't be changed", async () => {
    const before = room.host.room?.players.find((p) => p.name === "Bob");
    room.b.socket.emit("typed", 0, text);
    await sleep(200);
    expect(room.host.room?.players.find((p) => p.name === "Bob")).toEqual(before!);
  });

  test("back to the lobby keeps everyone", async () => {
    room.host.socket.emit("playAgain");
    const r = await room.host.until((x) => x.status === "lobby");
    expect(r.players.map((p) => p.name).sort()).toEqual(["Alice", "Bob", "Host", "Late"]);
  });
});

describe("bots", () => {
  /** A room with a host who watches, and one rider. */
  async function hostAndRider() {
    const code = freshCode();
    const host = await open(code, "Host", "host");
    await host.join();
    const a = await open(code, "Alice", "rider");
    await a.join();
    return { code, host, a };
  }

  test("CONF-10: the host adds and removes bots; riders can't, and a made-up level is ignored", async () => {
    const { host, a } = await hostAndRider();
    host.socket.emit("addBot", "expert");
    raw(a).emit("addBot", "expert");
    raw(host).emit("addBot", "godlike");
    const r = await host.until((x) => x.players.some((p) => p.bot));
    await sleep(150);
    const bots = host.room!.players.filter((p) => p.bot);
    expect(bots).toHaveLength(1);
    expect(bots[0]).toMatchObject({ bot: "expert", ready: true, role: "rider" });
    expect(r.players.find((p) => p.name === "Alice")?.bot).toBeNull();

    raw(a).emit("removeBot", bots[0].id);
    raw(host).emit("removeBot", r.players.find((p) => p.name === "Alice")!.id); // not a bot: stays
    await sleep(150);
    expect(host.room!.players).toHaveLength(3);
    host.socket.emit("removeBot", bots[0].id);
    const after = await host.until((x) => !x.players.some((p) => p.bot));
    expect(after.players.map((p) => p.name).sort()).toEqual(["Alice", "Host"]);
  });

  test("COURSE-02: bots count towards the minimum, but a race needs a person", async () => {
    const { host } = await hostAndRider(); // Alice isn't ready
    host.socket.emit("addBot", "noob");
    host.socket.emit("addBot", "noob");
    await host.until((x) => x.players.filter((p) => p.bot).length === 2);
    expect(await host.startRace()).toEqual({ error: "need-human" });
  });

  test("a room with only bots left closes", async () => {
    const { code, host, a } = await hostAndRider();
    host.socket.emit("addBot", "expert");
    await host.until((x) => x.players.some((p) => p.bot));
    a.socket.emit("leaveRoom");
    host.socket.emit("leaveRoom");
    await sleep(150);
    const late = await open(code, "Late", "rider");
    expect(await late.join()).toEqual({ error: "no-room" });
  });

  test("BOT-01, BOT-04: a bot races through the same referee, finishes in its speed range and gets a place", async () => {
    const { host, a } = await hostAndRider();
    host.socket.emit("addBot", "impossible");
    a.socket.emit("toggleReady");
    await host.until((x) => x.players.some((p) => p.bot) && x.players.some((p) => p.ready && !p.bot));
    expect(await host.startRace()).toEqual({ ok: true });
    const racing = await a.until((x) => x.status === "racing");

    const withBot = await a.until((x) => x.players.some((p) => p.bot && p.finished), 20_000);
    const bot = withBot.players.find((p) => p.bot)!;
    expect(bot.wpm).toBeGreaterThanOrEqual(135); // 140–170, give or take the 100 ms ticks
    expect(bot.wpm).toBeLessThanOrEqual(175);
    expect(bot.accuracy).toBeGreaterThan(90);

    a.socket.emit("typed", 0, racing.text); // Alice finishes after the bot
    const done = await a.until((x) => x.status === "finished");
    expect(done.players.find((p) => p.bot)?.place).not.toBeNull();
    // RES-03: once the race is over, the results carry each rider's WPM, second by second.
    const botAfter = done.players.find((p) => p.bot)!;
    expect(botAfter.samples.length).toBeGreaterThan(5);
    expect(botAfter.samples.at(-1)).toBe(botAfter.wpm!);
    const aliceAfter = done.players.find((p) => p.name === "Alice")!;
    expect(aliceAfter.samples.at(-1)).toBe(aliceAfter.wpm!);
    expect(done.players.find((p) => p.name === "Alice")?.place).not.toBeNull();
  }, 30_000);
});

describe("visibility and joining", () => {
  /** A host's room with the given visibility, and the host's client. */
  async function hostRoom(visibility: "public" | "code" | "private", name = "Host") {
    const code = freshCode(visibility);
    const host = await open(code, name, "host");
    await host.join();
    return { code, host };
  }

  test("SALLE-03: only public rooms are listed, and the list follows changes live", async () => {
    const watcher = await open("", "Watcher", "rider");
    const lists: RoomSummary[][] = [];
    watcher.socket.on("roomList", (list) => lists.push(list));
    watcher.socket.emit("watchRooms");

    const pub = await hostRoom("public", "Pat");
    const coded = await hostRoom("code");
    const priv = await hostRoom("private");
    await sleep(700); // the list goes out at most twice a second
    const listed = lists.at(-1)!.map((r) => r.code);
    expect(listed).toContain(pub.code);
    expect(listed).not.toContain(coded.code);
    expect(listed).not.toContain(priv.code);
    expect(lists.at(-1)!.find((r) => r.code === pub.code)).toMatchObject({ host: "Pat", riders: 0, status: "lobby", complexity: "medium" });

    coded.host.socket.emit("updateSettings", { visibility: "public" });
    raw(priv.host).emit("updateSettings", { visibility: "secret" }); // not a visibility: ignored
    await sleep(700);
    expect(lists.at(-1)!.map((r) => r.code)).toContain(coded.code);
    expect(lists.at(-1)!.map((r) => r.code)).not.toContain(priv.code);

    [pub.host, coded.host, priv.host, watcher].forEach((c) => c.close());
    await sleep(150);
    expect(publicRooms().map((r) => r.code)).not.toContain(pub.code); // closed rooms leave the list
  });

  test("JOIN-03: quick play picks the fullest public room with a free place, the oldest on a tie", async () => {
    const older = await hostRoom("public");
    const newer = await hostRoom("public");
    const fuller = await hostRoom("public");
    const coded = await hostRoom("code");
    for (const [room, n] of [[older, 1], [newer, 1], [fuller, 2], [coded, 3]] as const) {
      for (let i = 0; i < n; i++) await (await open(room.code, `R${i}`, "rider")).join();
    }
    expect(quickRaceRoom()).toBe(fuller.code);

    fuller.host.close(); // the fuller room's host leaves; its riders stay, but it's still waiting
    const extra = await open(older.code, "Extra", "rider");
    await extra.join(); // now `older` has 2 riders and is older than `fuller`
    expect(quickRaceRoom()).toBe(older.code);
  });

  test("SALLE-03, SALLE-04: a private room takes an invite link, never the code alone", async () => {
    const { code, host } = await hostRoom("private");
    const invites: InviteSummary[][] = [];
    host.socket.on("inviteList", (list) => invites.push(list));

    const noLink = await open(code, "Alice", "rider");
    expect(await noLink.join()).toEqual({ error: "invite-needed" });
    const forged = await open(code, "Alice", "rider", { invite: "made-up-token" });
    expect(await forged.join()).toEqual({ error: "invite-invalid" });

    const rider = await open(code, "Rider", "rider");
    const notHost = await new Promise((resolve) => rider.socket.emit("createInvite", null, resolve));
    expect(notHost).toEqual({ error: "host-only" });

    const made = await new Promise<{ ok: true; token: string }>((resolve) =>
      host.socket.emit("createInvite", null, (res) => resolve(res as { ok: true; token: string })),
    );
    expect(made.token).toMatch(/^[A-Za-z0-9_-]{22}$/); // 16 random bytes: 128 bits
    expect(invites.at(-1)).toEqual([{ token: made.token, usedBy: null }]);

    const alice = await open(code, "Alice", "rider", { ip: "10.0.0.1", invite: made.token });
    expect(await alice.join()).toMatchObject({ ok: true });
    await sleep(100);
    expect(invites.at(-1)).toEqual([{ token: made.token, usedBy: "Alice" }]);

    const bob = await open(code, "Bob", "rider", { ip: "10.0.0.2", invite: made.token });
    expect(await bob.join()).toEqual({ error: "invite-used" });

    alice.close();
    await sleep(100);
    const aliceAgain = await open(code, "Alice", "rider", { ip: "10.0.0.1", invite: made.token });
    expect(await aliceAgain.join()).toMatchObject({ ok: true }); // same person, back again
  });

  test("SALLE-07: the host kicks a rider out for good; nobody else can", async () => {
    const { code, host } = await hostRoom("code");
    const alice = await open(code, "Alice", "rider");
    const bob = await open(code, "Bob", "rider");
    await alice.join();
    await bob.join();
    const seen = await host.until((x) => x.players.some((p) => p.name === "Alice") && x.players.some((p) => p.name === "Bob"));
    const aliceId = seen.players.find((p) => p.name === "Alice")!.id;

    raw(bob).emit("kickPlayer", aliceId); // not the host: nothing happens
    await sleep(150);
    expect(host.room!.players.some((p) => p.name === "Alice")).toBe(true);

    let kicked = false;
    alice.socket.on("kicked", () => (kicked = true));
    host.socket.emit("kickPlayer", aliceId);
    const r = await host.until((x) => !x.players.some((p) => p.name === "Alice"));
    expect(r.players.map((p) => p.name).sort()).toEqual(["Bob", "Host"]);
    await sleep(100);
    expect(kicked).toBe(true);

    expect(await alice.join()).toEqual({ error: "kicked" }); // same tab, back again: refused
    const back = await open(code, "Alice", "rider"); // a new connection from the same tab
    expect(await back.join()).toEqual({ error: "kicked" });
  });

  test("SALLE-04, SALLE-07: a kicked rider's invite link is revoked", async () => {
    const { code, host } = await hostRoom("private");
    const invites: InviteSummary[][] = [];
    host.socket.on("inviteList", (list) => invites.push(list));
    const made = await new Promise<{ ok: true; token: string }>((resolve) =>
      host.socket.emit("createInvite", null, (res) => resolve(res as { ok: true; token: string })),
    );
    const alice = await open(code, "Alice", "rider", { ip: "10.0.0.5", invite: made.token });
    expect(await alice.join()).toMatchObject({ ok: true });

    const seen = await host.until((x) => x.players.some((p) => p.name === "Alice"));
    host.socket.emit("kickPlayer", seen.players.find((p) => p.name === "Alice")!.id);
    await host.until((x) => !x.players.some((p) => p.name === "Alice"));
    await sleep(100);
    expect(invites.at(-1)).toEqual([]);
    const someoneElse = await open(code, "Carol", "rider", { ip: "10.0.0.5", invite: made.token });
    expect(await someoneElse.join()).toEqual({ error: "invite-invalid" });
  });

  test("SALLE-04: links die with the room", async () => {
    const { code, host } = await hostRoom("private");
    const made = await new Promise<{ ok: true; token: string }>((resolve) =>
      host.socket.emit("createInvite", null, (res) => resolve(res as { ok: true; token: string })),
    );
    host.close();
    await sleep(150);
    const late = await open(code, "Late", "rider", { invite: made.token });
    expect(await late.join()).toEqual({ error: "no-room" });
  });
});

describe("comeback bonuses", () => {
  test("BONUS-01 to BONUS-04: the rider left behind gets a bonus at the leader's first checkpoint", async () => {
    const { host, a, b } = await readyRoom(); // Alice will lead, Bob stays behind
    host.socket.emit("updateSettings", { bonuses: true });
    await host.until((r) => r.settings.bonuses);
    const events: BonusEvent[] = [];
    const texts: Record<string, string[]> = { Alice: [], Bob: [] };
    a.socket.on("bonus", (e) => events.push(e));
    a.socket.on("yourText", (t) => texts.Alice.push(t));
    b.socket.on("yourText", (t) => texts.Bob.push(t));

    expect(await host.startRace()).toEqual({ ok: true });
    const { text } = await a.until((r) => r.status === "racing");
    const alice = a.me()!.id;
    const bob = b.me()!.id;

    // Alice types whole words past a quarter of the text, slowly enough for the anti-cheat.
    const quarter = text.indexOf(" ", Math.ceil(text.length * 0.25)) + 1;
    await sleep((quarter / 20) * 1000);
    a.socket.emit("typed", 0, text.slice(0, quarter));
    await sleep(300);

    expect(events).toHaveLength(1); // one checkpoint, one lagging rider
    const [event] = events;
    expect(event.from).toBe(bob);
    const room = await b.until((r) => r.players.some((p) => p.bonuses.length > 0));
    expect(room.players.find((p) => p.id === bob)?.bonuses).toEqual([event.kind]);

    let bobText = text;
    if (event.kind === "shorten") {
      expect(event.target).toBe(bob);
      bobText = texts.Bob.at(-1)!;
      expect(text.startsWith(bobText)).toBe(true);
      expect(bobText.split(" ")).toHaveLength(text.split(" ").length - 3);
    } else {
      expect(event.target).toBe(alice); // "+3 words" and fog slow the leader down
      if (event.kind === "lengthen") {
        const aliceText = texts.Alice.at(-1)!;
        expect(aliceText.startsWith(`${text} `)).toBe(true);
        expect(aliceText.split(" ")).toHaveLength(text.split(" ").length + 3);
        expect(room.players.find((p) => p.id === alice)?.textLength).toBe(aliceText.length);
      }
    }
    expect(room.players.find((p) => p.id === bob)?.textLength).toBe(bobText.length);

    // BONUS-04: Bob's race is against his own text, shortened or not.
    await sleep(Math.max(0, (bobText.length / 22) * 1000 - (quarter / 20) * 1000));
    b.socket.emit("typed", 0, bobText);
    const done = await b.until((r) => r.players.some((p) => p.id === bob && p.finished), 8000);
    expect(done.players.find((p) => p.id === bob)?.wpm).toBeGreaterThan(0);
  }, 30_000);

  test("BOT-04: a bot leader hit by a bonus still finishes its own, changed text", async () => {
    const code = freshCode();
    const host = await open(code, "Host", "host");
    await host.join();
    const a = await open(code, "Alice", "rider");
    await a.join();
    host.socket.emit("addBot", "impossible");
    host.socket.emit("updateSettings", { bonuses: true });
    a.socket.emit("toggleReady");
    await host.until((r) => r.settings.bonuses && r.players.some((p) => p.bot) && r.players.some((p) => p.ready && !p.bot));
    const events: BonusEvent[] = [];
    a.socket.on("bonus", (e) => events.push(e));

    expect(await host.startRace()).toEqual({ ok: true });
    const done = await a.until((r) => r.players.some((p) => p.bot && p.finished), 25_000);
    const bot = done.players.find((p) => p.bot)!;
    expect(events.length).toBeGreaterThanOrEqual(1); // Alice, who never types, is behind at every checkpoint
    expect(events.every((e) => e.from === done.players.find((p) => p.name === "Alice")!.id)).toBe(true);
    const lengthened = events.filter((e) => e.kind === "lengthen" && e.target === bot.id).length;
    expect(bot.textLength).toBeGreaterThanOrEqual(done.text.length); // never shortened: it's the leader
    expect(bot.progress).toBe(1);
    if (lengthened > 0) expect(bot.textLength).toBeGreaterThan(done.text.length);
  }, 40_000);

  test("CONF-09: with bonuses off, nobody gets one", async () => {
    const { host, a } = await readyRoom();
    const events: BonusEvent[] = [];
    a.socket.on("bonus", (e) => events.push(e));
    expect(await host.startRace()).toEqual({ ok: true });
    const { text } = await a.until((r) => r.status === "racing");
    const half = text.indexOf(" ", Math.ceil(text.length * 0.5)) + 1;
    await sleep((half / 20) * 1000);
    a.socket.emit("typed", 0, text.slice(0, half));
    await sleep(300);
    expect(events).toHaveLength(0);
  }, 20_000);
});
