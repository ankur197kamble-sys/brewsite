import { db } from "@/app/db";
import { cafes } from "@/app/db/schema";
import { eq } from "drizzle-orm";
import { cafe } from "./data/cafe";
import { getSiteCafe, type DbCafe } from "./lib/site-cafe";

// Café info is edited via the dashboard, so this page must re-read the
// database on every request instead of being baked into the static build.
export const dynamic = "force-dynamic";

export default async function Home() {
  let dbCafe: DbCafe | undefined;

  try {
    const rows = await db.select().from(cafes).where(eq(cafes.id, 1)).limit(1);
    dbCafe = rows[0];
  } catch (error) {
    console.error("Failed to load café from database:", error);
  }

  const siteCafe = getSiteCafe(dbCafe, cafe);

  return (
     <main className="min-h-screen bg-[#f4efe7] text-[#1f1a17]">
      <section className="relative min-h-screen overflow-hidden">
        <img
          src={siteCafe.heroImage}
          alt={`${siteCafe.name} café`}
          className="absolute inset-0 h-full w-full object-cover"
        />

        <div className="absolute inset-0 bg-black/45" />

        <div className="relative z-10 flex min-h-screen flex-col justify-between p-6 text-white md:p-10">
          <div className="flex items-center justify-between">
            <p className="text-sm uppercase tracking-[0.25em]">
              {siteCafe.name}
            </p>

            <a
              href="#menu"
              className="rounded-full border border-white/50 px-5 py-2 text-sm transition hover:bg-white hover:text-black"
            >
              View Menu
            </a>
          </div>

          <div className="max-w-4xl pb-10">
            <p className="mb-5 text-sm uppercase tracking-[0.3em] text-white/75">
              Specialty Coffee · Since {siteCafe.foundedYear}
            </p>

            <h1 className="text-6xl font-semibold tracking-tight md:text-8xl">
              {siteCafe.tagline}
            </h1>
          </div>
        </div>
      </section>
        <section className="mx-auto max-w-6xl px-6 py-24 md:px-10 md:py-32">
    <div className="grid gap-10 md:grid-cols-2 md:items-end">
      <div>
        <p className="mb-4 text-sm uppercase tracking-[0.25em] text-black/50">
          Our Story
        </p>

        <h2 className="text-4xl font-medium tracking-tight md:text-6xl">
          {siteCafe.story}
        </h2>
      </div>

      <p className="max-w-lg text-lg leading-8 text-black/65">
        {siteCafe.storySecondary}
      </p>
    </div>
  </section>
      <section className="grid grid-cols-1 md:grid-cols-3">
        {siteCafe.galleryImages.map((image, index) => (
          <div key={image} className="h-[420px] overflow-hidden">
            <img
              src={image}
              alt={`${siteCafe.name} gallery image ${index + 1}`}
              className="h-full w-full object-cover transition duration-700 hover:scale-105"
            />
          </div>
        ))}
      </section>
            <section
        id="menu"
        className="mx-auto max-w-6xl px-6 py-24 md:px-10 md:py-32"
      >
        <div className="mb-14">
          <p className="mb-4 text-sm uppercase tracking-[0.25em] text-black/50">
            The Menu
          </p>

          <h2 className="text-4xl font-medium tracking-tight md:text-6xl">
            Made slowly. Served warmly.
          </h2>
        </div>

        <div className="divide-y divide-black/10">
          {siteCafe.menuItems.map((item) => (
            <div
              key={item.name}
              className="grid gap-3 py-7 md:grid-cols-[1fr_auto] md:items-center"
            >
              <div>
                <h3 className="text-xl font-medium">{item.name}</h3>
                <p className="mt-2 text-black/55">{item.description}</p>
              </div>

              <p className="text-lg font-medium">{item.price}</p>
            </div>
          ))}
        </div>
      </section>
            <section className="mx-auto max-w-6xl px-6 py-24 md:px-10 md:py-32">
        <div className="grid gap-12 md:grid-cols-2">
          <div>
            <p className="mb-4 text-sm uppercase tracking-[0.25em] text-black/50">
              Visit Us
            </p>

            <h2 className="text-4xl font-medium tracking-tight md:text-6xl">
              Come by for a cup.
            </h2>
          </div>

          <div className="space-y-10">
            <div>
              <h3 className="mb-3 text-sm uppercase tracking-[0.2em] text-black/50">
                Location
              </h3>

              <p className="text-lg leading-8">
                {siteCafe.address.map((line) => (
                  <span key={line} className="block">
                    {line}
                  </span>
                ))}
              </p>
              <a
  href={siteCafe.mapsUrl}
  target="_blank"
  rel="noreferrer"
  className="mt-5 inline-flex rounded-full border border-black/20 px-6 py-3 text-sm font-medium transition hover:bg-black hover:text-white"
>
  Get Directions
</a>
            </div>

            <div>
              <h3 className="mb-3 text-sm uppercase tracking-[0.2em] text-black/50">
                Opening Hours
              </h3>

              <div className="text-lg leading-8">
                {siteCafe.hours.map((hour) => (
                  <p key={hour}>{hour}</p>
                ))}
              </div>
             <a
  href={`https://wa.me/${siteCafe.whatsapp}`}
  target="_blank"
  rel="noreferrer"
  className="inline-flex rounded-full bg-[#1f1a17] px-6 py-3 text-sm font-medium text-white transition hover:opacity-80"
>
  Chat on WhatsApp
</a> 
            </div>
          </div>
        </div>
      </section>
            <footer className="border-t border-black/10 px-6 py-12 md:px-10">
        <div className="mx-auto flex max-w-6xl flex-col gap-8 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="text-xl font-medium">{siteCafe.name}</p>
            <p className="mt-2 text-black/50">{siteCafe.tagline}</p>
          </div>

          <div className="flex flex-wrap gap-3">
            <a
              href={`https://wa.me/${siteCafe.whatsapp}`}
              target="_blank"
              rel="noreferrer"
              className="rounded-full bg-[#1f1a17] px-5 py-2.5 text-sm font-medium text-white transition hover:opacity-80"
            >
              WhatsApp
            </a>

            <a
              href={siteCafe.mapsUrl}
              target="_blank"
              rel="noreferrer"
              className="rounded-full border border-black/20 px-5 py-2.5 text-sm font-medium transition hover:bg-black hover:text-white"
            >
              Directions
            </a>
               <a
              href={siteCafe.instagram}
              target="_blank"
              rel="noreferrer"
              className="rounded-full border border-black/20 px-5 py-2.5 text-sm font-medium transition hover:bg-black hover:text-white"
            >
              Instagram
            </a>
          </div>
        </div>

        <div className="mx-auto mt-10 max-w-6xl text-sm text-black/40">
          © {new Date().getFullYear()} {siteCafe.name}. All rights reserved.
        </div>
      </footer>
    </main>   
      );
}
