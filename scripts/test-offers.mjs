/**
 * End-to-end check of the offers feature against a running dev server.
 *
 * Usage (with `npm run dev` already running):
 *   npm run test:offers
 *   node --env-file=.env.local scripts/test-offers.mjs [baseUrl]
 *
 * It creates two throwaway cafés ("[test] …") with one user each, drives the
 * real HTTP API as both, and deletes everything it created when it finishes,
 * pass or fail. Deleting a test café cascades to its users, sessions and
 * offers.
 *
 * The public homepage always renders café #1, so to check what visitors see
 * it briefly inserts a few "[test]" offers for café #1 and removes them in
 * the same cleanup. Nothing else belonging to café #1 is touched.
 */
import { inArray } from "drizzle-orm";
import { db } from "../src/app/db/index.ts";
import { offers } from "../src/app/db/schema.ts";
import {
  call,
  check,
  createTenant,
  expectStatus,
  finish,
  onCleanup,
  section,
  tag,
} from "./lib/harness.mjs";

const PUBLIC_CAFE_ID = 1;

async function listOffers(cookie) {
  const result = await call("GET", "/api/offers", { cookie });
  return result.json?.data?.offers ?? [];
}

/* ------------------------------------------------------------------ tests */

async function main() {
  section("Unauthenticated");
  expectStatus("GET /api/offers → 401", await call("GET", "/api/offers"), 401);
  expectStatus("POST /api/offers → 401", await call("POST", "/api/offers", { body: { title: "x" } }), 401);
  expectStatus("PATCH /api/offers/1 → 401", await call("PATCH", "/api/offers/1", { body: { title: "x" } }), 401);
  expectStatus("DELETE /api/offers/1 → 401", await call("DELETE", "/api/offers/1"), 401);
  expectStatus("PATCH /api/offers/reorder → 401", await call("PATCH", "/api/offers/reorder", { body: { ids: [1] } }), 401);
  const dashboard = await call("GET", "/dashboard/offers");
  check(
    "/dashboard/offers redirects to /login",
    dashboard.status >= 300 && dashboard.status < 400 && (dashboard.headers.get("location") ?? "").includes("/login"),
    `got ${dashboard.status}`,
  );

  const a = await createTenant("Offers A");
  const b = await createTenant("Offers B");

  section("Validation (café A)");
  const invalidBodies = [
    ["malformed JSON", { raw: "{not json" }],
    ["missing title", { body: { description: "no title" } }],
    ["blank title", { body: { title: "   " } }],
    ["title too long", { body: { title: "x".repeat(91) } }],
    ["impossible date 2026-02-31", { body: { title: "t", startDate: "2026-02-31" } }],
    ["badly formatted date", { body: { title: "t", endDate: "31/12/2026" } }],
    ["end before start", { body: { title: "t", startDate: "2026-05-10", endDate: "2026-05-01" } }],
    ["javascript: image URL", { body: { title: "t", imageUrl: "javascript:alert(1)" } }],
    ["data: image URL", { body: { title: "t", imageUrl: "data:image/png;base64,AAAA" } }],
    ["image host not allowed", { body: { title: "t", imageUrl: "https://evil.example.com/x.jpg" } }],
    ["value too long", { body: { title: "t", value: "x".repeat(41) } }],
    ["non-string description", { body: { title: "t", description: 42 } }],
  ];
  for (const [label, options] of invalidBodies) {
    const result = await call("POST", "/api/offers", { cookie: a.cookie, ...options });
    expectStatus(`rejects ${label} → 400`, result, 400);
  }
  check("café A still has no offers", (await listOffers(a.cookie)).length === 0);

  section("Create (café A)");
  const created = {};
  const specs = {
    live: {
      title: tag("A live"),
      value: "20% off",
      description: "Weekday mornings",
      imageUrl: "https://images.unsplash.com/photo-1495474472287-4d71bcdd2085?w=1200",
      startDate: "2020-01-01",
      endDate: "2099-12-31",
    },
    scheduled: { title: tag("A scheduled"), startDate: "2099-01-01" },
    ended: { title: tag("A ended"), endDate: "2020-01-01" },
    // A forged cafeId in the body must be ignored.
    forged: { title: tag("A forged"), cafeId: b.cafeId },
  };
  for (const [key, spec] of Object.entries(specs)) {
    const result = await call("POST", "/api/offers", { cookie: a.cookie, body: spec });
    expectStatus(`creates ${key} offer → 201`, result, 201);
    created[key] = result.json?.data;
  }
  check("empty dates are stored as null", created.forged?.startDate === null && created.forged?.endDate === null);
  check("isPublished defaults to true", created.forged?.isPublished === true);
  check(
    "response never leaks cafeId",
    Object.values(created).every((offer) => offer && !("cafeId" in offer)),
  );

  let listA = await listOffers(a.cookie);
  check("café A lists 4 offers in creation order", listA.map((o) => o.id).join() === Object.values(created).map((o) => o.id).join());
  check("forged cafeId was ignored (café B sees none)", (await listOffers(b.cookie)).length === 0);

  section("Update (café A)");
  const liveId = created.live.id;
  let result = await call("PATCH", `/api/offers/${liveId}`, { cookie: a.cookie, body: { description: "Edited" } });
  check("edits description → 200", result.status === 200 && result.json?.data?.description === "Edited");
  check("partial edit keeps other fields", result.json?.data?.value === "20% off" && result.json?.data?.title === specs.live.title);
  result = await call("PATCH", `/api/offers/${liveId}`, { cookie: a.cookie, body: { imageUrl: "http://images.unsplash.com/photo-1495474472287-4d71bcdd2085?w=800" } });
  check("http image link is upgraded to https", result.status === 200 && result.json?.data?.imageUrl === "https://images.unsplash.com/photo-1495474472287-4d71bcdd2085?w=800", result.json?.data?.imageUrl);
  result = await call("PATCH", `/api/offers/${liveId}`, { cookie: a.cookie, body: { value: "" } });
  check("clearing optional value stores null", result.status === 200 && result.json?.data?.value === null);
  expectStatus(
    "rejects patch moving end before existing start → 400",
    await call("PATCH", `/api/offers/${liveId}`, { cookie: a.cookie, body: { endDate: "2019-01-01" } }),
    400,
  );
  expectStatus("rejects empty patch → 400", await call("PATCH", `/api/offers/${liveId}`, { cookie: a.cookie, body: {} }), 400);
  expectStatus(
    "rejects non-boolean isPublished → 400",
    await call("PATCH", `/api/offers/${liveId}`, { cookie: a.cookie, body: { isPublished: "yes" } }),
    400,
  );
  expectStatus("rejects blank title on edit → 400", await call("PATCH", `/api/offers/${liveId}`, { cookie: a.cookie, body: { title: "" } }), 400);
  expectStatus("rejects non-numeric id → 400", await call("PATCH", "/api/offers/abc", { cookie: a.cookie, body: { title: "x" } }), 400);
  expectStatus("unknown id → 404", await call("PATCH", "/api/offers/2147483000", { cookie: a.cookie, body: { title: "x" } }), 404);

  result = await call("PATCH", `/api/offers/${created.forged.id}`, { cookie: a.cookie, body: { isPublished: false } });
  check("unpublish → 200", result.status === 200 && result.json?.data?.isPublished === false);
  result = await call("PATCH", `/api/offers/${created.forged.id}`, { cookie: a.cookie, body: { isPublished: true } });
  check("republish → 200", result.status === 200 && result.json?.data?.isPublished === true);

  section("Ordering (café A)");
  const ids = listA.map((o) => o.id);
  expectStatus("first offer cannot move up → 400", await call("PATCH", `/api/offers/${ids[0]}`, { cookie: a.cookie, body: { move: "up" } }), 400);
  expectStatus("moving an unknown offer → 404", await call("PATCH", "/api/offers/2147483000", { cookie: a.cookie, body: { move: "up" } }), 404);
  expectStatus("last offer cannot move down → 400", await call("PATCH", `/api/offers/${ids.at(-1)}`, { cookie: a.cookie, body: { move: "down" } }), 400);
  expectStatus("move first offer down → 200", await call("PATCH", `/api/offers/${ids[0]}`, { cookie: a.cookie, body: { move: "down" } }), 200);
  listA = await listOffers(a.cookie);
  check("move swapped the first two", listA.map((o) => o.id).join() === [ids[1], ids[0], ids[2], ids[3]].join());

  const reversed = [...ids].reverse();
  expectStatus("full reorder → 200", await call("PATCH", "/api/offers/reorder", { cookie: a.cookie, body: { ids: reversed } }), 200);
  listA = await listOffers(a.cookie);
  check("reorder applied exactly", listA.map((o) => o.id).join() === reversed.join());
  check("sortOrder is contiguous 0..n-1", listA.every((o, i) => o.sortOrder === i));
  expectStatus("partial reorder → 400", await call("PATCH", "/api/offers/reorder", { cookie: a.cookie, body: { ids: reversed.slice(1) } }), 400);
  expectStatus("duplicate ids → 400", await call("PATCH", "/api/offers/reorder", { cookie: a.cookie, body: { ids: [ids[0], ids[0], ids[1], ids[2]] } }), 400);
  expectStatus("empty ids → 400", await call("PATCH", "/api/offers/reorder", { cookie: a.cookie, body: { ids: [] } }), 400);
  expectStatus("non-array ids → 400", await call("PATCH", "/api/offers/reorder", { cookie: a.cookie, body: { ids: "1,2" } }), 400);

  section("Tenant isolation (café B attacking café A)");
  const bOffer = (await call("POST", "/api/offers", { cookie: b.cookie, body: { title: tag("B own") } })).json?.data;
  const listB = await listOffers(b.cookie);
  check("café B sees only its own offer", listB.length === 1 && listB[0].id === bOffer?.id);
  expectStatus("B cannot edit A's offer → 404", await call("PATCH", `/api/offers/${liveId}`, { cookie: b.cookie, body: { title: "hijacked" } }), 404);
  expectStatus("B cannot unpublish A's offer → 404", await call("PATCH", `/api/offers/${liveId}`, { cookie: b.cookie, body: { isPublished: false } }), 404);
  // Both directions: one of them would be a legal move inside café A's list,
  // so only tenant scoping can make these fail.
  expectStatus("B cannot move A's offer up → 404", await call("PATCH", `/api/offers/${liveId}`, { cookie: b.cookie, body: { move: "up" } }), 404);
  expectStatus("B cannot move A's offer down → 404", await call("PATCH", `/api/offers/${liveId}`, { cookie: b.cookie, body: { move: "down" } }), 404);
  expectStatus("B cannot delete A's offer → 404", await call("DELETE", `/api/offers/${liveId}`, { cookie: b.cookie }), 404);
  expectStatus("B cannot reorder with A's ids → 404", await call("PATCH", "/api/offers/reorder", { cookie: b.cookie, body: { ids: [bOffer.id, liveId] } }), 404);
  expectStatus(
    "B cannot reorder A's list → 404",
    await call("PATCH", "/api/offers/reorder", { cookie: b.cookie, body: { ids: reversed } }),
    404,
  );
  const liveAfter = (await listOffers(a.cookie)).find((o) => o.id === liveId);
  check(
    "A's offer is unchanged after the attacks",
    liveAfter?.title === specs.live.title && liveAfter?.isPublished === true && liveAfter?.description === "Edited",
  );
  check("A's order is unchanged after the attacks", (await listOffers(a.cookie)).map((o) => o.id).join() === reversed.join());

  section("Dashboard page (café A)");
  const page = await call("GET", "/dashboard/offers", { cookie: a.cookie });
  check("/dashboard/offers renders → 200", page.status === 200, `got ${page.status}`);
  check("shows café A's offers", page.text.includes(specs.live.title));
  check("does not show café B's offers", !page.text.includes(tag("B own")));
  check("shows Live / Scheduled / Ended badges", ["Live", "Scheduled", "Ended"].every((label) => page.text.includes(`>${label}<`)));
  const overview = await call("GET", "/dashboard", { cookie: a.cookie });
  const overviewText = overview.text.replaceAll("<!-- -->", "");
  check("overview counts live offers (2 of 4)", overviewText.includes("2 of 4 live"));
  check("overview reports demo gallery for a café with none", overviewText.includes("Demo gallery"));

  section("Delete (café A)");
  expectStatus("delete → 200", await call("DELETE", `/api/offers/${created.ended.id}`, { cookie: a.cookie }), 200);
  expectStatus("delete again → 404", await call("DELETE", `/api/offers/${created.ended.id}`, { cookie: a.cookie }), 404);
  check("café A now lists 3 offers", (await listOffers(a.cookie)).length === 3);
  expectStatus("reorder with a deleted id → 404", await call("PATCH", "/api/offers/reorder", { cookie: a.cookie, body: { ids: reversed } }), 404);

  section(`Public homepage (café #${PUBLIC_CAFE_ID})`);
  const before = await call("GET", "/");
  check("homepage renders → 200", before.status === 200, `got ${before.status}`);

  const publicSpecs = {
    live: { title: tag("public live"), value: "Buy 1 get 1", endDate: "2099-12-31" },
    draft: { title: tag("public draft"), isPublished: false },
    scheduled: { title: tag("public scheduled"), startDate: "2099-01-01" },
    ended: { title: tag("public ended"), endDate: "2020-01-01" },
  };
  const inserted = await db
    .insert(offers)
    .values(Object.values(publicSpecs).map((spec, index) => ({ cafeId: PUBLIC_CAFE_ID, sortOrder: 10_000 + index, ...spec })))
    .returning({ id: offers.id });
  const insertedIds = inserted.map((row) => row.id);
  onCleanup(() => db.delete(offers).where(inArray(offers.id, insertedIds)));

  const home = await call("GET", "/");
  // React separates adjacent text nodes with <!-- --> in server HTML.
  home.text = home.text.replaceAll("<!-- -->", "");
  check("homepage still renders with offers → 200", home.status === 200);
  check("offers section is present", home.text.includes('id="offers"'));
  check("live offer is shown", home.text.includes(publicSpecs.live.title));
  check("offer value badge is shown", home.text.includes("Buy 1 get 1"));
  check("end date is shown", home.text.includes("Until 31 Dec 2099"));
  check("unpublished offer is hidden", !home.text.includes(publicSpecs.draft.title));
  check("scheduled offer is hidden", !home.text.includes(publicSpecs.scheduled.title));
  check("ended offer is hidden", !home.text.includes(publicSpecs.ended.title));
  check("other cafés' offers are never shown", !home.text.includes(specs.live.title) && !home.text.includes(tag("B own")));
}

await finish(main);
