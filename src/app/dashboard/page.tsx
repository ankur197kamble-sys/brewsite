import type { Metadata } from "next";
import Link from "next/link";
import { getCafe } from "@/app/db/cafe";
import { getGallery } from "@/app/db/gallery";
import { getMenu } from "@/app/db/menu";
import { getOffers } from "@/app/db/offers";
import { countOrdersSince } from "@/app/db/orders";
import { normalizeStringList } from "@/app/lib/json";
import { offerStatus, today } from "@/app/lib/offers";
import { requireCafeSession } from "@/app/lib/session";
import { getSiteCafe } from "@/app/lib/site-cafe";
import { cafe as fallbackCafe } from "@/app/data/cafe";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Overview · BrewSite Dashboard",
};

export default async function Dashboard() {
  const { cafeId } = await requireCafeSession();
  // Midnight in the café's time zone, so "today" matches the café's own day.
  const startOfDay = new Date(`${today()}T00:00:00+05:30`);
  const [dbCafe, categories, gallery, offers, ordersToday] = await Promise.all([
    getCafe(cafeId),
    getMenu(cafeId),
    getGallery(cafeId),
    getOffers(cafeId),
    countOrdersSince(cafeId, startOfDay),
  ]);

  const siteCafe = getSiteCafe(dbCafe, fallbackCafe);
  const items = categories.flatMap((category) => category.items);
  const publishedCount = items.filter((item) => item.isPublished).length;
  const visibleImages = gallery.filter((image) => image.isPublished).length;
  // The raw legacy column, without the demo fallback getSiteCafe mixes in.
  const legacyImages = normalizeStringList(dbCafe?.galleryImages, []).length;
  const liveOffers = offers.filter(
    (offer) => offerStatus(offer) === "live",
  ).length;

  const stats: { label: string; value: string; href?: string }[] = [
    { label: "Orders today", value: String(ordersToday), href: "/dashboard/orders" },
    { label: "Website", value: "Live" },
    { label: "Menu categories", value: String(categories.length) },
    {
      label: "Menu items",
      value:
        items.length === 0
          ? "Demo menu"
          : `${publishedCount} of ${items.length} visible`,
    },
    {
      // Mirrors the public fallback chain: published gallery photos, then the
      // café's older photo list, then the demo photos.
      label: "Gallery images",
      value:
        visibleImages > 0
          ? `${visibleImages} of ${gallery.length} visible`
          : legacyImages > 0
            ? `${legacyImages} older photo${legacyImages === 1 ? "" : "s"}`
            : "Demo gallery",
    },
    {
      label: "Offers",
      value:
        offers.length === 0
          ? "None yet"
          : `${liveOffers} of ${offers.length} live`,
    },
  ];

  return (
    <>
      <p className="text-sm tracking-[0.25em] text-black/50 uppercase">
        Overview
      </p>

      <h1 className="mt-3 text-4xl font-semibold tracking-tight md:text-5xl">
        {siteCafe.name}
      </h1>

      <p className="mt-3 max-w-xl text-black/60">
        Manage your café website, menu and customer information from one place.
      </p>

      <div className="mt-10 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {stats.map((stat) => {
          const content = (
            <>
              <p className="text-sm text-black/55">{stat.label}</p>
              <p className="mt-2 text-2xl font-semibold">{stat.value}</p>
            </>
          );
          return stat.href ? (
            <Link
              key={stat.label}
              href={stat.href}
              className="rounded-2xl border border-black/10 bg-white/50 p-6 transition hover:border-black/25 hover:bg-white/80"
            >
              {content}
            </Link>
          ) : (
            <div key={stat.label} className="rounded-2xl border border-black/10 bg-white/50 p-6">
              {content}
            </div>
          );
        })}
      </div>

      <div className="mt-10 flex flex-wrap gap-3">
        <Link
          href="/dashboard/menu"
          className="rounded-full bg-[#1f1a17] px-5 py-2.5 text-sm font-medium text-white transition hover:opacity-80"
        >
          Manage menu
        </Link>

        <Link
          href="/dashboard/cafe"
          className="rounded-full border border-black/15 px-5 py-2.5 text-sm font-medium transition hover:bg-black/5"
        >
          Edit café information
        </Link>
      </div>
    </>
  );
}
