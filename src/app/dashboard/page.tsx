import Link from "next/link";
import { getCafe } from "@/app/db/cafe";
import { getMenu } from "@/app/db/menu";
import { requireCafeSession } from "@/app/lib/session";
import { getSiteCafe } from "@/app/lib/site-cafe";
import { cafe as fallbackCafe } from "@/app/data/cafe";

export const dynamic = "force-dynamic";

export default async function Dashboard() {
  const { cafeId } = await requireCafeSession();
  const [dbCafe, categories] = await Promise.all([
    getCafe(cafeId),
    getMenu(cafeId),
  ]);

  const siteCafe = getSiteCafe(dbCafe, fallbackCafe);
  const items = categories.flatMap((category) => category.items);
  const publishedCount = items.filter((item) => item.isPublished).length;

  const stats = [
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
      label: "Gallery images",
      value: String(siteCafe.galleryImages.length),
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

      <div className="mt-10 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {stats.map((stat) => (
          <div
            key={stat.label}
            className="rounded-2xl border border-black/10 bg-white/50 p-6"
          >
            <p className="text-sm text-black/50">{stat.label}</p>
            <p className="mt-2 text-2xl font-semibold">{stat.value}</p>
          </div>
        ))}
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
