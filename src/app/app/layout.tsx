import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { loadCafeName } from "./data";
import { isPreview } from "@/app/lib/site-mode";
import { AppTabBar } from "./tab-bar";
import { ServiceWorker } from "./service-worker";
import { appFonts } from "./fonts";
import { AppEffects } from "./effects";

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
    icons: { apple: "/app-icon/180?v=2" },
    ...(isPreview ? { robots: { index: false, follow: false } } : {}),
  };
}

/**
 * The customer app: a phone-sized column with a bottom tab bar. The opening
 * intro lives on the home screen (see app/page.tsx), which can tell a launch
 * from the home-screen icon apart from an ordinary visit.
 */
export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <div className={`app-theme ${appFonts} min-h-dvh`}>
      <div className="mx-auto min-h-dvh max-w-md pb-[calc(5.5rem+env(safe-area-inset-bottom))]">
        {children}
      </div>
      <AppTabBar />
      <ServiceWorker />
      <AppEffects />
    </div>
  );
}
