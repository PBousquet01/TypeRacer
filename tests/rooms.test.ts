import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { client, freshCode, sleep, startGameServer, type TestClient } from "./helpers";
import { migrate } from "../server/db";
import { FINISH_GRACE_MS, MAX_RIDERS } from "../lib/rules";
import { MAX_CHARS_PAST_MISTAKE } from "../lib/typing";

let server: Awaited<ReturnType<typeof startGameServer>>;
const opened: TestClient[] = [];

async function open(code: string, name: string, role: "host" | "rider") {
  const c = await client(server.url, code, name, role);
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

  test(`COURSE-4: a room takes ${MAX_RIDERS} riders, not one more`, async () => {
    const code = freshCode();
    const host = await open(code, "Host", "host");
    await host.join();
    for (let i = 0; i < MAX_RIDERS; i++) {
      const r = await open(code, `R${i}`, "rider");
      expect(await r.join()).toMatchObject({ ok: true });
    }
    const extra = await open(code, "Extra", "rider");
    expect(await extra.join()).toEqual({ error: "room-full" });
  }, 20_000);

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
    expect(host.room?.settings).toEqual({ language: "en", kind: "sentences", hostRides: false });
  });

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
