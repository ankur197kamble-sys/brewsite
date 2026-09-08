const menuItems = [
  {
    name: "Velvet Cappuccino",
    description: "Double espresso, silky milk, cocoa dust",
    price: "₹220",
  },
  {
    name: "Burnt Caramel Latte",
    description: "Espresso, caramel, steamed milk, sea salt",
    price: "₹240",
  },
  {
    name: "Midnight Mocha",
    description: "Dark chocolate, espresso, cold cream",
    price: "₹260",
  },
];

export default function Home() {
  return (
    <main className="min-h-screen bg-[#f5f0e8] text-[#211c17]">
      {/* Navigation */}
      <nav className="absolute left-0 right-0 top-0 z-20">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-7 lg:px-10">
          <div className="text-xl font-semibold tracking-[0.18em]">
            BREW<span className="font-light">SITE</span>
          </div>

          <div className="hidden items-center gap-8 text-sm md:flex">
            <a href="#story" className="transition-opacity hover:opacity-60">
              Our Story
            </a>
            <a href="#menu" className="transition-opacity hover:opacity-60">
              Menu
            </a>
            <a href="#visit" className="transition-opacity hover:opacity-60">
              Visit
            </a>
          </div>

          <a
            href="#menu"
            className="rounded-full border border-[#211c17] px-5 py-2.5 text-sm transition-all hover:bg-[#211c17] hover:text-[#f5f0e8]"
          >
            Explore Menu
          </a>
        </div>
      </nav>

      {/* Hero */}
      <section className="relative flex min-h-screen items-end overflow-hidden">
        <div
          className="absolute inset-0 bg-cover bg-center"
          style={{
            backgroundImage:
              "url('https://images.unsplash.com/photo-1495474472287-4d71bcdd2085?auto=format&fit=crop&w=2200&q=85')",
          }}
        />

        <div className="absolute inset-0 bg-black/45" />

        <div className="relative z-10 mx-auto w-full max-w-7xl px-6 pb-16 text-white lg:px-10 lg:pb-20">
          <div className="max-w-4xl">
            <p className="mb-6 text-xs uppercase tracking-[0.35em] text-white/75">
              Specialty Coffee · Since 2018
            </p>

            <h1 className="text-6xl font-light leading-[0.92] tracking-[-0.04em] sm:text-7xl lg:text-9xl">
              Slow mornings.
              <br />
              <span className="italic">Good coffee.</span>
            </h1>

            <div className="mt-10 flex flex-col gap-5 sm:flex-row sm:items-center">
              <a
                href="#menu"
                className="w-fit rounded-full bg-white px-7 py-3.5 text-sm font-medium text-[#211c17] transition-transform hover:scale-105"
              >
                Discover the menu
              </a>

              <span className="text-sm text-white/70">
                A neighbourhood café made for lingering.
              </span>
            </div>
          </div>
        </div>
      </section>

      {/* Story */}
      <section id="story" className="mx-auto max-w-7xl px-6 py-28 lg:px-10 lg:py-40">
        <div className="grid gap-16 lg:grid-cols-2 lg:items-center">
          <div>
            <p className="mb-5 text-xs uppercase tracking-[0.3em] text-[#8b6f52]">
              The ritual
            </p>

            <h2 className="max-w-xl text-5xl font-light leading-tight tracking-[-0.035em] sm:text-6xl">
              Coffee tastes better when you{" "}
              <span className="italic">slow down.</span>
            </h2>
          </div>

          <div className="max-w-lg text-lg leading-8 text-[#665c53]">
            <p>
              We believe a café should feel like a pause button. Good beans,
              thoughtful food, warm light and enough time to finish the
              conversation.
            </p>

            <p className="mt-6">
              Brewsite is our little corner of the neighbourhood — serving
              carefully sourced coffee from morning until late afternoon.
            </p>
          </div>
        </div>
      </section>

      {/* Image strip */}
      <section className="grid grid-cols-1 md:grid-cols-3">
        <div
          className="h-[420px] bg-cover bg-center"
          style={{
            backgroundImage:
              "url('https://images.unsplash.com/photo-1445116572660-236099ec97a0?auto=format&fit=crop&w=1200&q=85')",
          }}
        />

        <div
          className="h-[420px] bg-cover bg-center"
          style={{
            backgroundImage:
              "url('https://images.unsplash.com/photo-1498804103079-a6351b050096?auto=format&fit=crop&w=1200&q=85')",
          }}
        />

        <div
          className="h-[420px] bg-cover bg-center"
          style={{
            backgroundImage:
              "url('https://images.unsplash.com/photo-1501339847302-ac426a4a7cbb?auto=format&fit=crop&w=1200&q=85')",
          }}
        />
      </section>

      {/* Menu */}
      <section id="menu" className="mx-auto max-w-7xl px-6 py-28 lg:px-10 lg:py-40">
        <div className="mb-16 flex flex-col justify-between gap-6 md:flex-row md:items-end">
          <div>
            <p className="mb-5 text-xs uppercase tracking-[0.3em] text-[#8b6f52]">
              Today at Brewsite
            </p>

            <h2 className="text-5xl font-light tracking-[-0.035em] sm:text-6xl">
              Favourites
            </h2>
          </div>

          <p className="max-w-sm text-sm leading-6 text-[#766b61]">
            A small menu built around excellent coffee, seasonal ingredients
            and things we genuinely love eating.
          </p>
        </div>

        <div className="divide-y divide-[#d8cfc4] border-y border-[#d8cfc4]">
          {menuItems.map((item) => (
            <div
              key={item.name}
              className="flex flex-col gap-4 py-8 sm:flex-row sm:items-center sm:justify-between"
            >
              <div>
                <h3 className="text-2xl font-light">{item.name}</h3>
                <p className="mt-2 text-sm text-[#766b61]">
                  {item.description}
                </p>
              </div>

              <span className="text-lg">{item.price}</span>
            </div>
          ))}
        </div>

        <div className="mt-10 text-center">
          <button className="rounded-full bg-[#211c17] px-7 py-3.5 text-sm text-white transition-transform hover:scale-105">
            View full menu
          </button>
        </div>
      </section>

      {/* Visit */}
      <section
        id="visit"
        className="bg-[#211c17] px-6 py-28 text-[#f5f0e8] lg:px-10 lg:py-36"
      >
        <div className="mx-auto max-w-7xl">
          <div className="grid gap-16 lg:grid-cols-2">
            <div>
              <p className="mb-5 text-xs uppercase tracking-[0.3em] text-white/45">
                Come by
              </p>

              <h2 className="text-5xl font-light leading-tight tracking-[-0.035em] sm:text-7xl">
                Your table
                <br />
                <span className="italic">is waiting.</span>
              </h2>
            </div>

            <div className="grid gap-10 sm:grid-cols-2 lg:pt-12">
              <div>
                <p className="mb-3 text-xs uppercase tracking-[0.25em] text-white/40">
                  Find us
                </p>
                <p className="leading-7 text-white/80">
                  24 Market Street
                  <br />
                  Your City, India
                </p>
              </div>

              <div>
                <p className="mb-3 text-xs uppercase tracking-[0.25em] text-white/40">
                  Hours
                </p>
                <p className="leading-7 text-white/80">
                  Mon — Fri · 8am — 7pm
                  <br />
                  Sat — Sun · 9am — 8pm
                </p>
              </div>

              <a
                href="#"
                className="w-fit rounded-full border border-white/30 px-6 py-3 text-sm transition-all hover:bg-white hover:text-[#211c17]"
              >
                Get directions
              </a>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-[#211c17] px-6 pb-10 text-[#f5f0e8] lg:px-10">
        <div className="mx-auto flex max-w-7xl flex-col justify-between gap-5 border-t border-white/10 pt-8 text-sm text-white/45 sm:flex-row">
          <span>© 2026 Brewsite Café</span>
          <span>Made for slow moments.</span>
        </div>
      </footer>
    </main>
  );
}