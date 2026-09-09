export default function Dashboard() {
  return (
    <main className="min-h-screen bg-[#f4efe7] text-[#1f1a17]">
      <div className="flex min-h-screen">

        {/* Sidebar */}
        <aside className="hidden w-64 border-r border-black/10 p-6 md:block">
          <div className="mb-10">
            <p className="text-lg font-semibold tracking-[0.2em]">
              BREWSITE
            </p>
            <p className="mt-1 text-sm text-black/50">
              Café Dashboard
            </p>
          </div>

          <nav className="space-y-2">
            <a
              href="#"
              className="block rounded-xl bg-[#1f1a17] px-4 py-3 text-sm font-medium text-white"
            >
              Overview
            </a>

            <a
              href="#"
              className="block rounded-xl px-4 py-3 text-sm transition hover:bg-black/5"
            >
              Café Information
            </a>

            <a
              href="#"
              className="block rounded-xl px-4 py-3 text-sm transition hover:bg-black/5"
            >
              Menu
            </a>

            <a
              href="#"
              className="block rounded-xl px-4 py-3 text-sm transition hover:bg-black/5"
            >
              Gallery
            </a>

            <a
              href="#"
              className="block rounded-xl px-4 py-3 text-sm transition hover:bg-black/5"
            >
              Offers
            </a>

            <a
              href="#"
              className="block rounded-xl px-4 py-3 text-sm transition hover:bg-black/5"
            >
              Opening Hours
            </a>

            <a
              href="#"
              className="block rounded-xl px-4 py-3 text-sm transition hover:bg-black/5"
            >
              Analytics
            </a>

            <a
              href="#"
              className="block rounded-xl px-4 py-3 text-sm transition hover:bg-black/5"
            >
              Settings
            </a>
          </nav>
        </aside>

        {/* Main dashboard */}
        <section className="flex-1 p-6 md:p-10">
          <p className="text-sm uppercase tracking-[0.25em] text-black/50">
            Overview
          </p>

          <h1 className="mt-3 text-4xl font-semibold tracking-tight md:text-5xl">
            Welcome to BrewSite
          </h1>

          <p className="mt-3 max-w-xl text-black/60">
            Manage your café website, menu, gallery and customer information
            from one place.
          </p>

          <div className="mt-10 grid gap-4 md:grid-cols-3">
            <div className="rounded-2xl border border-black/10 bg-white/50 p-6">
              <p className="text-sm text-black/50">Website</p>
              <p className="mt-2 text-2xl font-semibold">Live</p>
            </div>

            <div className="rounded-2xl border border-black/10 bg-white/50 p-6">
              <p className="text-sm text-black/50">Menu Items</p>
              <p className="mt-2 text-2xl font-semibold">3</p>
            </div>

            <div className="rounded-2xl border border-black/10 bg-white/50 p-6">
              <p className="text-sm text-black/50">Gallery Images</p>
              <p className="mt-2 text-2xl font-semibold">3</p>
            </div>
          </div>
        </section>

      </div>
    </main>
  );
}