import type { Metadata } from "next";
import { getMenu } from "@/app/db/menu";
import { requireCafeSession } from "@/app/lib/session";
import { MenuManager } from "./menu-manager";

export const metadata: Metadata = {
  title: "Menu · BrewSite Dashboard",
};

// Menu data is edited here, so it must never be served from a build-time cache.
export const dynamic = "force-dynamic";

export default async function MenuPage() {
  const { cafeId } = await requireCafeSession();
  const categories = await getMenu(cafeId);

  return <MenuManager categories={categories} />;
}
