/**
 * End-to-end check of table ordering and loyalty stamps against a running
 * dev server.
 *
 * Usage (with `npm run dev` already running):
 *   npm run test:orders
 *
 * Works only on two throwaway "[test] …" cafés, deleted afterwards.
 */
import { neon } from "@neondatabase/serverless";
import {
  BASE_URL,
  call,
  check,
  createTenant,
  expectStatus,
  finish,
  section,
  stopIfInterrupted,
  tag,
} from "./lib/harness.mjs";

const sql = neon(process.env.DATABASE_URL);
let ipCounter = 0;

/** Each scenario gets its own client address so rate limits stay predictable. */
function freshIp() {
  ipCounter += 1;
  return `203.0.113.${ipCounter}`;
}

async function placeOrder(body, ip = freshIp()) {
  stopIfInterrupted();
  const response = await fetch(`${BASE_URL}/api/public/orders`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Forwarded-For": ip },
    body: JSON.stringify(body),
  });
  return { status: response.status, json: await response.json().catch(() => null) };
}

async function seedMenu(cafeId) {
  const [category] = await sql.query(
    `INSERT INTO menu_categories (cafe_id, name) VALUES ($1, 'Coffee') RETURNING id`,
    [cafeId],
  );
  const items = await sql.query(
    `INSERT INTO menu_items (cafe_id, category_id, name, price, is_published, sort_order) VALUES
     ($1, $2, 'Latte', 249.50, true, 0),
     ($1, $2, 'Mocha', 199, true, 1),
     ($1, $2, 'Secret', 99, false, 2),
     ($1, $2, 'Unpriced', 0, true, 3)
     RETURNING id, name`,
    [cafeId, category.id],
  );
  return Object.fromEntries(items.map((row) => [row.name, row.id]));
}

