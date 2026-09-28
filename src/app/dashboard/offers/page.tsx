import type { Metadata } from "next";
import { getOffers } from "@/app/db/offers";
import { requireCafeSession } from "@/app/lib/session";
import { OffersManager } from "./offers-manager";

export const metadata: Metadata = {
  title: "Offers · BrewSite Dashboard",
};

// Offers are edited here, so this must never be served from a build-time cache.
export const dynamic = "force-dynamic";

export default async function OffersPage() {
  const { cafeId } = await requireCafeSession();
  const offers = await getOffers(cafeId);

  return <OffersManager offers={offers} />;
}
