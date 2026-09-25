import type { ReactNode } from "react";
import Link from "next/link";
import Wordmark from "./Wordmark";
import ThemeToggle from "./ThemeToggle";

export default function RoomBar({ phase, children }: { phase: string; children?: ReactNode }) {
  return (
    <header className="frame flex flex-wrap items-center justify-between gap-x-4 gap-y-3 bg-bar px-5 py-3.5">
      <div className="flex items-center gap-4 font-display text-tiny uppercase">
        <Wordmark size={16} />
        <span className="text-muted max-wide:hidden">{phase}</span>
      </div>
      <div className="flex flex-wrap items-center gap-4 font-display text-tiny uppercase">
        {children}
        <ThemeToggle />
        <Link href="/" className="btn-link">
          LEAVE
        </Link>
      </div>
    </header>
  );
}
