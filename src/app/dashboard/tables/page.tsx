import type { Metadata } from "next";
import { listTables } from "@/app/db/orders";
import { requestOrigin } from "@/app/lib/origin";
import { requireCafeSession } from "@/app/lib/session";
import { OriginWarning } from "./origin-warning";
import { TablesManager } from "./tables-manager";

export const metadata: Metadata = {
  title: "Tables & QR · BrewSite Dashboard",
};

export const dynamic = "force-dynamic";

export default async function TablesPage() {
  const { cafeId } = await requireCafeSession();
  const [tables, origin] = await Promise.all([listTables(cafeId), requestOrigin()]);
  return (
    <>
      <OriginWarning origin={origin} />
      <TablesManager tables={tables} origin={origin} />
    </>
  );
}
