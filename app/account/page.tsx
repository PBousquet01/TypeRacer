"use client";

import { Suspense, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import Wordmark from "@/components/Wordmark";
import ThemeToggle from "@/components/ThemeToggle";
import { ErrorText, Field, FinePrint, OrRule, PanelTitle } from "@/components/ui";
import { useSession } from "@/lib/session";

export default function AccountPage() {
  return (
    <Suspense>
      <AccountForm />
    </Suspense>
  );
}

function AccountForm() {
  const router = useRouter();
  const { signIn, signUp } = useSession();
  const [creating, setCreating] = useState(useSearchParams().get("new") === "1");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      if (creating) await signUp(username.trim(), password, displayName.trim() || username.trim());
      else await signIn(username.trim(), password);
      router.push("/");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto max-w-[560px] px-[18px] pt-6 pb-[60px]">
      <header className="mb-[18px] flex items-center justify-between gap-4">
        <Link href="/" className="no-underline">
          <Wordmark size={16} />
        </Link>
        <ThemeToggle />
      </header>

      <form className="frame grid w-full gap-3.5 bg-window px-6 py-[22px]" onSubmit={submit}>
        <PanelTitle as="h2">{creating ? "Create an account" : "Sign in"}</PanelTitle>
        <FinePrint>
          An account saves your race stats and any mounts unlocked for you. You can always race
          as a guest instead — you just won&apos;t get a history.
        </FinePrint>

        <Field label="Username">
          <input
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            autoComplete="username"
            maxLength={16}
            placeholder="cloud"
          />
        </Field>

        {creating && (
          <Field label="Rider name (shown in races)">
            <input
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              maxLength={16}
              placeholder="Cloud"
            />
          </Field>
        )}

        <Field label="Password">
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete={creating ? "new-password" : "current-password"}
            placeholder={creating ? "at least 8 characters" : ""}
          />
        </Field>

        {error && <ErrorText>{error}</ErrorText>}

        <button className="btn btn-primary btn-block" type="submit" disabled={busy}>
          {busy ? "One moment…" : creating ? "Create account" : "Sign in"}
        </button>

        <OrRule>{creating ? "already have one?" : "new here?"}</OrRule>

        <button
          type="button"
          className="btn btn-block"
          onClick={() => {
            setCreating(!creating);
            setError("");
          }}
        >
          {creating ? "Sign in instead" : "Create an account"}
        </button>
        <FinePrint>
          <Link href="/">Back to the stables</Link>
        </FinePrint>
      </form>
    </main>
  );
}
