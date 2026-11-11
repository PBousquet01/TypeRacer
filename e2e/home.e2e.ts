import { expect, test } from "@playwright/test";

test("I18N-02: the language switch changes the interface and is remembered", async ({ page }) => {
  await page.goto("/");
  const signInToHost = page.getByTestId("sign-in-to-host");
  await expect(signInToHost).toHaveText(/Sign in to host/);
  await page.getByTestId("language-toggle").click();
  await expect(signInToHost).toHaveText(/Se connecter pour organiser/);
  await page.reload();
  await expect(signInToHost).toHaveText(/Se connecter pour organiser/);
  await page.getByTestId("language-toggle").click();
  await expect(signInToHost).toHaveText(/Sign in to host/);
});

test("DES-05: the theme follows the system first, then the switch, and stays after a reload", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "dark" });
  await page.goto("/");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.getByTestId("theme-toggle").click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
});

test("AUTH-03: a guest is offered to sign in instead of hosting", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByTestId("host-race")).toHaveCount(0);
  await page.getByTestId("sign-in-to-host").click();
  await expect(page).toHaveURL(/\/account$/);
});
