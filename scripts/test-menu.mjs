/**
 * End-to-end check of menu management against a running dev server.
 *
 * Usage (with `npm run dev` already running):
 *   npm run test:menu
 *   node --env-file=.env.local scripts/test-menu.mjs [baseUrl]
 *
 * Works only on two throwaway "[test] …" cafés, which are deleted afterwards.
 * Café #1's real menu is never touched.
 */
import {
  call,
  check,
  createTenant,
  expectStatus,
  finish,
  section,
  tag,
} from "./lib/harness.mjs";

const ALLOWED_IMAGE = "https://images.unsplash.com/photo-1495474472287-4d71bcdd2085?w=800";

async function getMenu(cookie) {
  const result = await call("GET", "/api/menu", { cookie });
  return result.json?.data?.categories ?? [];
}

async function main() {
  section("Unauthenticated");
  expectStatus("GET /api/menu → 401", await call("GET", "/api/menu"), 401);
  expectStatus("POST /api/menu/categories → 401", await call("POST", "/api/menu/categories", { body: { name: "x" } }), 401);
  expectStatus("POST /api/menu/items → 401", await call("POST", "/api/menu/items", { body: { name: "x" } }), 401);
  expectStatus("PATCH /api/menu/items/1 → 401", await call("PATCH", "/api/menu/items/1", { body: { name: "x" } }), 401);
  expectStatus("DELETE /api/menu/categories/1 → 401", await call("DELETE", "/api/menu/categories/1"), 401);

  const a = await createTenant("Menu A");
  const b = await createTenant("Menu B");

  section("Categories (café A)");
  expectStatus("rejects blank category name → 400", await call("POST", "/api/menu/categories", { cookie: a.cookie, body: { name: "  " } }), 400);
  const coffee = (await call("POST", "/api/menu/categories", { cookie: a.cookie, body: { name: tag("Coffee") } })).json?.data;
  const food = (await call("POST", "/api/menu/categories", { cookie: a.cookie, body: { name: tag("Food") } })).json?.data;
  check("creates two categories", Boolean(coffee?.id && food?.id));

  section("Item validation (café A)");
  const base = { categoryId: coffee.id, name: tag("Latte"), price: "220" };
  const invalidItems = [
    ["missing name", { ...base, name: "" }],
    ["bad price", { ...base, price: "abc" }],
    ["negative price", { ...base, price: "-5" }],
    ["three decimal places", { ...base, price: "2.555" }],
    ["image host not allowed", { ...base, imageUrl: "https://evil.example.com/latte.jpg" }],
    ["javascript: image URL", { ...base, imageUrl: "javascript:alert(1)" }],
    ["data: image URL", { ...base, imageUrl: "data:image/png;base64,AAAA" }],
    ["malformed image URL", { ...base, imageUrl: "not a url" }],
  ];
  for (const [label, body] of invalidItems) {
    expectStatus(`rejects ${label} → 400`, await call("POST", "/api/menu/items", { cookie: a.cookie, body }), 400);
  }
  const hostError = await call("POST", "/api/menu/items", { cookie: a.cookie, body: invalidItems[4][1] });
  check("host error names the allowed host", (hostError.json?.message ?? "").includes("images.unsplash.com"));

  section("Items (café A)");
  let result = await call("POST", "/api/menu/items", { cookie: a.cookie, body: { ...base, price: "₹1,240.50", imageUrl: ALLOWED_IMAGE } });
  expectStatus("creates item with allowed image → 201", result, 201);
  const httpItem = await call("POST", "/api/menu/items", { cookie: a.cookie, body: { ...base, name: tag("Http image"), imageUrl: ALLOWED_IMAGE.replace("https:", "http:") } });
  check("http image link is upgraded to https", httpItem.status === 201 && httpItem.json?.data?.imageUrl === ALLOWED_IMAGE, httpItem.json?.data?.imageUrl);
  if (httpItem.json?.data?.id) await call("DELETE", `/api/menu/items/${httpItem.json.data.id}`, { cookie: a.cookie });
  const latte = result.json?.data;
  check("price is normalised to 1240.50", latte?.price === "1240.50");
  check("image URL is stored", latte?.imageUrl === ALLOWED_IMAGE);
  const mocha = (await call("POST", "/api/menu/items", { cookie: a.cookie, body: { ...base, name: tag("Mocha") } })).json?.data;

  result = await call("PATCH", `/api/menu/items/${latte.id}`, { cookie: a.cookie, body: { imageUrl: "https://evil.example.com/x.jpg" } });
  expectStatus("rejects disallowed image on edit → 400", result, 400);
  result = await call("PATCH", `/api/menu/items/${latte.id}`, { cookie: a.cookie, body: { imageUrl: "" } });
  check("clearing the image stores null", result.status === 200 && result.json?.data?.imageUrl === null);
  result = await call("PATCH", `/api/menu/items/${latte.id}`, { cookie: a.cookie, body: { isPublished: false } });
  check("unpublish → 200", result.status === 200 && result.json?.data?.isPublished === false);
  expectStatus("move first item up → 400", await call("PATCH", `/api/menu/items/${latte.id}`, { cookie: a.cookie, body: { move: "up" } }), 400);
  expectStatus("moving an unknown item → 404", await call("PATCH", "/api/menu/items/2147483000", { cookie: a.cookie, body: { move: "up" } }), 404);
  expectStatus("move first item down → 200", await call("PATCH", `/api/menu/items/${latte.id}`, { cookie: a.cookie, body: { move: "down" } }), 200);
  const coffeeItems = (await getMenu(a.cookie)).find((c) => c.id === coffee.id)?.items ?? [];
  check("move swapped the items", coffeeItems.map((i) => i.id).join() === [mocha.id, latte.id].join());
  result = await call("PATCH", `/api/menu/items/${mocha.id}`, { cookie: a.cookie, body: { categoryId: food.id } });
  check("moves item to another own category", result.status === 200 && result.json?.data?.categoryId === food.id);

  section("Tenant isolation (café B attacking café A)");
  const bCat = (await call("POST", "/api/menu/categories", { cookie: b.cookie, body: { name: tag("B drinks") } })).json?.data;
  const bItem = (await call("POST", "/api/menu/items", { cookie: b.cookie, body: { categoryId: bCat.id, name: tag("B tea"), price: "90" } })).json?.data;
  const bMenu = await getMenu(b.cookie);
  check("café B sees only its own menu", bMenu.length === 1 && bMenu[0].id === bCat.id);
  expectStatus("B cannot add an item to A's category → 404", await call("POST", "/api/menu/items", { cookie: b.cookie, body: { categoryId: coffee.id, name: "x", price: "1" } }), 404);
  expectStatus("B cannot move its item into A's category → 404", await call("PATCH", `/api/menu/items/${bItem.id}`, { cookie: b.cookie, body: { categoryId: coffee.id } }), 404);
  expectStatus("B cannot edit A's item → 404", await call("PATCH", `/api/menu/items/${latte.id}`, { cookie: b.cookie, body: { name: "hijacked" } }), 404);
  expectStatus("B cannot move A's item up → 404", await call("PATCH", `/api/menu/items/${latte.id}`, { cookie: b.cookie, body: { move: "up" } }), 404);
  expectStatus("B cannot move A's item down → 404", await call("PATCH", `/api/menu/items/${latte.id}`, { cookie: b.cookie, body: { move: "down" } }), 404);
  // A has two categories, so "down" on the first would be legal for A itself.
  expectStatus("B cannot move A's category → 404", await call("PATCH", `/api/menu/categories/${coffee.id}`, { cookie: b.cookie, body: { move: "down" } }), 404);
  expectStatus("B cannot delete A's item → 404", await call("DELETE", `/api/menu/items/${latte.id}`, { cookie: b.cookie }), 404);
  expectStatus("B cannot rename A's category → 404", await call("PATCH", `/api/menu/categories/${coffee.id}`, { cookie: b.cookie, body: { name: "hijacked" } }), 404);
  expectStatus("B cannot delete A's category → 404", await call("DELETE", `/api/menu/categories/${coffee.id}`, { cookie: b.cookie }), 404);
  const aMenu = await getMenu(a.cookie);
  const aLatte = aMenu.flatMap((c) => c.items).find((i) => i.id === latte.id);
  check("A's menu is unchanged after the attacks", aMenu.length === 2 && aLatte?.name === base.name && aMenu[0].name === tag("Coffee"));

  section("Dashboard page (café A)");
  const page = await call("GET", "/dashboard/menu", { cookie: a.cookie });
  check("/dashboard/menu renders → 200", page.status === 200, `got ${page.status}`);
  check("shows café A's items", page.text.includes(base.name));
  check("does not show café B's items", !page.text.includes(tag("B tea")));

  section("Deleting (café A)");
  expectStatus("category with items cannot be deleted → 409", await call("DELETE", `/api/menu/categories/${coffee.id}`, { cookie: a.cookie }), 409);
  expectStatus("delete item → 200", await call("DELETE", `/api/menu/items/${latte.id}`, { cookie: a.cookie }), 200);
  expectStatus("delete item again → 404", await call("DELETE", `/api/menu/items/${latte.id}`, { cookie: a.cookie }), 404);
  expectStatus("empty category can be deleted → 200", await call("DELETE", `/api/menu/categories/${coffee.id}`, { cookie: a.cookie }), 200);
}

await finish(main);
