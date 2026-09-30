import type { ReactNode } from "react";
import Link from "next/link";
import { requireCafeSession } from "@/app/lib/session";
import { DashboardNav } from "./dashboard-nav";
import { SignOutButton } from "./sign-out-button";

export default async function DashboardLayout({
  children,
}: {
  children: ReactNode;
}) {
  // Authoritative gate for every /dashboard route: no valid session, no page.
  const session = await requireCafeSession();

  return (
    <div className="min-h-screen bg-[#f4efe7] text-[#1f1a17]">
      <div className="mx-auto flex min-h-screen w-full max-w-[1400px] flex-col md:flex-row">
        <aside className="border-b border-black/10 md:w-64 md:shrink-0 md:border-r md:border-b-0">
          <div className="flex items-start justify-between p-6 md:block">
            <div>
              <Link
                href="/dashboard"
                className="text-lg font-semibold tracking-[0.2em]"
              >
                BREWSITE
              </Link>
              <p className="mt-1 text-sm text-black/50">Café Dashboard</p>
            </div>

            <div className="flex flex-col items-end gap-1 md:mt-6 md:items-start">
              <Link
                href="/"
                className="text-sm text-black/50 underline-offset-4 transition hover:text-black hover:underline"
              >
                View site
              </Link>

              <SignOutButton />
            </div>
          </div>

          <p className="truncate px-6 pb-4 text-xs text-black/40">
            {session.email}
          </p>

          <DashboardNav />
        </aside>

        <main className="flex-1 p-6 md:p-10">{children}</main>
      </div>
    </div>
  );
}
