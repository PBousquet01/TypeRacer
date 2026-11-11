import { expect, test } from "@playwright/test";
import { hostRoom, joinAsGuest, newPerson, riderRow, signIn } from "./helpers";

// Every test signs in as the same account, which can only be in one room at
// a time (SALLE-06): each test closes its windows when it ends.
const opened: { close: () => Promise<void> }[] = [];
test.afterEach(async () => {
  await Promise.all(opened.splice(0).map((context) => context.close()));
});

test("TEST-03, SALLE-01, JOIN-01, COURSE-03 to COURSE-10, RES-01: a signed-in host and a guest race to the results", async ({ browser }) => {
  const host = await newPerson(browser, opened);
  const guest = await newPerson(browser, opened);

  await signIn(host);
  const code = await hostRoom(host);

  // The guest joins by code; the host sees them arrive without reloading.
  await joinAsGuest(guest, code, "Guest Rider");
  await expect(riderRow(host, "Guest Rider")).toBeVisible();

  // A short text, a 30-second limit and a slow bot: the guest wins, and the
  // clock ends the race for the bot (COURSE-09).
  await host.getByRole("button", { name: "10 words" }).click();
  await host.getByRole("button", { name: "30 s", exact: true }).click();
  await host.getByRole("button", { name: "Noob" }).click();
  await host.getByTestId("add-bot").click();
  await expect(riderRow(guest, "BOT")).toHaveCount(1);
  await guest.getByTestId("ready").click();
  await host.getByTestId("start-race").click();

  // COURSE-03: the text shows up with the countdown; typing opens at the start.
  const text = (await guest.getByTestId("race-text").textContent())!;
  expect(text.length).toBeGreaterThan(20);
  const input = guest.getByTestId("typing-input");
  await expect(input).toBeEnabled({ timeout: 10_000 });
  await input.pressSequentially(text, { delay: 70 }); // about 170 wpm, under the anti-cheat limit

  // RES-01, COURSE-10: both see the results; the guest is first, the bot ran out of time.
  for (const page of [guest, host]) {
    await expect(page.getByTestId("results-title")).toBeVisible({ timeout: 40_000 });
  }
  const rows = guest.getByTestId("result-row");
  await expect(rows.nth(0)).toContainText("Guest Rider");
  await expect(rows.nth(0)).toContainText("Finished");
  await expect(rows.nth(1)).toContainText("Out of time");
});

test("SALLE-06: a second tab on the same room takes the place over instead of adding a duplicate", async ({ browser }) => {
  const host = await newPerson(browser, opened);
  await signIn(host);
  const code = await hostRoom(host);

  const firstTab = await newPerson(browser, opened);
  await joinAsGuest(firstTab, code, "Twin Tabs");
  await expect(riderRow(host, "Twin Tabs")).toBeVisible();

  const secondTab = await firstTab.context().newPage(); // same browser, same guest cookie
  await joinAsGuest(secondTab, code, "Twin Tabs");
  await expect(firstTab.getByTestId("room-conflict")).toHaveText(/You opened this room in another tab/);
  await expect(riderRow(host, "Twin Tabs")).toHaveCount(1);
});

test("SALLE-06: someone in a room is asked before joining another one", async ({ browser }) => {
  const host = await newPerson(browser, opened);
  await signIn(host);
  const first = await hostRoom(host);

  const guestTab = await newPerson(browser, opened);
  await joinAsGuest(guestTab, first, "Wanderer");
  await expect(riderRow(host, "Wanderer")).toBeVisible();

  // The host opens a second room in a new tab: they are asked first.
  const second = await host.context().newPage();
  await second.goto("/");
  await second.getByTestId("host-race").click();
  await expect(second.getByTestId("room-conflict")).toHaveText(new RegExp(`already in room ${first}`));
  await second.getByTestId("leave-other-room").click();
  await expect(second.getByTestId("start-race")).toBeVisible(); // hosting the new room
  await expect(host.getByTestId("room-conflict")).toHaveText(/You joined another room/);
});
