import type { Metadata } from "next";
import { Fraunces, Geist, Geist_Mono } from "next/font/google";
import { loadCafeHeadline } from "./app/data";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
  display: "swap",
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
  display: "swap",
});

/** Editorial display face — warm and high-contrast, used for headlines only. */
const fraunces = Fraunces({
  variable: "--font-display",
  subsets: ["latin"],
  display: "swap",
});

/**
 * Fallback title and description for pages that don't set their own (the
 * customer app, "page not found", offline). They use the café's own name and
 * tagline, never the platform's. If the café can't be read, the title stays
 * neutral and no description is given.
 */
export async function generateMetadata(): Promise<Metadata> {
  const headline = await loadCafeHeadline();
  return headline
    ? { title: headline.name, description: headline.tagline }
    : { title: "Welcome" };
}

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} ${fraunces.variable} h-full antialiased`}
    >
      <head>
        {/* Scroll reveals start hidden and are shown by JS. Without scripting
            that would hide real content, so force the final state. */}
        <noscript>
          <style>
            {
              ".reveal{opacity:1!important;transform:none!important;filter:none!important}"
            }
          </style>
        </noscript>
      </head>
      <body className="flex min-h-full flex-col">{children}</body>
    </html>
  );
}
