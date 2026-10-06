"use client";

import Link from "next/link";
import { FinePrint, Panel, PanelTitle } from "./ui";
import { useT } from "@/lib/i18n";
import type { ErrorCode } from "@/lib/types";

interface RoomConflictProps {
  code: string;
  reason: Extract<ErrorCode, "in-other-room" | "opened-elsewhere" | "moved-room">;
  otherRoom: string | null;
  onRetry: (leaveOther: boolean) => void;
}

export default function RoomConflict({ code, reason, otherRoom, onRetry }: RoomConflictProps) {
  const t = useT();
  return (
    <main className="mx-auto max-w-[560px] px-[18px] pt-6 pb-[60px]">
      <Panel className="w-full px-6 py-[22px]">
        <PanelTitle as="h2">{t.conflict.title(code)}</PanelTitle>
        {reason === "in-other-room" && otherRoom ? (
          <>
            <p className="m-0 font-body text-sm text-copy">{t.conflict.inOther(otherRoom)}</p>
            <button className="btn btn-primary btn-block" onClick={() => onRetry(true)}>
              {t.conflict.leaveAndJoin(otherRoom)}
            </button>
            <Link className="btn btn-block" href={`/room/${otherRoom}`}>
              {t.conflict.backTo(otherRoom)}
            </Link>
            <FinePrint>{t.conflict.oneRoom}</FinePrint>
          </>
        ) : (
          <>
            <p className="m-0 font-body text-sm text-copy">{t.errors[reason]}</p>
            <button className="btn btn-primary btn-block" onClick={() => onRetry(false)}>
              {reason === "opened-elsewhere" ? t.conflict.useThisTab : t.conflict.comeBack}
            </button>
            <Link className="btn btn-block" href="/">
              {t.conflict.home}
            </Link>
          </>
        )}
      </Panel>
    </main>
  );
}
