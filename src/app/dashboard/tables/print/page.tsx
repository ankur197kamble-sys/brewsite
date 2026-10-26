import type { Metadata } from "next";
import Link from "next/link";
import { QrCode } from "@/app/components/qr-code";
import { cafe as fallbackCafe } from "@/app/data/cafe";
import { getCafe } from "@/app/db/cafe";
import { listTables } from "@/app/db/orders";
import { requestOrigin } from "@/app/lib/origin";
import { requireCafeSession } from "@/app/lib/session";
import { getSiteCafe } from "@/app/lib/site-cafe";
import { OriginWarning } from "../origin-warning";
import { PrintButton } from "./print-button";

export const metadata: Metadata = {
  title: "Print QR codes · BrewSite Dashboard",
};

export const dynamic = "force-dynamic";

/** Table cards laid out for an ordinary printer: four to an A4 page. */
export default async function PrintTables() {
  const { cafeId } = await requireCafeSession();
  const [tables, origin, dbCafe] = await Promise.all([listTables(cafeId), requestOrigin(), getCafe(cafeId)]);
  const cafe = getSiteCafe(dbCafe, fallbackCafe);
  const active = tables.filter((table) => table.isActive);

  return (
    <div>
      <OriginWarning origin={origin} />
      <div className="mb-8 flex flex-wrap items-center gap-3 print:hidden">
        <Link href="/dashboard/tables" className="text-sm text-black/60 underline underline-offset-4">
          ← Tables
        </Link>
        <PrintButton />
        <p className="text-sm text-black/60">Cut along the dotted lines. Works on any A4 printer.</p>
      </div>

      {active.length === 0 ? (
        <p className="text-black/60">No active tables to print.</p>
      ) : (
        <ul className="grid grid-cols-1 gap-6 sm:grid-cols-2 print:grid-cols-2 print:gap-0">
          {active.map((table) => (
            <li
              key={table.id}
              className="flex break-inside-avoid flex-col items-center rounded-3xl border border-dashed border-black/30 bg-[#f7f2ea] px-6 py-8 text-center text-[#1f1a17] print:h-[138mm] print:justify-center print:rounded-none print:bg-white"
            >
              <p className="text-[0.7rem] font-semibold tracking-[0.25em] uppercase">{cafe.name}</p>
              <p className="font-display mt-3 text-4xl leading-none">Scan to order</p>
              <div className="mt-5 rounded-2xl bg-white p-2 shadow-sm print:shadow-none">
                <QrCode value={`${origin}/t/${table.token}`} size={190} label={`QR code for ${table.label}`} />
              </div>
              <p className="mt-4 text-2xl font-semibold">{table.label}</p>
              <p className="mt-1 text-sm text-black/60">Order from your phone · Pay at the counter</p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
