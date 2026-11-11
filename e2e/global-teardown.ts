import { execFileSync } from "node:child_process";

export default async function globalTeardown() {
  const username = process.env.E2E_USERNAME;
  if (username) execFileSync("bun", ["scripts/admin.ts", "delete", username], { stdio: "inherit" });
}
