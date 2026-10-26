import type { Metadata } from "next";
import { OrdersList } from "./orders-list";

export const metadata: Metadata = { title: "My orders" };

export default function AppOrders() {
  return <OrdersList />;
}
