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
  run,
  section,
  stopIfInterrupted,
  tag,
} from "./lib/harness.mjs";

const sql = neon(process.env.DATABASE_URL);
let ipCounter = 0;
let deviceCounter = 0;

/** Each order gets its own network address and phone id unless a test sets them, so limits stay predictable. */
function freshIp() {
  ipCounter += 1;
  return `203.0.${Math.floor(ipCounter / 250)}.${ipCounter % 250}`;
}

function freshDevice() {
  deviceCounter += 1;
  return `test-device-${run}-${deviceCounter}`;
}

async function placeOrder(body, { ip = freshIp(), device = freshDevice() } = {}) {
  stopIfInterrupted();
  const response = await fetch(`${BASE_URL}/api/public/orders`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Forwarded-For": ip },
    body: JSON.stringify({ deviceId: device, ...body }),
  });
  return { status: response.status, json: await response.json().catch(() => null) };
}

const countOrders = async (cafeId) =>
  (await sql.query(`SELECT count(*)::int AS n FROM orders WHERE cafe_id = $1`, [cafeId]))[0].n;

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
     ($1, $2, 'Unpriced', 0, true, 3),
     ($1, $2, 'Gold', 2000000, true, 4)
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
  expectStatus("POST /api/loyalty → 401", await call("POST", "/api/loyalty", { body: { phone: "9876543210" } }), 401);
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
  expectStatus("malformed retry key → 400", await placeOrder({ ...good, idempotencyKey: "bad key!" }), 400);
  expectStatus("malformed phone id → 400", await placeOrder({ ...good, deviceId: "x" }), 400);
  expectStatus("an order without the app's phone id → 400", await placeOrder({ ...good, deviceId: undefined }), 400);
  result = await placeOrder({ ...good, items: [{ menuItemId: menuA.Gold, quantity: 1 }] });
  check("an absurdly large order is refused with a clear message (400)", result.status === 400 && /too large/.test(result.json?.message ?? ""), JSON.stringify(result.json));
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
  check("private token returned", /^[A-Za-z0-9_-]{24,}$/.test(order?.token ?? ""));
  check("the café's first order of the day is #1", order?.number === 1, String(order?.number));

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
  check("client address stored only as a hash", /^[0-9a-f]{64}$/.test(stored?.client_hash ?? "") && !stored.client_hash.includes("203.0."));
  const [storedDevice] = await sql.query(`SELECT device_hash FROM orders WHERE public_token = $1`, [order.token]);
  check("phone id stored only as a hash", /^[0-9a-f]{64}$/.test(storedDevice?.device_hash ?? "") && !storedDevice.device_hash.includes("test-device"));
  check("before collection, the order shows no stamp totals", view?.loyalty?.card === null, JSON.stringify(view?.loyalty));

  section("Order numbers and retries");
  const next = await placeOrder({ ...good, customerName: "Neha" });
  check("numbers count up within the day (#2)", next.json?.data?.number === 2, JSON.stringify(next.json));
  const firstB = await placeOrder({ ...good, tableToken: tableB.token, items: [{ menuItemId: menuB.Latte, quantity: 1 }] });
  check("each café has its own numbers (café B starts at #1)", firstB.json?.data?.number === 1, JSON.stringify(firstB.json));
  const retryKey = `retry-key-${run}-0001`;
  const before = await countOrders(a.cafeId);
  const attempt = await placeOrder({ ...good, customerName: "Kiran", idempotencyKey: retryKey });
  // The phone moved from Wi-Fi to mobile data before retrying: new address, same key.
  const retried = await placeOrder({ ...good, customerName: "Kiran", idempotencyKey: retryKey });
  check(
    "a retry with the same key gets the original order back",
    attempt.status === 201 && retried.status === 201 && retried.json?.data?.token === attempt.json?.data?.token,
    `${attempt.status} ${retried.status}`,
  );
  check("…and no second order is created", (await countOrders(a.cafeId)) === before + 1);
  const burstKey = `retry-key-${run}-0002`;
  const burst = await Promise.all(
    Array.from({ length: 5 }, () => placeOrder({ ...good, customerName: "Tapper", idempotencyKey: burstKey })),
  );
  const burstTokens = new Set(burst.map((r) => r.json?.data?.token));
  check(
    "five simultaneous taps with one key: one order, the same answer for all",
    burst.every((r) => r.status === 201) && burstTokens.size === 1 && (await countOrders(a.cafeId)) === before + 2,
    burst.map((r) => r.status).join(","),
  );

  const changedKey = `retry-key-${run}-0003`;
  const firstTry = (await placeOrder({ ...good, customerName: "Mira", idempotencyKey: changedKey })).json?.data;
  // The response was lost; the customer added a second latte, then tried again.
  const changed = await placeOrder({
    ...good,
    customerName: "Mira",
    idempotencyKey: changedKey,
    items: [{ menuItemId: menuA.Latte, quantity: 2 }],
  });
  check(
    "a retry with changed contents is not silently swapped: 409 pointing at the order that went through",
    changed.status === 409 && changed.json?.data?.token === firstTry?.token && /already went through/.test(changed.json?.message ?? ""),
    JSON.stringify(changed.json),
  );
  check("…and nothing new is created", (await countOrders(a.cafeId)) === before + 3);

  const lateTable = (await call("POST", "/api/tables", { cookie: a.cookie, body: { label: "Late retry" } })).json?.data;
  const lateKey = `retry-key-${run}-0004`;
  const lateFirst = (await placeOrder({ ...good, tableToken: lateTable.token, customerName: "Om", idempotencyKey: lateKey })).json?.data;
  await call("PATCH", `/api/tables/${lateTable.id}`, { cookie: a.cookie, body: { isActive: false } });
  const lateRetry = await placeOrder({ ...good, tableToken: lateTable.token, customerName: "Om", idempotencyKey: lateKey });
  check(
    "a retry still gets its order back after staff switched the table off",
    lateRetry.status === 201 && lateRetry.json?.data?.token === lateFirst?.token,
    `${lateRetry.status} ${JSON.stringify(lateRetry.json)}`,
  );

  section("Unverified loyalty numbers");
  await sql.query(`INSERT INTO loyalty_cards (cafe_id, phone, stamps) VALUES ($1, '919800000001', 7)`, [a.cafeId]);
  const snoop = (await placeOrder({ ...good, customerName: "Snoop", loyalty: true, customerPhone: "9800000001" })).json?.data;
  const snoopView = (await call("GET", `/api/public/orders/${snoop?.token}`)).json?.data;
  check("typing a regular's number into an order reveals nothing about their card", snoopView?.loyalty?.card === null && snoopView?.loyalty?.phone === "0001", JSON.stringify(snoopView?.loyalty));

  section("Staff orders screen");
  const staffA = (await call("GET", "/api/orders", { cookie: a.cookie })).json?.data?.orders ?? [];
  const staffB = (await call("GET", "/api/orders", { cookie: b.cookie })).json?.data?.orders ?? [];
  const mine = staffA.find((o) => o.number === order.number);
  check("café A sees the order with items and note", mine?.lines?.length === 2 && mine?.note === "Less sugar");
  // Numbers are per café (both cafés have an order #1 today), so compare ids.
  check("café B does not see café A's order", Boolean(mine) && !staffB.some((o) => o.id === mine.id));
  const orderId = mine?.id;
  expectStatus("B cannot update A's order → 404", await call("PATCH", `/api/orders/${orderId}`, { cookie: b.cookie, body: { status: "ready" } }), 404);
  expectStatus("invalid status → 400", await call("PATCH", `/api/orders/${orderId}`, { cookie: a.cookie, body: { status: "eaten" } }), 400);
  expectStatus("same status again → 409", await call("PATCH", `/api/orders/${orderId}`, { cookie: a.cookie, body: { status: "received" } }), 409);
  expectStatus("received → preparing", await call("PATCH", `/api/orders/${orderId}`, { cookie: a.cookie, body: { status: "preparing" } }), 200);
  expectStatus("cannot go back to received → 409", await call("PATCH", `/api/orders/${orderId}`, { cookie: a.cookie, body: { status: "received" } }), 409);
  expectStatus("preparing → ready", await call("PATCH", `/api/orders/${orderId}`, { cookie: a.cookie, body: { status: "ready" } }), 200);
  check("customer sees 'ready'", (await call("GET", `/api/public/orders/${order.token}`)).json?.data?.status === "ready");
  check("still no stamp totals while waiting at the counter", (await call("GET", `/api/public/orders/${order.token}`)).json?.data?.loyalty?.card === null);

  const [first, second] = await Promise.all([
    call("PATCH", `/api/orders/${orderId}`, { cookie: a.cookie, body: { status: "completed" } }),
    call("PATCH", `/api/orders/${orderId}`, { cookie: a.cookie, body: { status: "completed" } }),
  ]);
  check("two simultaneous 'completed' taps: exactly one succeeds", [first.status, second.status].sort().join() === "200,409", `${first.status},${second.status}`);
  expectStatus("completed is final → 409", await call("PATCH", `/api/orders/${orderId}`, { cookie: a.cookie, body: { status: "cancelled" } }), 409);
  const today = (await call("GET", "/api/orders", { cookie: a.cookie })).json?.data?.today;
  check("today's totals count the collected order (₹947.50)", today?.collected === 1 && today?.collectedPaise === 94750, JSON.stringify(today));

  const raceOrder = (await placeOrder({ ...good, customerName: "Race" })).json?.data;
  const raceId = ((await call("GET", "/api/orders", { cookie: a.cookie })).json?.data?.orders ?? []).find((o) => o.number === raceOrder?.number)?.id;
  await call("PATCH", `/api/orders/${raceId}`, { cookie: a.cookie, body: { status: "preparing" } });
  const race = await Promise.all([
    call("PATCH", `/api/orders/${raceId}`, { cookie: a.cookie, body: { status: "completed" } }),
    call("PATCH", `/api/orders/${raceId}`, { cookie: a.cookie, body: { status: "cancelled" } }),
  ]);
  const winner = race[0].status === 200 ? "completed" : "cancelled";
  const loser = race.find((r) => r.status === 409);
  check(
    "two staff, two different buttons: one wins, the other is told the order's real status",
    race.filter((r) => r.status === 200).length === 1 && loser?.json?.message?.toLowerCase().includes(winner),
    `${race.map((r) => r.status)} ${loser?.json?.message}`,
  );

  section("Loyalty stamps");
  let card = (await call("POST", "/api/loyalty", { body: { phone: "98765 43210" }, cookie: a.cookie })).json?.data;
  check("completing the order earned exactly 1 stamp", card?.stamps === 1, JSON.stringify(card));
  check("once collected, the customer's status page shows the card", (await call("GET", `/api/public/orders/${order.token}`)).json?.data?.loyalty?.card?.stamps === 1);
  const cardB = (await call("POST", "/api/loyalty", { body: { phone: "9876543210" }, cookie: b.cookie })).json?.data;
  check("stamps are per café (café B sees 0 for the same number)", cardB?.stamps === 0);
  expectStatus("invalid phone lookup → 400", await call("POST", "/api/loyalty", { body: { phone: "123" }, cookie: a.cookie }), 400);
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
  check("a cancelled order earns no stamp", (await call("POST", "/api/loyalty", { body: { phone: "9123456789" }, cookie: a.cookie })).json?.data?.stamps === 0);

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
  const newTable = async (label) => (await call("POST", "/api/tables", { cookie: a.cookie, body: { label } })).json?.data;
  const deviceTable = await newTable("Device test");
  const device = freshDevice();
  const deviceRuns = [];
  for (let i = 0; i < 7; i += 1) {
    deviceRuns.push(await placeOrder({ ...good, tableToken: deviceTable.token, customerName: `Spam ${i}` }, { device }));
  }
  check(
    "one phone is limited to 6 orders in 10 minutes, even from different networks",
    deviceRuns.slice(0, 6).every((r) => r.status === 201) && deviceRuns[6].status === 429 && /several orders/.test(deviceRuns[6].json?.message ?? ""),
    deviceRuns.map((r) => r.status).join(","),
  );

  // A rush at a shared "Counter" QR: 25 phones order at the same moment.
  // MAX_ORDERS_PER_TABLE = 15 and MAX_ORDERS_PER_NETWORK = 30 in src/app/db/orders.ts.
  const rushTable = await newTable("Rush counter");
  const rush = await Promise.all(
    Array.from({ length: 25 }, (_, i) => placeOrder({ ...good, tableToken: rushTable.token, customerName: `Rush ${i}` })),
  );
  const rushOk = rush.filter((r) => r.status === 201).length;
  const rushLimited = rush.filter((r) => r.status === 429 && /This table/.test(r.json?.message ?? "")).length;
  check("a table takes 15 orders in 10 minutes, even when 25 arrive at once", rushOk === 15 && rushLimited === 10, `${rushOk} ok, ${rushLimited} limited`);

  // Someone floods a table with fake orders: staff cancel them and the
  // table takes real orders again straight away.
  const rushNumbers = new Set(rush.filter((r) => r.status === 201).map((r) => r.json?.data?.number));
  const rushIds = ((await call("GET", "/api/orders", { cookie: a.cookie })).json?.data?.orders ?? [])
    .filter((o) => o.tableLabel === rushTable.label && rushNumbers.has(o.number))
    .map((o) => o.id);
  const cancelled = [];
  for (const id of rushIds.slice(0, 2)) {
    cancelled.push((await call("PATCH", `/api/orders/${id}`, { cookie: a.cookie, body: { status: "cancelled" } })).status);
  }
  check("staff can cancel the fake orders", cancelled.length === 2 && cancelled.every((s) => s === 200), cancelled.join(","));
  const afterCancel = await placeOrder({ ...good, tableToken: rushTable.token, customerName: "Real customer" });
  check("…and a real customer at that table can order again", afterCancel.status === 201, `${afterCancel.status}`);

  // The café's Wi-Fi: many phones, one internet address.
  const wifi = freshIp();
  const wifiTables = [await newTable("Wi-Fi 1"), await newTable("Wi-Fi 2"), await newTable("Wi-Fi 3")];
  const wifiRuns = [];
  for (let start = 0; start < 31; start += 10) {
    const batch = Array.from({ length: Math.min(10, 31 - start) }, (_, j) => start + j);
    wifiRuns.push(
      ...(await Promise.all(
        batch.map((i) => placeOrder({ ...good, tableToken: wifiTables[i % 3].token, customerName: `Guest ${i}` }, { ip: wifi })),
      )),
    );
  }
  const wifiOk = wifiRuns.filter((r) => r.status === 201).length;
  check("customers sharing the café's Wi-Fi can place 30 orders in 10 minutes", wifiOk === 30, `${wifiOk} ok`);
  check(
    "…and the 31st from that network is held back with a clear message",
    wifiRuns.filter((r) => r.status === 429).length === 1 && wifiRuns.some((r) => /Lots of orders/.test(r.json?.message ?? "")),
    wifiRuns.map((r) => r.status).join(","),
  );

  section("Deleting a table keeps its order history");
  expectStatus("delete table → 200", await call("DELETE", `/api/tables/${table.id}`, { cookie: a.cookie }), 200);
  const history = (await call("GET", "/api/orders", { cookie: a.cookie })).json?.data?.orders ?? [];
  check("past orders still show their table name", history.find((o) => o.number === order.number)?.tableLabel === "Table 1 (window)");
}

await finish(main);
