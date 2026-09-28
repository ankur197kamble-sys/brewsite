"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const sections = [
  { href: "/dashboard", label: "Overview" },
  { href: "/dashboard/cafe", label: "Café Information" },
  { href: "/dashboard/menu", label: "Menu" },
  { href: "/dashboard/gallery", label: "Gallery" },
  { href: "/dashboard/offers", label: "Offers" },
];

/** Planned sections — shown so the shape of the product is visible. */
const upcoming = ["Opening Hours", "Analytics", "Settings"];

export function DashboardNav() {
  const pathname = usePathname();

  return (
    <nav aria-label="Dashboard sections">
      <ul className="flex gap-2 overflow-x-auto px-6 pb-4 md:flex-col md:overflow-visible md:pb-6">
        {sections.map((section) => {
          const isActive = pathname === section.href;

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

        {upcoming.map((label) => (
          <li key={label} className="hidden md:block">
            <span className="block rounded-xl px-4 py-3 text-sm text-black/30">
              {label}
            </span>
          </li>
        ))}
      </ul>
    </nav>
  );
}
