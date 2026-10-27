"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCart } from "./storage";

type Tab = { href: string; label: string; icon: React.ReactNode };

const iconProps = {
  "aria-hidden": true,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.7,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  className: "h-[1.6rem] w-[1.6rem]",
};

const TABS: Tab[] = [
  {
    href: "/app",
    label: "Home",
    icon: (
      <svg {...iconProps}>
        <path d="M3.5 10.5 12 3.5l8.5 7V20a.5.5 0 0 1-.5.5h-5v-6h-6v6H4a.5.5 0 0 1-.5-.5z" />
      </svg>
    ),
  },
  {
    href: "/app/menu",
    label: "Menu",
    icon: (
      <svg {...iconProps}>
        <path d="M5 8h12v5a6 6 0 0 1-6 6v0a6 6 0 0 1-6-6zM17 9.5h1.5a2.5 2.5 0 0 1 0 5H17M8 3.5v2M11 3.5v2M14 3.5v2" />
      </svg>
    ),
  },
  {
    href: "/app/orders",
    label: "Orders",
    icon: (
      <svg {...iconProps}>
        <path d="M6.5 3.5h11l-.9 16.2a1 1 0 0 1-1 .8H8.4a1 1 0 0 1-1-.8zM9 8h6M9 12h6M9 16h4" />
      </svg>
    ),
  },
  {
    href: "/app/stamps",
    label: "Stamps",
    icon: (
      <svg {...iconProps}>
        <path d="m12 3.5 2.5 5.2 5.7.8-4.1 4 1 5.6-5.1-2.7-5.1 2.7 1-5.6-4.1-4 5.7-.8z" />
      </svg>
    ),
  },
];

/** App-style bottom navigation, kept clear of the phone's home indicator. */
export function AppTabBar() {
  const pathname = usePathname();
  const cart = useCart();
  const cartCount = Object.values(cart).reduce((sum, quantity) => sum + quantity, 0);

  return (
    <nav
      aria-label="App"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-[var(--line)] bg-[var(--app-bar-bg)] pb-[env(safe-area-inset-bottom)] backdrop-blur-xl"
    >
      <ul className="mx-auto grid max-w-md grid-cols-4">
        {TABS.map((tab) => {
          const active = tab.href === "/app" ? pathname === "/app" : pathname.startsWith(tab.href);
          return (
            <li key={tab.href}>
              <Link
                href={tab.href}
                aria-current={active ? "page" : undefined}
                className={`app-tab relative flex min-h-[4.25rem] flex-col items-center justify-center gap-1 text-[0.72rem] font-semibold tracking-wide transition-colors duration-200 ${
                  active ? "text-[var(--app-nav-active)]" : "text-[var(--app-muted)]"
                }`}
              >
                <span
                  aria-hidden="true"
                  className={`absolute top-0 h-[3px] w-8 rounded-b-full bg-[var(--app-nav-active)] transition-transform duration-300 ${
                    active ? "scale-x-100" : "scale-x-0"
                  }`}
                />
                {tab.icon}
                {tab.label}
                {tab.href === "/app/menu" && cartCount > 0 && (
                  <span
                    key={cartCount}
                    className="app-bump absolute top-2 left-1/2 ml-2.5 min-w-5 rounded-full bg-[var(--app-cta-bg)] px-1.5 text-center text-[0.68rem] leading-5 font-bold text-[var(--app-cta-text)]">
                    {cartCount}
                    <span className="sr-only"> in your order</span>
                  </span>
                )}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
