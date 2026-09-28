"use client";

import { Suspense, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import Wordmark from "@/components/Wordmark";
import ThemeToggle from "@/components/ThemeToggle";
import LanguageToggle from "@/components/LanguageToggle";
import { ErrorText, Field, FinePrint, OrRule, PanelTitle } from "@/components/ui";
import { useSession } from "@/lib/session";
import { useT } from "@/lib/i18n";
import type { ErrorCode } from "@/lib/types";

export default function AccountPage() {
  return (
    <Suspense>
      <AccountForm />
    </Suspense>
  );
}

function AccountForm() {
  const t = useT();
  const router = useRouter();
  const { signIn, signUp } = useSession();
  const [creating, setCreating] = useState(useSearchParams().get("new") === "1");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [error, setError] = useState<ErrorCode | "">("");
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
      setError(err instanceof Error && err.message in t.errors ? (err.message as ErrorCode) : "unknown");
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto max-w-[560px] px-[18px] pt-6 pb-[60px]">
      <header className="mb-[18px] flex items-center justify-between gap-4">
        <Link href="/" className="no-underline">
          <Wordmark size={16} />
        </Link>
        <span className="inline-flex items-center gap-2.5">
          <LanguageToggle />
          <ThemeToggle />
        </span>
      </header>

      <form className="frame grid w-full gap-3.5 bg-window px-6 py-[22px]" onSubmit={submit}>
        <PanelTitle as="h2">{creating ? t.account.create : t.account.signIn}</PanelTitle>
        <FinePrint>{t.account.intro}</FinePrint>

        <Field label={t.account.username}>
          <input
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            autoComplete="username"
            maxLength={16}
            placeholder="cloud"
          />
        </Field>

        {creating && (
          <Field label={t.account.riderName}>
            <input
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              maxLength={16}
              placeholder="Cloud"
            />
          </Field>
        )}

        <Field label={t.account.password}>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete={creating ? "new-password" : "current-password"}
            placeholder={creating ? t.account.passwordHint : ""}
          />
        </Field>

        {error && <ErrorText>{t.errors[error]}</ErrorText>}

        <button className="btn btn-primary btn-block" type="submit" disabled={busy}>
          {busy ? t.account.oneMoment : creating ? t.account.createButton : t.account.signIn}
        </button>

        <OrRule>{creating ? t.account.alreadyHave : t.account.newHere}</OrRule>

        <button
          type="button"
          className="btn btn-block"
          onClick={() => {
            setCreating(!creating);
            setError("");
          }}
        >
          {creating ? t.account.signInInstead : t.account.create}
        </button>
        <FinePrint>
          <Link href="/">{t.common.backToStables}</Link>
        </FinePrint>
      </form>
    </main>
  );
}
