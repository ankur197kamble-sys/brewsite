import type { Metadata } from "next";
import { loadAppData } from "../data";
import { OrderMenu } from "./order-menu";
import { AppUnavailable } from "../unavailable";

export const metadata: Metadata = { title: "Menu" };

export default async function AppMenu() {
  const data = await loadAppData();
  if (!data) return <AppUnavailable />;
  return <OrderMenu menu={data.menu} />;
}
