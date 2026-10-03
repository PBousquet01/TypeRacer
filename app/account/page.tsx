"use client";

import { Suspense, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import Wordmark from "@/components/Wordmark";
import ThemeToggle from "@/components/ThemeToggle";
import LanguageToggle from "@/components/LanguageToggle";
import { ErrorText, Field, FieldLabel, FinePrint, Notice, OrRule, PanelTitle } from "@/components/ui";
import { useSession } from "@/lib/session";
import Avatar from "@/components/Avatar";
import { cn } from "@/lib/cn";
import { useT } from "@/lib/i18n";
import { RIDER_NAME_MAX } from "@/lib/names";
import type { ErrorCode, Provider, User } from "@/lib/types";

const PROVIDER_NAMES: Record<Provider, string> = { github: "GitHub", discord: "Discord" };

export default function AccountPage() {
  return (
    <Suspense>
      <AccountContent />
    </Suspense>
  );
}

function AccountContent() {
  const t = useT();
  const params = useSearchParams();
  const { user, loading } = useSession();
  const code = params.get("error");
  const returnedError = code && code in t.errors ? (code as ErrorCode) : null;
  const linked = params.get("linked");

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

      {loading ? null : user ? (
        <YourAccount
          user={user}
          error={returnedError}
          justLinked={linked === "github" || linked === "discord" ? linked : null}
        />
      ) : (
        <AccountForm startCreating={params.get("new") === "1"} returnedError={returnedError} />
      )}
    </main>
  );
}

function YourAccount({ user, error, justLinked }: { user: User; error: ErrorCode | null; justLinked: Provider | null }) {
  const t = useT();
  const { providers } = useSession();
  const shown = [...new Set([...user.linked, ...providers])];

  return (
    <div className="frame grid w-full gap-3.5 bg-window px-6 py-[22px]">
      <PanelTitle as="h2">{t.account.yours}</PanelTitle>
      <FinePrint>{t.account.signedInAs(user.displayName, user.username)}</FinePrint>
      {justLinked && <Notice>{t.account.justLinked(PROVIDER_NAMES[justLinked])}</Notice>}
      {error && <ErrorText>{t.errors[error]}</ErrorText>}

      <PhotoForm user={user} />
      <RenameForm user={user} />

      {shown.length > 0 && (
        <>
          <FieldLabel>{t.account.linkedTitle}</FieldLabel>
          {shown.map((p) =>
            user.linked.includes(p) ? (
              <p key={p} className="font-body text-sm text-green">
                ✓ {t.account.isLinked(PROVIDER_NAMES[p])}
              </p>
            ) : (
              <a key={p} className="btn btn-block" href={`/api/auth/${p}/start`}>
                {t.account.link(PROVIDER_NAMES[p])}
              </a>
            ),
          )}
          <FinePrint>{t.account.linkedHint}</FinePrint>
        </>
      )}

      <FinePrint>
        <Link href="/">{t.common.backToStables}</Link>
      </FinePrint>
    </div>
  );
}

const MAX_PHOTO_BYTES = 2 * 1024 * 1024;

function PhotoForm({ user }: { user: User }) {
  const t = useT();
  const { setPhoto } = useSession();
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<ErrorCode | null>(null);

  async function change(file: File | null) {
    setSaved(false);
    setError(null);
    // Checked again on the server; this only saves uploading a file that will be refused.
    if (file && file.size > MAX_PHOTO_BYTES) return setError("image-too-big");
    setBusy(true);
    try {
      await setPhoto(file);
      setSaved(Boolean(file));
    } catch (err) {
      setError((err instanceof Error ? err.message : "unknown") as ErrorCode);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid gap-2.5">
      <FieldLabel>{t.account.photoTitle}</FieldLabel>
      <div className="flex flex-wrap items-center gap-4">
        <Avatar name={user.displayName} url={user.avatarUrl} size={72} alt={t.account.photoAlt(user.displayName)} />
        <div className="grid gap-2">
          <label className={cn("btn", busy && "pointer-events-none opacity-60")}>
            {busy ? t.account.oneMoment : t.account.changePhoto}
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="sr-only"
              disabled={busy}
              onChange={(e) => {
                const file = e.target.files?.[0] ?? null;
                e.target.value = "";
                if (file) void change(file);
              }}
            />
          </label>
          {user.avatarUrl && (
            <button type="button" className="btn-link justify-self-start" disabled={busy} onClick={() => void change(null)}>
              {t.account.removePhoto}
            </button>
          )}
        </div>
      </div>
      <FinePrint>{t.account.photoHint}</FinePrint>
      {saved && <Notice>{t.account.photoSaved}</Notice>}
      {error && <ErrorText>{t.errors[error] ?? t.errors.unknown}</ErrorText>}
    </div>
  );
}

function RenameForm({ user }: { user: User }) {
  const t = useT();
  const { rename } = useSession();
  const [name, setName] = useState(user.displayName);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState<string | null>(null);
  const [error, setError] = useState<ErrorCode | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setSaved(null);
    setError(null);
    try {
      const updated = await rename(name);
      setSaved(updated.displayName);
      setName(updated.displayName);
    } catch (err) {
      setError((err instanceof Error ? err.message : "unknown") as ErrorCode);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="grid gap-2.5" onSubmit={submit}>
      <Field label={t.account.nameTitle}>
        <input value={name} onChange={(e) => setName(e.target.value)} maxLength={RIDER_NAME_MAX} required />
      </Field>
      <FinePrint>{t.account.nameHint}</FinePrint>
      {saved && <Notice>{t.account.nameSaved(saved)}</Notice>}
      {error && <ErrorText>{t.errors[error] ?? t.errors.unknown}</ErrorText>}
      <button className="btn" type="submit" disabled={busy || name.trim() === user.displayName}>
        {busy ? t.account.oneMoment : t.account.saveName}
      </button>
    </form>
  );
}

function AccountForm({ startCreating, returnedError }: { startCreating: boolean; returnedError: ErrorCode | null }) {
  const t = useT();
  const router = useRouter();
  const { signIn, signUp, providers } = useSession();
  const [creating, setCreating] = useState(startCreating);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [error, setError] = useState<ErrorCode | "">(returnedError ?? "");
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
    <form className="frame grid w-full gap-3.5 bg-window px-6 py-[22px]" onSubmit={submit}>
      <PanelTitle as="h2">{creating ? t.account.create : t.account.signIn}</PanelTitle>
      <FinePrint>{t.account.intro}</FinePrint>

      {error && <ErrorText>{t.errors[error]}</ErrorText>}

      {providers.map((p) => (
        <a key={p} className="btn btn-primary btn-block" href={`/api/auth/${p}/start`}>
          {t.account.continueWith(PROVIDER_NAMES[p])}
        </a>
      ))}
      {providers.length > 0 && <OrRule>{t.account.orUsername}</OrRule>}

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
            maxLength={RIDER_NAME_MAX}
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

      <button className={providers.length > 0 ? "btn btn-block" : "btn btn-primary btn-block"} type="submit" disabled={busy}>
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
  );
}
