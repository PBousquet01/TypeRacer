"use client";

import { useSyncExternalStore } from "react";
import { useT } from "@/lib/i18n";

const KEY = "chocobo-theme";

function subscribe(onChange: () => void) {
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
  return () => observer.disconnect();
}

const readTheme = () => (document.documentElement.dataset.theme === "light" ? "light" : "dark");

export default function ThemeToggle() {
  const t = useT();
  const theme = useSyncExternalStore(subscribe, readTheme, () => undefined);

  function toggle() {
    const next = readTheme() === "light" ? "dark" : "light";
    document.documentElement.dataset.theme = next;
    try {
      localStorage.setItem(KEY, next);
    } catch {
    }
  }

  const isLight = theme === "light";
  return (
    <button
      className="inline-flex cursor-pointer items-center gap-2 border-2 border-edge bg-transparent px-2.5 py-[7px] font-display text-micro/[1.4] text-muted uppercase hover:border-accent hover:text-accent"
      onClick={toggle}
      aria-pressed={isLight}
      title={isLight ? t.theme.toDark : t.theme.toLight}
    >
      <span aria-hidden="true">{isLight ? "☀" : "☾"}</span>
      {theme === undefined ? t.theme.theme : isLight ? t.theme.light : t.theme.dark}
    </button>
  );
}
