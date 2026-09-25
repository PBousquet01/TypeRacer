"use client";

import { Suspense, useState } from "react";
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
import type { Role } from "@/lib/types";

function makeRoomCode() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  return Array.from({ length: 5 }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
}

const FEATURES = [
  ["A whole class, one prompt", "Up to forty riders get the same paragraph. No excuses available."],
  ["Accuracy is the brake", "A wrong letter stalls your bird until you backspace over it. She's stubborn."],
  ["A host runs the show", "One person opens the room, starts the race and watches. Everyone else rides."],
];

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
    />
  );
}

interface RiderFormProps {
  initialName: string;
  initialColor: string;
  initialJoinCode: string;
  unlocks: string[];
}

function RiderForm({ initialName, initialColor, initialJoinCode, unlocks }: RiderFormProps) {
  const router = useRouter();
  const [name, setName] = useState(initialName);
  const [color, setColor] = useState(initialColor);
  const [joinCode, setJoinCode] = useState(initialJoinCode);
  const [error, setError] = useState("");

  function goToRoom(code: string, role: Role) {
    const trimmed = name.trim();
    if (!trimmed) return setError("Pick a name first.");
    if (!code) return setError("Enter a room code to join.");
    saveProfile({ name: trimmed, color, role });
    router.push(`/room/${code}`);
  }

  return (
    <main className="mx-auto max-w-[1280px]">
      <header className="frame mx-[18px] mt-[18px] flex items-center justify-between gap-4 bg-bar px-5 py-3.5">
        <Wordmark />
        <nav className="flex items-center gap-[18px] font-display text-tiny text-muted uppercase">
          <a href="#how-it-works" className="text-muted no-underline hover:text-accent">
            How it works
          </a>
          <AccountBar />
        </nav>
      </header>

      <section className="frame relative m-[18px] flex flex-col items-center gap-6 overflow-hidden bg-sky px-6 pt-[54px] pb-11 max-wide:px-[18px] max-wide:pt-9 max-wide:pb-[30px]">
        <div className="flex flex-col items-center gap-5 text-center">
          <Eyebrow>TYPE FAST · RIDE FASTER</Eyebrow>
          <h1 className="text-[clamp(1.4rem,3.6vw,2.6rem)]/[1.35] text-strong [text-shadow:5px_5px_0_var(--ink)] light:[text-shadow:3px_3px_0_rgba(16,26,63,0.22)]">
            Your bird runs <span className="text-accent">exactly</span> as fast as you type.
          </h1>
          <p className="max-w-[60ch] font-body text-sm/[1.8] text-copy [text-shadow:2px_2px_0_rgba(10,15,36,0.8)] light:[text-shadow:none]">
            No stats to grind, no gear to farm. Up to forty riders, one paragraph, whoever&apos;s
            fingers hold up. Typos make her stumble, so maybe slow down. Or don&apos;t.
          </p>
          <div className="flex gap-3" aria-hidden="true">
            {CHOCOBO_COLORS.filter((c) => c.noun === "chocobo").map((c) => (
              <Chocobo key={c.id} color={c.id} size={30} running />
            ))}
          </div>
        </div>

        <Panel className="w-full max-w-[560px] px-6 py-[22px]">
          <PanelTitle as="h2">Saddle up</PanelTitle>

          <Field label="Rider name">
            <input value={name} onChange={(e) => setName(e.target.value)} maxLength={16} placeholder="Cloud" />
          </Field>

          <MountPicker value={color} onChange={setColor} unlocks={unlocks} />

          {error && <ErrorText>{error}</ErrorText>}

          <button className="btn btn-primary btn-block" onClick={() => goToRoom(makeRoomCode(), "host")}>
            Host a race
          </button>
          <FinePrint>
            You open the room and start the race, then watch from the stands — hosts don&apos;t type.
          </FinePrint>

          <OrRule>or join as a rider</OrRule>

          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              goToRoom(joinCode.trim(), "rider");
            }}
          >
            <input
              className="tracking-[0.18em] uppercase"
              value={joinCode}
              onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
              placeholder="ROOM CODE"
              maxLength={8}
              aria-label="Room code"
            />
            <button className="btn" type="submit">
              Join
            </button>
          </form>
          <FinePrint>Riders need the host&apos;s room code or invite link.</FinePrint>

          <OrRule>on your own</OrRule>
          <Link className="btn btn-block" href="/practice">
            Practice alone
          </Link>
          <FinePrint>Just you and a passage. Practice runs aren&apos;t recorded.</FinePrint>
        </Panel>
      </section>

      <section className="grid grid-cols-1 gap-4 px-[18px] wide:grid-cols-3" id="how-it-works">
        {FEATURES.map(([title, body]) => (
          <article key={title} className="frame bg-window px-5 py-[18px]">
            <h3 className="mb-3 text-label/normal text-accent uppercase">{title}</h3>
            <p className="font-body text-[13px]/[1.7] text-copy">{body}</p>
          </article>
        ))}
      </section>
    </main>
  );
}
