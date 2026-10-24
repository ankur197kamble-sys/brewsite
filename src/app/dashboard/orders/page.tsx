import type { Metadata } from "next";
import { listStaffOrders } from "@/app/db/orders";
import { requireCafeSession } from "@/app/lib/session";
import { OrdersBoard } from "./orders-board";

export const metadata: Metadata = {
  title: "Orders · BrewSite Dashboard",
};

export const dynamic = "force-dynamic";

export default async function OrdersPage() {
  const { cafeId } = await requireCafeSession();
  const orders = await listStaffOrders(cafeId);
  return <OrdersBoard initialOrders={orders} />;
}
