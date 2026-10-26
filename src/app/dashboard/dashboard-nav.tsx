"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/** Day-to-day running first (orders), then content, then setup. */
const sections = [
  { href: "/dashboard", label: "Overview" },
  { href: "/dashboard/orders", label: "Orders" },
  { href: "/dashboard/tables", label: "Tables & QR" },
  { href: "/dashboard/menu", label: "Menu" },
  { href: "/dashboard/offers", label: "Offers" },
  { href: "/dashboard/loyalty", label: "Loyalty" },
  { href: "/dashboard/gallery", label: "Gallery" },
  { href: "/dashboard/cafe", label: "Café Information" },
];

export function DashboardNav() {
  const pathname = usePathname();

  return (
    <nav aria-label="Dashboard sections">
      <ul className="flex gap-2 overflow-x-auto px-6 pb-4 md:flex-col md:overflow-visible md:pb-6">
        {sections.map((section) => {
          // Sub-pages (e.g. Tables & QR → Print) keep their section highlighted.
          const isActive =
            pathname === section.href ||
            (section.href !== "/dashboard" && pathname.startsWith(`${section.href}/`));

          return (
            <li key={section.href}>
              <Link
                href={section.href}
                aria-current={isActive ? "page" : undefined}
                className={`block whitespace-nowrap rounded-xl px-4 py-3 text-sm transition ${
                  isActive
                    ? "bg-[#1f1a17] font-medium text-white"
                    : "hover:bg-black/5"
                }`}
              >
                {section.label}
              </Link>
            </li>
          );
        })}

      </ul>
    </nav>
  );
}
