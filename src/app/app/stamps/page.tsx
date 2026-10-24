import type { Metadata } from "next";
import { StampCard } from "./stamp-card";

export const metadata: Metadata = { title: "Loyalty stamps" };

export default function AppStamps() {
  return <StampCard />;
}
