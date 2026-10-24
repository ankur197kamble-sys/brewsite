import type { Metadata } from "next";
import { requireCafeSession } from "@/app/lib/session";
import { STAMPS_PER_REWARD } from "@/app/lib/orders";
import { LoyaltyLookup } from "./loyalty-lookup";

export const metadata: Metadata = {
  title: "Loyalty · BrewSite Dashboard",
};

export const dynamic = "force-dynamic";

export default async function LoyaltyPage() {
  await requireCafeSession();
  return (
    <>
      <p className="text-sm tracking-[0.25em] text-black/55 uppercase">Loyalty</p>
      <h1 className="mt-3 text-4xl font-semibold tracking-tight md:text-5xl">Loyalty stamps</h1>
      <p className="mt-3 max-w-xl text-black/60">
        Customers get one stamp per collected order when they add their number. Every {STAMPS_PER_REWARD} stamps earns
        a treat. Look a customer up to see their stamps and redeem a treat.
      </p>
      <LoyaltyLookup />
    </>
  );
}