async function main() {
  section("Unauthenticated staff routes");
  expectStatus("GET /api/orders → 401", await call("GET", "/api/orders"), 401);
  expectStatus("PATCH /api/orders/1 → 401", await call("PATCH", "/api/orders/1", { body: { status: "ready" } }), 401);
  expectStatus("GET /api/tables → 401", await call("GET", "/api/tables"), 401);
  expectStatus("POST /api/tables → 401", await call("POST", "/api/tables", { body: { label: "x" } }), 401);
  expectStatus("GET /api/loyalty → 401", await call("GET", "/api/loyalty?phone=9876543210"), 401);
  expectStatus("POST /api/loyalty/redeem → 401", await call("POST", "/api/loyalty/redeem", { body: { phone: "9876543210" } }), 401);

  const a = await createTenant("Orders A");
  const b = await createTenant("Orders B");
  const menuA = await seedMenu(a.cafeId);
  const menuB = await seedMenu(b.cafeId);

  section("Tables (café A)");
  expectStatus("blank table name → 400", await call("POST", "/api/tables", { cookie: a.cookie, body: { label: " " } }), 400);
  let result = await call("POST", "/api/tables", { cookie: a.cookie, body: { label: "Table 1" } });
  expectStatus("create table → 201", result, 201);
  const table = result.json?.data;
  check("table gets a long random QR token", /^[A-Za-z0-9_-]{24,}$/.test(table?.token ?? ""), table?.token);
  const counter = (await call("POST", "/api/tables", { cookie: a.cookie, body: { label: "Counter" } })).json?.data;
  const tableB = (await call("POST", "/api/tables", { cookie: b.cookie, body: { label: tag("B table") } })).json?.data;
  const listA = (await call("GET", "/api/tables", { cookie: a.cookie })).json?.data?.tables ?? [];
  check("café A lists only its own tables", listA.length === 2 && !listA.some((t) => t.id === tableB?.id));
  expectStatus("B cannot rename A's table → 404", await call("PATCH", `/api/tables/${table.id}`, { cookie: b.cookie, body: { label: "hijack" } }), 404);
  expectStatus("B cannot delete A's table → 404", await call("DELETE", `/api/tables/${table.id}`, { cookie: b.cookie }), 404);
  expectStatus("rename → 200", await call("PATCH", `/api/tables/${table.id}`, { cookie: a.cookie, body: { label: "Table 1 (window)" } }), 200);
  expectStatus("empty patch → 400", await call("PATCH", `/api/tables/${table.id}`, { cookie: a.cookie, body: {} }), 400);

  section("Placing orders: refusals");
  const good = { tableToken: table.token, items: [{ menuItemId: menuA.Latte, quantity: 1 }], customerName: "Asha" };
  expectStatus("malformed token → 400", await placeOrder({ ...good, tableToken: "x" }), 400);
  expectStatus("unknown table → 404", await placeOrder({ ...good, tableToken: "Z".repeat(24) }), 404);
  expectStatus("empty order → 400", await placeOrder({ ...good, items: [] }), 400);
  expectStatus("missing name → 400", await placeOrder({ ...good, customerName: "  " }), 400);
  expectStatus("quantity 0 → 400", await placeOrder({ ...good, items: [{ menuItemId: menuA.Latte, quantity: 0 }] }), 400);
  expectStatus("fractional quantity → 400", await placeOrder({ ...good, items: [{ menuItemId: menuA.Latte, quantity: 1.5 }] }), 400);
  expectStatus(
    "over 20 of one dish (split across lines) → 400",
    await placeOrder({ ...good, items: [{ menuItemId: menuA.Latte, quantity: 15 }, { menuItemId: menuA.Latte, quantity: 6 }] }),
    400,
  );
  expectStatus("another café's dish → 409", await placeOrder({ ...good, items: [{ menuItemId: menuB.Latte, quantity: 1 }] }), 409);
  expectStatus("hidden dish → 409", await placeOrder({ ...good, items: [{ menuItemId: menuA.Secret, quantity: 1 }] }), 409);
  expectStatus("zero-priced placeholder dish → 409", await placeOrder({ ...good, items: [{ menuItemId: menuA.Unpriced, quantity: 1 }] }), 409);
  expectStatus("loyalty with an invalid phone → 400", await placeOrder({ ...good, loyalty: true, customerPhone: "12345" }), 400);
  check("no order was created by any refusal", (await sql.query(`SELECT count(*)::int AS n FROM orders WHERE cafe_id = $1`, [a.cafeId]))[0].n === 0);

  section("Placing an order");
  result = await placeOrder({
    tableToken: table.token,
    items: [
      { menuItemId: menuA.Latte, quantity: 2, price: 1, name: "Free latte" },
      { menuItemId: menuA.Mocha, quantity: 1 },
      { menuItemId: menuA.Latte, quantity: 1 },
    ],
    customerName: "  Asha  ",
    loyalty: true,
    customerPhone: "098765 43210",
    note: "Less sugar",
    total: 1,
  });
  expectStatus("valid order → 201", result, 201);
  const order = result.json?.data;
  check("order number and private token returned", order?.number > 1000 && /^[A-Za-z0-9_-]{24,}$/.test(order?.token ?? ""));

  const status = await call("GET", `/api/public/orders/${order.token}`);
  expectStatus("status page → 200", status, 200);
  const view = status.json?.data;
  check("prices come from the menu, not the browser (3 × 249.50 + 199 = ₹947.50)", view?.totalPaise === 94750, String(view?.totalPaise));
  check("repeated dishes merged into one line", view?.lines?.length === 2 && view.lines.find((l) => l.name === "Latte")?.quantity === 3, JSON.stringify(view?.lines));
  check("name trimmed, table label copied", view?.customerName === "Asha" && view?.tableLabel === "Table 1 (window)");
  check("status starts as received", view?.status === "received");
  check("status page never shows the full phone number", !status.text.includes("9876543210") && view?.loyalty?.phone === "3210", status.text.slice(0, 300));
  expectStatus("unknown order token → 404", await call("GET", `/api/public/orders/${"Z".repeat(24)}`), 404);
  const [stored] = await sql.query(`SELECT customer_phone, client_hash FROM orders WHERE public_token = $1`, [order.token]);
  check("phone stored normalized (91 + 10 digits)", stored?.customer_phone === "919876543210");
  check("client address stored only as a hash", /^[0-9a-f]{64}$/.test(stored?.client_hash ?? "") && !stored.client_hash.includes("203.0.113"));

  section("Staff orders screen");
  const staffA = (await call("GET", "/api/orders", { cookie: a.cookie })).json?.data?.orders ?? [];
  const staffB = (await call("GET", "/api/orders", { cookie: b.cookie })).json?.data?.orders ?? [];
  const mine = staffA.find((o) => o.number === order.number);
  check("café A sees the order with items and note", mine?.lines?.length === 2 && mine?.note === "Less sugar");
  check("café B does not see café A's order", !staffB.some((o) => o.number === order.number));
  const orderId = mine?.id;
  expectStatus("B cannot update A's order → 404", await call("PATCH", `/api/orders/${orderId}`, { cookie: b.cookie, body: { status: "ready" } }), 404);
  expectStatus("invalid status → 400", await call("PATCH", `/api/orders/${orderId}`, { cookie: a.cookie, body: { status: "eaten" } }), 400);
  expectStatus("same status again → 409", await call("PATCH", `/api/orders/${orderId}`, { cookie: a.cookie, body: { status: "received" } }), 409);
  expectStatus("received → preparing", await call("PATCH", `/api/orders/${orderId}`, { cookie: a.cookie, body: { status: "preparing" } }), 200);
  expectStatus("cannot go back to received → 409", await call("PATCH", `/api/orders/${orderId}`, { cookie: a.cookie, body: { status: "received" } }), 409);
  expectStatus("preparing → ready", await call("PATCH", `/api/orders/${orderId}`, { cookie: a.cookie, body: { status: "ready" } }), 200);
  check("customer sees 'ready'", (await call("GET", `/api/public/orders/${order.token}`)).json?.data?.status === "ready");

  const [first, second] = await Promise.all([
    call("PATCH", `/api/orders/${orderId}`, { cookie: a.cookie, body: { status: "completed" } }),
    call("PATCH", `/api/orders/${orderId}`, { cookie: a.cookie, body: { status: "completed" } }),
  ]);
  check("two simultaneous 'completed' taps: exactly one succeeds", [first.status, second.status].sort().join() === "200,409", `${first.status},${second.status}`);
  expectStatus("completed is final → 409", await call("PATCH", `/api/orders/${orderId}`, { cookie: a.cookie, body: { status: "cancelled" } }), 409);

  section("Loyalty stamps");
  let card = (await call("GET", "/api/loyalty?phone=98765 43210", { cookie: a.cookie })).json?.data;
  check("completing the order earned exactly 1 stamp", card?.stamps === 1, JSON.stringify(card));
  check("customer's status page shows the stamp", (await call("GET", `/api/public/orders/${order.token}`)).json?.data?.loyalty?.stamps === 1);
  const cardB = (await call("GET", "/api/loyalty?phone=9876543210", { cookie: b.cookie })).json?.data;
  check("stamps are per café (café B sees 0 for the same number)", cardB?.stamps === 0);
  expectStatus("invalid phone lookup → 400", await call("GET", "/api/loyalty?phone=123", { cookie: a.cookie }), 400);
  expectStatus("no reward yet → 409", await call("POST", "/api/loyalty/redeem", { cookie: a.cookie, body: { phone: "9876543210" } }), 409);
  await sql.query(`UPDATE loyalty_cards SET stamps = 10 WHERE cafe_id = $1 AND phone = '919876543210'`, [a.cafeId]);
  result = await call("POST", "/api/loyalty/redeem", { cookie: a.cookie, body: { phone: "+91 98765-43210" } });
  check("10 stamps → reward redeemed", result.status === 200 && result.json?.data?.rewardsRedeemed === 1 && result.json?.data?.rewardsAvailable === 0, JSON.stringify(result.json));
  expectStatus("redeeming again → 409", await call("POST", "/api/loyalty/redeem", { cookie: a.cookie, body: { phone: "9876543210" } }), 409);
  expectStatus("B cannot redeem A's reward → 409", await call("POST", "/api/loyalty/redeem", { cookie: b.cookie, body: { phone: "9876543210" } }), 409);

  section("Cancelling");
  const cancelOrder = (await placeOrder({ ...good, customerName: "Ravi", loyalty: true, customerPhone: "9123456789" })).json?.data;
  const cancelId = ((await call("GET", "/api/orders", { cookie: a.cookie })).json?.data?.orders ?? []).find((o) => o.number === cancelOrder?.number)?.id;
  expectStatus("cancel an active order → 200", await call("PATCH", `/api/orders/${cancelId}`, { cookie: a.cookie, body: { status: "cancelled" } }), 200);
  expectStatus("cancelled is final → 409", await call("PATCH", `/api/orders/${cancelId}`, { cookie: a.cookie, body: { status: "completed" } }), 409);
  check("a cancelled order earns no stamp", (await call("GET", "/api/loyalty?phone=9123456789", { cookie: a.cookie })).json?.data?.stamps === 0);

  section("QR codes and table changes");
  const oldToken = counter.token;
  const renewed = (await call("PATCH", `/api/tables/${counter.id}`, { cookie: a.cookie, body: { newToken: true } })).json?.data;
  check("new QR code gives a new token", renewed?.token && renewed.token !== oldToken);
  expectStatus("the old QR code stops working → 404", await placeOrder({ ...good, tableToken: oldToken }), 404);
  expectStatus("the new QR code works → 201", await placeOrder({ ...good, tableToken: renewed.token }), 201);
  await call("PATCH", `/api/tables/${counter.id}`, { cookie: a.cookie, body: { isActive: false } });
  expectStatus("a switched-off table cannot order → 404", await placeOrder({ ...good, tableToken: renewed.token }), 404);
  expectStatus("café B's table cannot order café A's dishes → 409", await placeOrder({ ...good, tableToken: tableB.token }), 409);

  section("Spam protection");
  const ip = freshIp();
  const statuses = [];
  for (let i = 0; i < 7; i += 1) statuses.push((await placeOrder({ ...good, customerName: `Spam ${i}` }, ip)).status);
  check("one client is limited to 6 orders in 10 minutes", statuses.slice(0, 6).every((s) => s === 201) && statuses[6] === 429, statuses.join(","));
  const perTable = [];
  for (let i = 0; i < 3; i += 1) perTable.push((await placeOrder({ ...good, customerName: `Busy ${i}` })).status);
  check("one table is limited to 8 orders in 10 minutes", perTable.includes(429), perTable.join(","));

  section("Deleting a table keeps its order history");
  expectStatus("delete table → 200", await call("DELETE", `/api/tables/${table.id}`, { cookie: a.cookie }), 200);
  const history = (await call("GET", "/api/orders", { cookie: a.cookie })).json?.data?.orders ?? [];
  check("past orders still show their table name", history.find((o) => o.number === order.number)?.tableLabel === "Table 1 (window)");
}

await finish(main);
