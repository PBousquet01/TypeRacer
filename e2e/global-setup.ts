import { randomBytes } from "node:crypto";
import type { FullConfig } from "@playwright/test";

// TEST-03: the end-to-end tests sign in with a username and password, never
// OAuth. Each run makes its own throwaway account (deleted in
// global-teardown.ts) and hands it to the tests through the environment.
export default async function globalSetup(config: FullConfig) {
  const baseURL = config.projects[0].use.baseURL!;
  const username = `e2e_${randomBytes(4).toString("hex")}`;
  const password = randomBytes(12).toString("hex");
  const res = await fetch(`${baseURL}/api/auth/signup`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password, displayName: "E2E Host" }),
  });
  if (res.status !== 201) throw new Error(`could not create the e2e account (${res.status})`);
  process.env.E2E_USERNAME = username;
  process.env.E2E_PASSWORD = password;
}
