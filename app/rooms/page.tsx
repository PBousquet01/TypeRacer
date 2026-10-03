"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import Wordmark from "@/components/Wordmark";
import ThemeToggle from "@/components/ThemeToggle";
import LanguageToggle from "@/components/LanguageToggle";
import { Choice, Eyebrow, FinePrint, Panel, PanelTitle, Table, Td, Th } from "@/components/ui";
import { getSocket } from "@/lib/socket";
import { saveProfile, useSavedProfile } from "@/lib/profile";
import { useT } from "@/lib/i18n";
import type { RoomSummary, TextKind, TextLanguage } from "@/lib/types";

type Any = "any";

export default function RoomsPage() {
  const t = useT();
  const router = useRouter();
  const saved = useSavedProfile();
  const [rooms, setRooms] = useState<RoomSummary[] | null>(null);
  const [language, setLanguage] = useState<TextLanguage | Any>("any");
  const [kind, setKind] = useState<TextKind | Any>("any");

  useEffect(() => {
    const socket = getSocket();
    const watch = () => socket.emit("watchRooms");
    socket.on("roomList", setRooms);
    socket.on("connect", watch); // and again after a dropped connection
    if (socket.connected) watch();
    return () => {
      socket.emit("unwatchRooms");
      socket.off("roomList", setRooms);
      socket.off("connect", watch);
    };
  }, []);

  function join(code: string) {
    if (saved) saveProfile({ ...saved, role: "rider" });
    router.push(`/room/${code}`);
  }

  const shown = (rooms ?? []).filter(
    (r) => (language === "any" || r.language === language) && (kind === "any" || r.kind === kind),
  );

  return (
    <main className="mx-auto max-w-[1280px] px-[18px] pt-6 pb-[60px]">
      <header className="mb-[18px] flex flex-wrap items-center justify-between gap-x-4 gap-y-3">
        <Link href="/" className="no-underline">
          <Wordmark size={16} />
        </Link>
        <span className="inline-flex items-center gap-3.5">
          <LanguageToggle />
          <ThemeToggle />
          <Link href="/" className="btn-link">
            {t.rooms.back}
          </Link>
        </span>
      </header>

      <div className="grid gap-4 wide:grid-cols-[minmax(0,1fr)_minmax(0,2.4fr)]">
        <Panel className="content-start">
          <Eyebrow>{t.home.browseRooms}</Eyebrow>
          <PanelTitle as="h1">{t.rooms.title}</PanelTitle>
          <FinePrint>{t.rooms.intro}</FinePrint>
          <Choice
            label={t.rooms.languageFilter}
            value={language}
            options={{ any: t.rooms.any, ...t.text.languages }}
            onChange={setLanguage}
          />
          <Choice
            label={t.rooms.kindFilter}
            value={kind}
            options={{ any: t.rooms.any, ...t.text.kinds }}
            onChange={setKind}
          />
        </Panel>

        <Panel className="content-start">
          {rooms === null ? null : shown.length === 0 ? (
            <div className="grid justify-items-center gap-2 py-6 text-center">
              <PanelTitle as="h2">{t.rooms.empty}</PanelTitle>
              <FinePrint>{t.rooms.emptyHint}</FinePrint>
            </div>
          ) : (
            <Table>
              <thead>
                <tr>
                  <Th>{t.rooms.room}</Th>
                  <Th>{t.rooms.host}</Th>
                  <Th num>{t.rooms.riders}</Th>
                  <Th>{t.rooms.text}</Th>
                  <Th>{t.rooms.status}</Th>
                  <Th />
                </tr>
              </thead>
              <tbody>
                {shown.map((r) => {
                  const full = r.riders >= r.capacity;
                  return (
                    <tr key={r.code}>
                      <Td className="font-display text-accent">{r.code}</Td>
                      <Td>{r.host ?? "—"}</Td>
                      <Td num>
                        {r.riders} / {r.capacity}
                      </Td>
                      <Td>{t.text.label(r)}</Td>
                      <Td>{t.rooms.statuses[r.status]}</Td>
                      <Td num>
                        <button className="btn-link" onClick={() => join(r.code)} disabled={full}>
                          {full ? t.rooms.full : t.rooms.join}
                        </button>
                      </Td>
                    </tr>
                  );
                })}
              </tbody>
            </Table>
          )}
        </Panel>
      </div>
    </main>
  );
}
