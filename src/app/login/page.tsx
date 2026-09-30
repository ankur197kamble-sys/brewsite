import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getCafeSession } from "@/app/lib/session";
import { LoginForm } from "./login-form";

export const metadata: Metadata = {
  title: "Sign in · BrewSite",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function LoginPage() {
  if (await getCafeSession()) redirect("/dashboard");

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#f4efe7] px-6 py-16 text-[#1f1a17]">
      <div className="w-full max-w-md">
        <div className="text-center">
          <p className="text-lg font-semibold tracking-[0.2em]">BREWSITE</p>
          <h1 className="mt-6 text-3xl font-semibold tracking-tight">
            Sign in to your dashboard
          </h1>
          <p className="mt-3 text-sm text-black/55">
            Manage your café website, menu and details.
          </p>
        </div>

        <div className="mt-10 rounded-2xl border border-black/10 bg-white/60 p-6 md:p-8">
          <LoginForm />
        </div>

        <p className="mt-8 text-center text-sm text-black/45">
          <Link href="/" className="underline-offset-4 hover:underline">
            Back to the café website
          </Link>
        </p>
      </div>
    </main>
  );
}
