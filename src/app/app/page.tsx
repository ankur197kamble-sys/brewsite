import type { CSSProperties } from "react";
import Image from "next/image";
import { cookies } from "next/headers";
import Link from "next/link";
import { formatOfferDate } from "@/app/lib/offers";
import { STAMPS_PER_REWARD } from "@/app/lib/orders";
import { telHref, whatsappHref } from "@/app/lib/site-cafe";
import { loadAppData } from "./data";
import { InstallPrompt, OrderStart } from "./home-widgets";
import { scriptFont } from "./script-font";
import { GreetingCard } from "./greeting-card";
import { greetingFor } from "@/app/lib/greeting";
import { AppUnavailable } from "./unavailable";
import { AppIntro } from "./intro";
import { INTRO_COOKIE, INTRO_HOLD, LAUNCH_PARAM } from "./intro-settings";

type Action = { href: string; label: string; external: boolean };

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

/**
 * App home: the café at a glance, ordering, offers, stamps and quick actions.
 * Opens with the intro when launched from the home-screen icon, or in a
 * browser when it has not played in the last INTRO_REST_SECONDS.
 */
export default async function AppHome({ searchParams }: Props) {
  const data = await loadAppData();
  if (!data) return <AppUnavailable />;
  const { cafe, menu, offers } = data;

  const launched = (await searchParams)[LAUNCH_PARAM] !== undefined;
  const seenRecently = (await cookies()).get(INTRO_COOKIE)?.value === "1";
  const intro = launched || !seenRecently;
  const greeting = greetingFor(new Date());

  const actions = [
    cafe.phone ? { href: telHref(cafe.phone), label: "Call", external: false } : null,
    cafe.whatsapp ? { href: whatsappHref(cafe.whatsapp), label: "WhatsApp", external: true } : null,
    cafe.mapsUrl ? { href: cafe.mapsUrl, label: "Directions", external: true } : null,
    cafe.instagram ? { href: cafe.instagram, label: "Instagram", external: true } : null,
  ].filter((action): action is Action => action !== null);

  return (
    <main
      data-intro={intro ? "" : undefined}
      style={intro ? ({ "--app-intro-delay": INTRO_HOLD } as CSSProperties) : undefined}
    >
      {intro && <AppIntro name={cafe.name} greeting={greeting} />}
      <header className={`${scriptFont} relative isolate flex min-h-[19rem] flex-col justify-end overflow-hidden px-[var(--app-pad)] pt-[calc(env(safe-area-inset-top)+2.5rem)] pb-7 text-[#fffaf3]`}>
        <Image
          src={cafe.heroImage}
          alt=""
          fill
          preload
          quality={90}
          sizes="(max-width: 448px) 100vw, 448px"
          className="-z-20 object-cover"
        />
        <div
          aria-hidden="true"
          className="app-hero-shade absolute inset-0 -z-10"
        />
        {cafe.highlights && (
          <p className="app-hero-in text-[0.7rem] font-semibold tracking-[0.18em] text-[#f3e3d0] uppercase [text-shadow:0_1px_10px_rgba(0,0,0,0.55)]">
            {cafe.highlights}
          </p>
        )}
        <h1 className="app-script app-hero-in mt-2 text-[3.4rem]">{cafe.name}</h1>
        <p className="app-hero-in mt-2 text-[1.05rem] text-[#f3e3d0] [text-shadow:0_1px_10px_rgba(0,0,0,0.55)]">{cafe.tagline}</p>
      </header>

      <div className="app-stagger relative z-10 -mt-5 space-y-5 px-[var(--app-pad)] pb-6">
        <GreetingCard greeting={greeting} />

        {/* Server-rendered wrappers: the entry animation runs on them, so a
            card that only appears after loading (a live order, the install
            prompt) does not start its own late animation. */}
        <div>
          <OrderStart hasMenu={menu.length > 0} />
        </div>

        {offers.length > 0 && (
          <section aria-labelledby="offers-heading">
            <h2 id="offers-heading" className="app-label mb-3">
              Today&apos;s offers
            </h2>
            <ul className="-mx-[var(--app-pad)] flex snap-x snap-mandatory gap-3 overflow-x-auto px-[var(--app-pad)] pb-1">
              {offers.map((offer) => (
                <li key={offer.id} className="app-card w-[82%] shrink-0 snap-start p-5">
                  {offer.value && <p className="app-accent-ink text-sm font-bold">{offer.value}</p>}
                  <p className="app-heading mt-1">{offer.title}</p>
                  {offer.description && <p className="app-muted mt-2 text-sm leading-6">{offer.description}</p>}
                  {offer.endDate && <p className="app-muted mt-3 text-xs">Until {formatOfferDate(offer.endDate)}</p>}
                </li>
              ))}
            </ul>
          </section>
        )}

        <Link
          href="/app/stamps"
          className="app-card-dark flex items-center gap-4 p-5 transition-transform active:scale-[0.99]"
        >
          <span
            aria-hidden="true"
            className="app-display flex h-14 w-14 shrink-0 items-center justify-center rounded-full border border-[var(--app-deep-label)] text-2xl text-[var(--app-deep-label)]"
          >
            {STAMPS_PER_REWARD}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-[0.7rem] font-semibold tracking-[0.18em] text-[var(--app-deep-label)] uppercase">
              Loyalty card
            </span>
            <span className="app-heading mt-1 block text-[1.25rem]">
              Collect {STAMPS_PER_REWARD} stamps, get a treat on us
            </span>
            <span className="mt-1 block text-sm text-[var(--app-deep-muted)]">One stamp for every order you collect.</span>
          </span>
          <span aria-hidden="true" className="app-go text-xl">
            ›
          </span>
        </Link>

        {(actions.length > 0 || cafe.address.length > 0) && (
          <section aria-labelledby="visit-heading" className="app-card p-5">
            <h2 id="visit-heading" className="app-label">
              Visit us
            </h2>
            {cafe.address.length > 0 && (
              <address className="mt-2 not-italic leading-7">{cafe.address.join(", ")}</address>
            )}
            {cafe.hours.length > 0 && (
              <ul className="app-muted mt-3 space-y-0.5 text-sm">
                {cafe.hours.map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
            )}
            {actions.length > 0 && (
              <div className="mt-4 grid grid-cols-2 gap-2.5">
                {actions.map((action) => (
                  <a
                    key={action.label}
                    href={action.href}
                    {...(action.external ? { target: "_blank", rel: "noreferrer" } : {})}
                    className="app-btn app-btn-secondary"
                  >
                    {action.label}
                  </a>
                ))}
              </div>
            )}
          </section>
        )}

        <div>
          <InstallPrompt name={cafe.name} />
        </div>
      </div>
    </main>
  );
}
