import type { Metadata, Viewport } from "next";
import type { CSSProperties, ReactNode } from "react";
import { cookies } from "next/headers";
import { loadCafeName } from "./data";
import { isPreview } from "@/app/lib/site-mode";
import { AppTabBar } from "./tab-bar";
import { ServiceWorker } from "./service-worker";
import { appFonts } from "./fonts";
import { AppEffects } from "./effects";
import { AppIntro, INTRO_COOKIE, INTRO_HOLD } from "./intro";
import { greetingFor } from "@/app/lib/greeting";

export const dynamic = "force-dynamic";

export const viewport: Viewport = {
  themeColor: "#1e140f",
  // Lets the app draw behind a phone's notch; padding uses safe-area insets.
  viewportFit: "cover",
};

export async function generateMetadata(): Promise<Metadata> {
  // Never a demo name: if the café cannot be read, titles just omit it.
  const name = await loadCafeName();
  return {
    title: name ? { default: name, template: `%s · ${name}` } : { default: "Order", template: "%s" },
    appleWebApp: { capable: true, title: name ?? undefined, statusBarStyle: "default" },
    icons: { apple: "/app-icon/180" },
    ...(isPreview ? { robots: { index: false, follow: false } } : {}),
  };
}

/**
 * The customer app: a phone-sized column with a bottom tab bar. The first
 * screen of a visit opens with the café's intro; after that, never again
 * until the browser (or installed app) is closed.
 */
export default async function AppLayout({ children }: { children: ReactNode }) {
  const seen = (await cookies()).get(INTRO_COOKIE)?.value === "1";
  const name = seen ? null : await loadCafeName();
  const intro = Boolean(name);

  return (
    <div
      className={`app-theme ${appFonts} min-h-dvh`}
      style={intro ? ({ "--app-intro-delay": INTRO_HOLD } as CSSProperties) : undefined}
    >
      {intro && name && <AppIntro name={name} greeting={greetingFor(new Date())} />}
      <div className="mx-auto min-h-dvh max-w-md pb-[calc(5.5rem+env(safe-area-inset-bottom))]">
        {children}
      </div>
      <AppTabBar />
      <ServiceWorker />
      <AppEffects />
    </div>
  );
}
