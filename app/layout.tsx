import type { Metadata } from "next";
import type { ReactNode } from "react";
import Script from "next/script";
import { Press_Start_2P, IBM_Plex_Mono } from "next/font/google";
import "./globals.css";
import { SessionProvider } from "@/lib/session";
import { LanguageProvider } from "@/lib/i18n";
import { DICTIONARIES } from "@/lib/i18n/dictionaries";
import { requestLang } from "@/lib/i18n/server";

const display = Press_Start_2P({ variable: "--font-press-start", subsets: ["latin"], weight: "400" });
const body = IBM_Plex_Mono({ variable: "--font-plex", subsets: ["latin"], weight: ["400", "500"] });

export async function generateMetadata(): Promise<Metadata> {
  return DICTIONARIES[await requestLang()].meta;
}

// Runs before the first paint: picks the saved theme, or follows the
// system setting the first time someone visits.
const themeScript = `(function(){try{var t=localStorage.getItem("chocobo-theme");
if(!t)t=window.matchMedia("(prefers-color-scheme: light)").matches?"light":"dark";
document.documentElement.dataset.theme=t;}catch(e){}})();`;

export default async function RootLayout({ children }: { children: ReactNode }) {
  const lang = await requestLang();
  return (
    // suppressHydrationWarning: the script below sets data-theme before React
    // hydrates, so this one attribute legitimately differs from the server HTML.
    <html
      lang={lang}
      className={`${display.variable} ${body.variable}`}
      suppressHydrationWarning
    >
      <body>
        <Script id="theme" strategy="beforeInteractive">
          {themeScript}
        </Script>
        <LanguageProvider initial={lang}>
          <SessionProvider>{children}</SessionProvider>
        </LanguageProvider>
      </body>
    </html>
  );
}
