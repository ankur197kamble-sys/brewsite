import { cafe as fallbackCafe } from "@/app/data/cafe";
import { getCafe } from "@/app/db/cafe";
import { getMenu } from "@/app/db/menu";
import { getPublishedOffers } from "@/app/db/offers";
import { toPublicOffers, type OfferView } from "@/app/lib/offers";
import { priceToPaise } from "@/app/lib/orders";
import { getSiteCafe, type SiteCafe } from "@/app/lib/site-cafe";
import { getPublicCafeId } from "@/app/lib/tenant";

/** Server-side loaders for the customer app. */

export type AppMenuItem = {
  id: number;
  name: string;
  description: string | null;
  pricePaise: number;
};

export type AppMenuSection = { id: number; name: string; items: AppMenuItem[] };

/** Only what a customer can actually order: published dishes with a price. */
export async function loadAppMenu(cafeId: number): Promise<AppMenuSection[]> {
  const categories = await getMenu(cafeId);
  return categories
    .map((category) => ({
      id: category.id,
      name: category.name,
      items: category.items
        .filter((item) => item.isPublished && priceToPaise(item.price) > 0)
        .map((item) => ({
          id: item.id,
          name: item.name,
          description: item.description,
          pricePaise: priceToPaise(item.price),
        })),
    }))
    .filter((section) => section.items.length > 0);
}

/**
 * One retry after a short pause. The database is reached over HTTP, and a
 * momentary network blip should not reach the customer as an error.
 */
export async function withRetry<T>(load: () => Promise<T>): Promise<T> {
  try {
    return await load();
  } catch {
    await new Promise((resolve) => setTimeout(resolve, 400));
    return load();
  }
}

export type AppData = {
  cafe: SiteCafe;
  menu: AppMenuSection[];
  offers: OfferView[];
};

/**
 * Everything the app screens need, or null if the café cannot be reached.
 * Unlike the marketing site, the app never falls back to demo content: a
 * customer must never see another café's name or order from a stale menu.
 */
export async function loadAppData(): Promise<AppData | null> {
  const cafeId = getPublicCafeId();
  try {
    const [dbCafe, menu, offers] = await withRetry(() =>
      Promise.all([getCafe(cafeId), loadAppMenu(cafeId), getPublishedOffers(cafeId)]),
    );
    if (!dbCafe) return null;
    return { cafe: getSiteCafe(dbCafe, fallbackCafe), menu, offers: toPublicOffers(offers) };
  } catch (error) {
    console.error("Failed to load app data:", error);
    return null;
  }
}

/** The café's own name, or null if it cannot be read right now. */
export async function loadCafeName(): Promise<string | null> {
  try {
    const dbCafe = await withRetry(() => getCafe(getPublicCafeId()));
    return dbCafe ? getSiteCafe(dbCafe, fallbackCafe).name : null;
  } catch {
    return null;
  }
}
