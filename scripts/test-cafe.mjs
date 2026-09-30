/**
 * End-to-end check of the café details API against a running dev server.
 *
 * Usage (with `npm run dev` already running):
 *   npm run test:cafe
 *
 * Works only on two throwaway "[test] …" cafés, deleted afterwards.
 */
import { call, check, createTenant, expectStatus, finish, section, tag } from "./lib/harness.mjs";

const base = {
  name: "Test Café",
  tagline: "A tagline",
  story: "A story",
  storySecondary: "More story",
  phone: "+91 98765 43210",
  whatsapp: "919876543210",
  instagram: "https://instagram.com/example",
  mapsUrl: "https://maps.google.com/?q=example",
  address: ["Shop 1", "Some Road", ""],
  heroImage: "",
  hours: ["Mon — Sun · 9am — 9pm"],
};

async function getCafe(cookie) {
  return (await call("GET", "/api/cafe", { cookie })).json?.data;
}

async function main() {
  section("Unauthenticated");
  expectStatus("GET /api/cafe → 401", await call("GET", "/api/cafe"), 401);
  expectStatus("POST /api/cafe → 401", await call("POST", "/api/cafe", { body: base }), 401);

  const a = await createTenant("Cafe A");
  const b = await createTenant("Cafe B");

  section("Validation (café A)");
  expectStatus("missing name → 400", await call("POST", "/api/cafe", { cookie: a.cookie, body: { ...base, name: " " } }), 400);
  expectStatus("hero image from a disallowed host → 400", await call("POST", "/api/cafe", { cookie: a.cookie, body: { ...base, heroImage: "https://evil.example.com/x.jpg" } }), 400);

  section("Saving details (café A)");
  let result = await call("POST", "/api/cafe", {
    cookie: a.cookie,
    body: { ...base, name: tag("A"), highlights: "Fresh brews · Comfort bites", foundedYear: 2021 },
  });
  expectStatus("save → 200", result, 200);
  let cafe = await getCafe(a.cookie);
  check("highlights saved", cafe?.highlights === "Fresh brews · Comfort bites");
  check("founded year saved", cafe?.foundedYear === 2021);
  check("blank address lines dropped", cafe?.address === JSON.stringify(["Shop 1", "Some Road"]), cafe?.address);

  await call("POST", "/api/cafe", { cookie: a.cookie, body: { ...base, name: tag("A"), foundedYear: 2021 } });
  cafe = await getCafe(a.cookie);
  check("omitting highlights leaves it unchanged", cafe?.highlights === "Fresh brews · Comfort bites", cafe?.highlights);

  for (const [label, year] of [["null", null], ["0", 0], ["a far-future year", 3000], ["a non-integer", 2020.5]]) {
    await call("POST", "/api/cafe", { cookie: a.cookie, body: { ...base, name: tag("A"), foundedYear: year } });
    cafe = await getCafe(a.cookie);
    check(`founded year ${label} is stored as unknown`, cafe?.foundedYear === null, String(cafe?.foundedYear));
  }

  await call("POST", "/api/cafe", {
    cookie: a.cookie,
    body: { ...base, name: tag("A"), highlights: "", address: ["", " "], hours: [] },
  });
  cafe = await getCafe(a.cookie);
  check("empty highlights clears it", cafe?.highlights === null, cafe?.highlights);
  check("empty address is stored empty, never demo data", cafe?.address === null, cafe?.address);
  check("empty hours are stored empty, never demo data", cafe?.hours === null, cafe?.hours);

  section("Tenant isolation");
  const bBefore = await getCafe(b.cookie);
  await call("POST", "/api/cafe", { cookie: a.cookie, body: { ...base, name: tag("A again"), cafeId: b.cafeId, id: b.cafeId } });
  const bAfter = await getCafe(b.cookie);
  check("a forged cafeId/id in the body cannot touch café B", bAfter?.name === bBefore?.name && bAfter?.id === b.cafeId);
  check("café A's save applied to café A", (await getCafe(a.cookie))?.name === tag("A again"));
  check("each café reads only its own row", (await getCafe(a.cookie))?.id === a.cafeId && bAfter?.id === b.cafeId);
}

await finish(main);
