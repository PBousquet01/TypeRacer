"use client";

import { useI18n } from "@/lib/i18n";

export default function LanguageToggle() {
  const { lang, t, setLang } = useI18n();
  return (
    <button
      className="inline-flex cursor-pointer items-center border-2 border-edge bg-transparent px-2.5 py-[7px] font-display text-micro/[1.4] text-muted uppercase hover:border-accent hover:text-accent"
      onClick={() => setLang(lang === "en" ? "fr" : "en")}
      title={t.langToggle.title}
      lang={lang === "en" ? "fr" : "en"}
    >
      {t.langToggle.label}
    </button>
  );
}
