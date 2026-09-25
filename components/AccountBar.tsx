"use client";

import Link from "next/link";
import { useSession } from "@/lib/session";
import ThemeToggle from "./ThemeToggle";
import { HostTag } from "./ui";

const navLink = "text-muted no-underline hover:text-accent";

export default function AccountBar() {
  const { user, loading, signOut } = useSession();

  if (loading) {
    return (
      <>
        <span className="text-green opacity-50">…</span>
        <ThemeToggle />
      </>
    );
  }

  if (!user) {
    return (
      <>
        <Link href="/account" className={navLink}>
          Sign in
        </Link>
        <Link href="/account?new=1" className="text-green no-underline hover:text-accent">
          Create account
        </Link>
        <ThemeToggle />
      </>
    );
  }

  return (
    <>
      <Link href="/stats" className={navLink}>
        My stats
      </Link>
      <span className="inline-flex items-center gap-2 text-strong">
        {user.displayName}
        {user.isAdmin && <HostTag>ADMIN</HostTag>}
      </span>
      <button className="btn-link" onClick={signOut}>
        SIGN OUT
      </button>
      <ThemeToggle />
    </>
  );
}
