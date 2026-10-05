"use client";

import { Suspense, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import Chocobo from "@/components/Chocobo";
import Wordmark from "@/components/Wordmark";
import AccountBar from "@/components/AccountBar";
import MountPicker from "@/components/MountPicker";
import { ErrorText, Eyebrow, Field, FinePrint, OrRule, Panel, PanelTitle } from "@/components/ui";
import { CHOCOBO_COLORS } from "@/lib/chocobos";
import { useSession } from "@/lib/session";
import { saveProfile, useSavedProfile } from "@/lib/profile";
import { useT } from "@/lib/i18n";
import { RIDER_NAME_MAX, cleanRiderName } from "@/lib/names";
import { ROOM_CODE_LENGTH, isRoomCode, normalizeRoomCode } from "@/lib/rules";
import type { Visibility } from "@/lib/types";

export default function Home() {
  return (
    <Suspense>
      <HomeContent />
    </Suspense>
  );
}

function HomeContent() {
  const saved = useSavedProfile();
  const { user, loading } = useSession();
  const joinCode = (useSearchParams().get("join") ?? "").toUpperCase();

  return (
    <RiderForm
      key={`${saved === undefined ? "server" : "browser"}-${loading ? "anon" : user?.id ?? "guest"}-${joinCode}`}
      initialName={user?.displayName ?? saved?.name ?? ""}
      initialColor={saved?.color ?? "yellow"}
      initialJoinCode={joinCode}
      unlocks={user?.unlocks ?? []}
      signedIn={Boolean(user)}
    />
  );
}

interface RiderFormProps {
  initialName: string;
  initialColor: string;
  initialJoinCode: string;
  unlocks: string[];
  signedIn: boolean;
}

function RiderForm({ initialName, initialColor, initialJoinCode, unlocks, signedIn }: RiderFormProps) {
  const t = useT();
  const router = useRouter();
  const [name, setName] = useState(initialName);
  const [color, setColor] = useState(initialColor);
  const [joinCode, setJoinCode] = useState(initialJoinCode);
  const [error, setError] = useState("");
  const [noQuickRoom, setNoQuickRoom] = useState(false);

  function riderNameOrError(): string | null {
    if (!name.trim()) return setError(t.home.pickName), null;
    const riderName = cleanRiderName(name);
    if (!riderName) return setError(t.errors["name-format"]), null;
    return riderName;
  }

  function joinRoom() {
    const riderName = riderNameOrError();
    if (!riderName) return;
    const code = normalizeRoomCode(joinCode);
    if (!code) return setError(t.home.enterCode);
    if (!isRoomCode(code)) return setError(t.errors["bad-code"]);
    saveProfile({ name: riderName, color, role: "rider" });
    router.push(`/room/${code}`);
  }

  async function hostRoom(visibility?: Visibility) {
    const riderName = riderNameOrError();
    if (!riderName) return;
    const res = await fetch("/api/rooms", { method: "POST", body: JSON.stringify({ visibility }) }).catch(() => null);
    if (res?.status === 401) return setError(t.errors["sign-in-to-host"]);
    const reply = res?.ok ? ((await res.json()) as { code: string }) : null;
    if (!reply) return setError(t.errors["server-error"]);
    saveProfile({ name: riderName, color, role: "host" });
    router.push(`/room/${reply.code}`);
  }

  // JOIN-03: the server picks the public room closest to starting.
  async function quickRace() {
    const riderName = riderNameOrError();
    if (!riderName) return;
    const reply = await fetch("/api/rooms/quick", { method: "POST" })
      .then((res) => (res.ok ? (res.json() as Promise<{ code: string | null }>) : null))
      .catch(() => null);
    if (!reply) return setError(t.errors["server-error"]);
    if (!reply.code) return setNoQuickRoom(true);
    saveProfile({ name: riderName, color, role: "rider" });
    router.push(`/room/${reply.code}`);
  }

  return (
    <main className="mx-auto max-w-[1280px]">
      <header className="frame mx-[18px] mt-[18px] flex flex-wrap items-center justify-between gap-x-4 gap-y-3 bg-bar px-5 py-3.5">
        <Wordmark />
        <nav className="flex flex-wrap items-center gap-x-[18px] gap-y-2 font-display text-tiny text-muted uppercase">
          <a href="#how-it-works" className="text-muted no-underline hover:text-accent">
            {t.nav.howItWorks}
          </a>
          <AccountBar />
        </nav>
      </header>

      <section className="frame relative m-[18px] flex flex-col items-center gap-6 overflow-hidden bg-sky px-6 pt-[54px] pb-11 max-wide:px-[18px] max-wide:pt-9 max-wide:pb-[30px]">
        <div className="flex flex-col items-center gap-5 text-center">
          <Image src="/logo.png" alt={t.home.logoAlt} width={140} height={140} priority />
          <Eyebrow>{t.home.eyebrow}</Eyebrow>
          <h1 className="text-[clamp(1.4rem,3.6vw,2.6rem)]/[1.35] text-strong [text-shadow:5px_5px_0_var(--ink)] light:[text-shadow:3px_3px_0_rgba(16,26,63,0.22)]">
            {t.home.titleBefore}
            <span className="text-accent">{t.home.titleAccent}</span>
            {t.home.titleAfter}
          </h1>
          <p className="max-w-[60ch] font-body text-sm/[1.8] text-copy [text-shadow:2px_2px_0_rgba(10,15,36,0.8)] light:[text-shadow:none]">
            {t.home.intro}
          </p>
          <div className="flex gap-3" aria-hidden="true">
            {CHOCOBO_COLORS.filter((c) => c.noun === "chocobo").map((c) => (
              <Chocobo key={c.id} color={c.id} size={30} running />
            ))}
          </div>
        </div>

        <Panel className="w-full max-w-[560px] px-6 py-[22px]">
          <PanelTitle as="h2">{t.home.saddleUp}</PanelTitle>

          <Field label={t.home.riderName}>
            <input value={name} onChange={(e) => setName(e.target.value)} maxLength={RIDER_NAME_MAX} placeholder="Cloud" />
          </Field>

          <MountPicker value={color} onChange={setColor} unlocks={unlocks} />

          {error && <ErrorText>{error}</ErrorText>}

          {signedIn ? (
            <>
              <button className="btn btn-primary btn-block" onClick={() => hostRoom()}>
                {t.home.hostRace}
              </button>
              <FinePrint>{t.home.hostHint}</FinePrint>
            </>
          ) : (
            <>
              <Link className="btn btn-primary btn-block" href="/account">
                {t.home.signInToHost}
              </Link>
              <FinePrint>{t.home.hostHintGuest}</FinePrint>
            </>
          )}

          <OrRule>{t.home.orJoin}</OrRule>

          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              joinRoom();
            }}
          >
            <input
              className="tracking-[0.18em] uppercase"
              value={joinCode}
              onChange={(e) => setJoinCode(normalizeRoomCode(e.target.value).slice(0, ROOM_CODE_LENGTH))}
              placeholder={t.home.roomCode}
              aria-label={t.home.roomCodeLabel}
            />
            <button className="btn" type="submit">
              {t.home.join}
            </button>
          </form>
          <FinePrint>{t.home.joinHint}</FinePrint>

          <button className="btn btn-block" onClick={quickRace}>
            {t.home.quickRace}
          </button>
          {noQuickRoom ? (
            <>
              <FinePrint>{signedIn ? t.home.noQuickRoom : t.home.noQuickRoomGuest}</FinePrint>
              {signedIn && (
                <button className="btn btn-block" onClick={() => hostRoom("public")}>
                  {t.home.openPublic}
                </button>
              )}
            </>
          ) : (
            <FinePrint>{t.home.quickHint}</FinePrint>
          )}
          <Link className="btn-link justify-self-center" href="/rooms">
            {t.home.browseRooms}
          </Link>

          <OrRule>{t.home.onYourOwn}</OrRule>
          <Link className="btn btn-block" href="/practice">
            {t.home.practice}
          </Link>
          <FinePrint>{t.home.practiceHint}</FinePrint>
        </Panel>
      </section>

      <section className="grid grid-cols-1 gap-4 px-[18px] wide:grid-cols-3" id="how-it-works">
        {t.home.features.map(([title, body]) => (
          <article key={title} className="frame bg-window px-5 py-[18px]">
            <h3 className="mb-3 text-label/normal text-accent uppercase">{title}</h3>
            <p className="font-body text-[13px]/[1.7] text-copy">{body}</p>
          </article>
        ))}
      </section>
    </main>
  );
}
