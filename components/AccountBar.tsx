"use client";

import Link from "next/link";
import { useSession } from "@/lib/session";
import { useT } from "@/lib/i18n";
import ThemeToggle from "./ThemeToggle";
import LanguageToggle from "./LanguageToggle";
import { HostTag } from "./ui";

const navLink = "text-muted no-underline hover:text-accent";

export default function AccountBar() {
  const t = useT();
  const { user, loading, signOut } = useSession();

  const toggles = (
    <>
      <LanguageToggle />
      <ThemeToggle />
    </>
  );

  if (loading) {
    return (
      <>
        <span className="text-green opacity-50">…</span>
        {toggles}
      </>
    );
  }

  if (!user) {
    return (
      <>
        <Link href="/account" className={navLink}>
          {t.nav.signIn}
        </Link>
        <Link href="/account?new=1" className="text-green no-underline hover:text-accent">
          {t.nav.createAccount}
        </Link>
        {toggles}
      </>
    );
  }

  return (
    <>
      <Link href="/stats" className={navLink}>
        {t.nav.myStats}
      </Link>
      <span className="inline-flex items-center gap-2 text-strong">
        {user.displayName}
        {user.isAdmin && <HostTag>{t.common.admin}</HostTag>}
      </span>
      <button className="btn-link" onClick={signOut}>
        {t.nav.signOut}
      </button>
      {toggles}
    </>
  );
}
