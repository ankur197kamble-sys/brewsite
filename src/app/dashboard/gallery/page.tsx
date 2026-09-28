import type { Metadata } from "next";
import { getGallery } from "@/app/db/gallery";
import { requireCafeSession } from "@/app/lib/session";
import { GalleryManager } from "./gallery-manager";

export const metadata: Metadata = {
  title: "Gallery · BrewSite Dashboard",
};

// Gallery data is edited here, so it must never come from a build-time cache.
export const dynamic = "force-dynamic";

export default async function GalleryPage() {
  const { cafeId } = await requireCafeSession();
  const images = await getGallery(cafeId);

  return <GalleryManager images={images} />;
}
