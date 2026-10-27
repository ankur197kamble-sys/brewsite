"use client";

import type { DayPart, Greeting } from "@/app/lib/greeting";
import { useCustomer, useHydrated } from "./storage";

const iconProps = {
  "aria-hidden": true,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.6,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  className: "h-7 w-7",
};

function DayIcon({ part }: { part: DayPart }) {
  if (part === "night") {
    return (
      <svg {...iconProps}>
        <path d="M19.5 14.5A7.5 7.5 0 0 1 9.5 4.5a7.5 7.5 0 1 0 10 10Z" />
      </svg>
    );
  }
  if (part === "evening") {
    return (
      <svg {...iconProps}>
        <path d="M3 18h18M6.5 18a5.5 5.5 0 0 1 11 0M12 8V5.5M5.2 11.2 3.6 9.6M18.8 11.2l1.6-1.6" />
      </svg>
    );
  }
  return (
    <svg {...iconProps}>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6 7 7M17 17l1.4 1.4M5.6 18.4 7 17M17 7l1.4-1.4" />
    </svg>
  );
}

/**
 * The welcome at the top of the home screen: the same greeting the intro
 * ends on, with the customer's first name once this phone has ordered.
 */
export function GreetingCard({ greeting }: { greeting: Greeting }) {
  const hydrated = useHydrated();
  const customer = useCustomer();
  const first = hydrated ? customer.name.trim().split(/\s+/)[0] : "";

  return (
    <section aria-label="Welcome" className="app-card flex items-start gap-4 p-5">
      <span className="mt-0.5 text-[var(--app-muted)]">
        <DayIcon part={greeting.part} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="app-heading block">
          {greeting.title}
          {first ? `, ${first}` : ""}
        </span>
        <span className="app-muted mt-1 block text-[0.95rem] leading-6">
          {greeting.ask} {greeting.message}
        </span>
      </span>
    </section>
  );
}
