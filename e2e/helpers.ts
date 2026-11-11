import { expect, type Browser, type Page } from "@playwright/test";

/** A page in its own browser context (its own cookies: another person), closed by `closeAll`. */
export async function newPerson(browser: Browser, opened: { close: () => Promise<void> }[]) {
  const context = await browser.newContext();
  opened.push(context);
  return context.newPage();
}

/** TEST-03: signs in through the account page with the run's username and password. */
export async function signIn(page: Page) {
  await page.goto("/account");
  await page.getByTestId("username").fill(process.env.E2E_USERNAME!);
  await page.getByTestId("password").fill(process.env.E2E_PASSWORD!);
  await page.getByTestId("account-submit").click();
  await expect(page.getByTestId("account-link")).toHaveText("E2E Host"); // back home, signed in
}

/** Opens a new room as the signed-in host and returns its code. */
export async function hostRoom(page: Page) {
  await page.goto("/");
  await page.getByTestId("host-race").click();
  await page.waitForURL(/\/room\/[A-Z0-9]{6}$/);
  return page.url().split("/").at(-1)!;
}

/** Joins a room as a guest from the home page's code field (JOIN-01). */
export async function joinAsGuest(page: Page, code: string, name: string) {
  await page.goto("/");
  await page.getByTestId("rider-name").fill(name);
  await page.getByTestId("room-code").fill(code);
  await page.getByTestId("join-room").click();
  await page.waitForURL(`**/room/${code}`);
}

/** The lobby row of the rider called `name`. */
export const riderRow = (page: Page, name: string) => page.getByTestId("rider-row").filter({ hasText: name });
