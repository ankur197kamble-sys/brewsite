import type { CSSProperties } from "react";
import Image from "next/image";
import { Parallax } from "@/app/components/parallax";
import { Reveal } from "@/app/components/reveal";
import { SectionIntro } from "@/app/components/section-intro";
import { SiteMark } from "@/app/components/site-mark";
import { cafe } from "@/app/data/cafe";
import { getCafe } from "@/app/db/cafe";
import { getPublishedGallery } from "@/app/db/gallery";
import { getMenu } from "@/app/db/menu";
import { getPublishedOffers } from "@/app/db/offers";
import { toPublicGallery, type GalleryImageView } from "@/app/lib/gallery";
import { toPublicMenu, type MenuCategoryView } from "@/app/lib/menu";
import {
  formatOfferDate,
  toPublicOffers,
  type OfferView,
} from "@/app/lib/offers";
import { getSiteCafe, type DbCafe } from "@/app/lib/site-cafe";
import { getPublicCafeId } from "@/app/lib/tenant";

export const dynamic = "force-dynamic";

/** Staggers the hero entrance without a per-element CSS class. */
const enterAfter = (ms: number) =>
  ({ "--enter-delay": `${ms}ms` }) as CSSProperties;

/** Editorial rhythm for the three gallery tiles. */
const galleryTiles = [
  {
    wrap: "col-span-2 lg:col-span-6",
    frame: "h-[26rem] sm:h-[34rem] lg:h-[38rem]",
    sizes: "(max-width: 1024px) 100vw, 50vw",
  },
  {
    wrap: "lg:col-span-3 lg:mt-24",
    frame: "h-[17rem] sm:h-[24rem] lg:h-[30rem]",
    sizes: "(max-width: 1024px) 50vw, 25vw",
  },
  {
    wrap: "lg:col-span-3 lg:mt-10",
    frame: "h-[17rem] sm:h-[24rem] lg:h-[34rem]",
    sizes: "(max-width: 1024px) 50vw, 25vw",
  },
];

