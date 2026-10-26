import type { Metadata } from "next";
import { listStaffOrders, todayTotals } from "@/app/db/orders";
import { requireCafeSession } from "@/app/lib/session";
import { OrdersBoard } from "./orders-board";

export const metadata: Metadata = {
  title: "Orders · BrewSite Dashboard",
};

export const dynamic = "force-dynamic";

export default async function OrdersPage() {
  const { cafeId } = await requireCafeSession();
  const [orders, today] = await Promise.all([listStaffOrders(cafeId), todayTotals(cafeId)]);
  // The board's "x min ago" labels start from this time on both the server
  // and the phone, so the first render matches and hydration stays clean.
  // A server component renders once per request, so reading the clock here
  // is the point, not an accident.
  // eslint-disable-next-line react-hooks/purity
  const renderedAt = Date.now();
  return <OrdersBoard initialOrders={orders} initialToday={today} renderedAt={renderedAt} />;
}
