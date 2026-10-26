import type { Metadata } from "next";
import { loadAppData } from "../data";
import { Checkout } from "./checkout";
import { AppUnavailable } from "../unavailable";

export const metadata: Metadata = { title: "Your order" };

export default async function AppCheckout() {
  const data = await loadAppData();
  if (!data) return <AppUnavailable />;
  return <Checkout menu={data.menu} />;
}