export default async function Home() {
  const cafeId = getPublicCafeId();
  let dbCafe: DbCafe | undefined;
  let menuCategories: MenuCategoryView[] = [];
  let galleryRows: GalleryImageView[] = [];
  let offerRows: OfferView[] = [];

  try {
    [dbCafe, menuCategories, galleryRows, offerRows] = await Promise.all([
      getCafe(cafeId),
      getMenu(cafeId),
      getPublishedGallery(cafeId),
      getPublishedOffers(cafeId),
    ]);
  } catch (error) {
    console.error("Failed to load café from database:", error);
  }

  const siteCafe = getSiteCafe(dbCafe, cafe);
  const menu = toPublicMenu(menuCategories, siteCafe.menuItems);
  // Managed gallery first, then the café's legacy image list, which itself
  // falls back to the static demo photos — so this band is never empty.
  const gallery = toPublicGallery(
    galleryRows,
    siteCafe.galleryImages,
    siteCafe.name,
  );
  // Only offers that are published and inside their date window. The section
  // is omitted entirely when empty rather than rendering a hollow band.
  const offers = toPublicOffers(offerRows);

  return (
    <main className="overflow-hidden bg-[#f3eee5] text-[#201a16]">
      {/* ------------------------------------------------------------ hero */}
      <section className="relative isolate flex min-h-[100svh] flex-col justify-between overflow-hidden text-[#fffaf3]">
        <Parallax
          speed={0.12}
          className="absolute inset-x-0 -top-[8%] -z-20 h-[116%]"
        >
          <div className="hero-media relative h-full w-full">
            <Image
              src={siteCafe.heroImage}
              alt={`Inside ${siteCafe.name}`}
              className="object-cover"
              fill
              priority
              sizes="100vw"
            />
          </div>
        </Parallax>

        <div
          aria-hidden="true"
          className="absolute inset-0 -z-10 bg-[linear-gradient(180deg,rgba(20,14,10,.42),rgba(20,14,10,.16)_32%,rgba(20,14,10,.86))]"
        />
        <div aria-hidden="true" className="grain -z-10" />

        <header className="shell flex items-center justify-between pt-7 lg:pt-10">
          <SiteMark name={siteCafe.name} className="hero-enter" />
          <a
            href="#menu"
            className="button-secondary hero-enter border-white/55 text-white hover:border-white"
            style={enterAfter(80)}
          >
            Menu
          </a>
        </header>

        <div className="shell pb-14 lg:pb-20">
          <p
            className="eyebrow hero-enter mb-7 text-white/75"
            style={enterAfter(160)}
          >
            Specialty coffee · Since {siteCafe.foundedYear}
          </p>

          <h1
            className="font-display display-xl hero-enter max-w-5xl text-balance"
            style={enterAfter(260)}
          >
            {siteCafe.tagline}
          </h1>

          <div
            className="hero-enter mt-11 flex flex-wrap items-center gap-x-7 gap-y-5"
            style={enterAfter(400)}
          >
            <a href="#visit" className="button-primary button-light">
              Plan your visit
              <span aria-hidden="true" className="button-arrow">
                ↘
              </span>
            </a>
            <span className="text-sm text-white/70">
              Made for long conversations.
            </span>
          </div>
        </div>

        <div
          aria-hidden="true"
          className="hero-enter absolute inset-x-0 bottom-5 flex justify-center"
          style={enterAfter(700)}
        >
          <span className="scroll-cue__line" />
        </div>
      </section>

      {/* ----------------------------------------------------------- story */}
      <section className="shell section-pad">
        <div className="grid gap-12 lg:grid-cols-[1.3fr_.7fr] lg:items-end lg:gap-24">
          <SectionIntro
            eyebrow="A little slower here"
            title={siteCafe.story}
            titleClassName="display-lg max-w-4xl text-balance"
          />
          <Reveal delay={140}>
            <p className="lede max-w-md">{siteCafe.storySecondary}</p>
          </Reveal>
        </div>
      </section>

      {/* --------------------------------------------------------- gallery */}
      <section
        aria-label={`Inside ${siteCafe.name}`}
        className="shell grid grid-cols-2 gap-3 pb-6 sm:gap-4 lg:grid-cols-12 lg:gap-6"
      >
        {gallery.images.map((image, index) => {
          const tile = galleryTiles[index % galleryTiles.length];

          return (
            <Reveal
              key={image.key}
              delay={index * 130}
              variant="scale"
              className={tile.wrap}
            >
              <figure className={`image-frame relative ${tile.frame}`}>
                <Image
                  src={image.url}
                  alt={image.alt}
                  className="object-cover"
                  fill
                  sizes={tile.sizes}
                />
              </figure>
            </Reveal>
          );
        })}
      </section>

      {/* ---------------------------------------------------------- offers */}
      {offers.length > 0 && (
        <section id="offers" className="shell section-pad scroll-mt-16">
          <SectionIntro
            eyebrow="What is on"
            title={
              <>
                A little
                <br />
                something extra.
              </>
            }
            titleClassName="display-lg"
          />

          <div className="mt-14 grid gap-8 md:grid-cols-2 lg:gap-10">
            {offers.map((offer, index) => (
              <Reveal
                key={offer.id}
                delay={index * 110}
                className={index === 0 ? "md:col-span-2" : ""}
              >
                <article className="flex h-full flex-col overflow-hidden rounded-2xl border border-[#201a16]/12 bg-[#fbf8f2]">
                  {offer.imageUrl && (
                    <figure
                      className={`image-frame relative ${
                        index === 0
                          ? "h-[18rem] sm:h-[24rem]"
                          : "h-[14rem] sm:h-[17rem]"
                      }`}
                    >
                      <Image
                        src={offer.imageUrl}
                        alt=""
                        className="object-cover"
                        fill
                        sizes={
                          index === 0
                            ? "(max-width: 768px) 100vw, 80vw"
                            : "(max-width: 768px) 100vw, 40vw"
                        }
                      />
                    </figure>
                  )}

                  <div className="flex flex-1 flex-col p-7 sm:p-9">
                    {offer.value && (
                      <p className="eyebrow mb-4 text-[#b56e45]">
                        {offer.value}
                      </p>
                    )}

                    <h3
                      className={`font-display tracking-[-0.035em] ${
                        index === 0 ? "text-4xl sm:text-5xl" : "text-3xl"
                      }`}
                    >
                      {offer.title}
                    </h3>

                    {offer.description && (
                      <p className="mt-4 leading-7 text-[#756a60]">
                        {offer.description}
                      </p>
                    )}

                    {offer.endDate && (
                      <p className="mt-6 text-sm text-[#756a60]">
                        Until {formatOfferDate(offer.endDate)}
                      </p>
                    )}
                  </div>
                </article>
              </Reveal>
            ))}
          </div>
        </section>
      )}

      {/* ------------------------------------------------------------ menu */}
      <section id="menu" className="shell section-pad max-w-5xl scroll-mt-16">
        <SectionIntro
          eyebrow="The menu"
          title={
            <>
              Made slowly.
              <br />
              Served warmly.
            </>
          }
          titleClassName="display-lg"
        />

        <div className="mt-16 space-y-16">
          {menu.sections.length === 0 ? (
            <Reveal>
              <p className="lede">
                Our menu is being updated. Please check back soon.
              </p>
            </Reveal>
          ) : (
            menu.sections.map((section, sectionIndex) => (
              <Reveal key={section.key} delay={sectionIndex * 90}>
                <div>
                  {section.name && (
                    <h3 className="eyebrow mb-6 text-[#b56e45]">
                      {section.name}
                    </h3>
                  )}

                  <div className="border-t border-[#201a16]/12">
                    {section.items.map((item) => (
                      <article
                        key={item.key}
                        className="menu-row border-b border-[#201a16]/12 py-7"
                      >
                        <div className="sm:max-w-lg">
                          <h4 className="text-xl font-semibold tracking-[-0.02em]">
                            {item.name}
                          </h4>
                          {item.description && (
                            <p className="mt-2 leading-7 text-[#756a60]">
                              {item.description}
                            </p>
                          )}
                        </div>

                        <span aria-hidden="true" className="menu-leader" />

                        <p className="menu-row__price font-display text-2xl">
                          {item.price}
                        </p>
                      </article>
                    ))}
                  </div>
                </div>
              </Reveal>
            ))
          )}
        </div>
      </section>

      {/* Optical seam from paper into the dark roast section. */}
      <div aria-hidden="true" className="seam-to-dark" />

      {/* ----------------------------------------------------------- visit */}
      <section
        id="visit"
        className="section-pad scroll-mt-16 bg-[#27201c] text-[#fffaf3]"
      >
        <div className="shell grid gap-16 lg:grid-cols-[1.1fr_.9fr] lg:gap-24">
          <SectionIntro
            eyebrow="Find your table"
            title={
              <>
                Come by
                <br />
                for a cup.
              </>
            }
            eyebrowClassName="text-[#e8b995]"
            titleClassName="display-lg"
          />

          <div className="grid gap-12 sm:grid-cols-2 lg:grid-cols-1 lg:gap-14">
            <Reveal delay={120}>
              <h3 className="eyebrow mb-5 text-[#e8b995]">Location</h3>
              <address className="text-lg leading-8 not-italic text-[#fffaf3]/80">
                {siteCafe.address.map((line, index) => (
                  <span key={`${index}-${line}`} className="block">
                    {line}
                  </span>
                ))}
              </address>
              <a
                href={siteCafe.mapsUrl}
                target="_blank"
                rel="noreferrer"
                className="button-secondary mt-7 border-white/45 text-white hover:border-white"
              >
                Directions
                <span aria-hidden="true" className="button-arrow">
                  ↗
                </span>
              </a>
            </Reveal>

            <Reveal delay={220}>
              <h3 className="eyebrow mb-5 text-[#e8b995]">Opening hours</h3>
              <dl className="text-lg text-[#fffaf3]/80">
                {siteCafe.hours.map((hour, index) => (
                  <div
                    key={`${index}-${hour}`}
                    className="border-b border-white/12 py-2.5 last:border-b-0"
                  >
                    <dd>{hour}</dd>
                  </div>
                ))}
              </dl>
              <a
                href={`https://wa.me/${siteCafe.whatsapp}`}
                target="_blank"
                rel="noreferrer"
                className="button-primary mt-7"
              >
                Chat on WhatsApp
                <span aria-hidden="true" className="button-arrow">
                  ↗
                </span>
              </a>
            </Reveal>
          </div>
        </div>
      </section>

      {/* ---------------------------------------------------------- footer */}
      <footer className="bg-[#27201c] px-[var(--gutter)] pb-10 text-[#fffaf3]">
        <div className="mx-auto flex max-w-[88rem] flex-col justify-between gap-7 border-t border-white/15 py-9 text-sm text-white/60 sm:flex-row sm:items-center">
          <SiteMark name={siteCafe.name} className="text-white" />

          <nav className="flex gap-7" aria-label="Elsewhere">
            <a
              href={siteCafe.instagram}
              target="_blank"
              rel="noreferrer"
              className="link-underline transition hover:text-white"
            >
              Instagram
            </a>
            <a
              href={siteCafe.mapsUrl}
              target="_blank"
              rel="noreferrer"
              className="link-underline transition hover:text-white"
            >
              Directions
            </a>
          </nav>

          <p>© {new Date().getFullYear()}</p>
        </div>
      </footer>
    </main>
  );
}
