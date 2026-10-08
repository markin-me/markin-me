"use strict";

// Run manually: node --test scripts/shop-order-details.test.js
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const http = require("node:http");
const { once } = require("node:events");
const { WebSocket } = require("ws");
const { createOrdersEventsHub } = require("../api/ordersEvents");
const { createStockWebSocketHub, createOrdersWebSocketHub } = require("../services/stock-websocket");

const source = fs.readFileSync(path.join(__dirname, "..", "static", "js", "shop-late.js"), "utf8");
function loadOrderView(document = { querySelectorAll: () => [] }) {
  const start = source.indexOf("  const shopOrderSnapshots = new Map();");
  const end = source.indexOf("  function renderOrderSummaryBlock(order)", start);
  assert.ok(start >= 0 && end > start);
  const context = {
    window: {}, document,
    sortRepeatOrderItemsForDisplay: (items) => items,
    money: (amount) => `${Number(amount || 0)} ₽`,
    buildCanonicalOrderSummaryData: (order) => ({
      orderTotal: Number(order.total_price || 0),
      deliveryCost: Number(order.delivery_cost || 0),
      discountAmount: Number(order.discount_amount || 0),
      subtotalBeforeDiscounts: Number(order.total_price || 0) - Number(order.delivery_cost || 0) + Number(order.discount_amount || 0),
    }),
  };
  vm.createContext(context);
  const core = fs.readFileSync(path.join(__dirname, "..", "static", "js", "shop-core.js"), "utf8");
  const progressStart = core.indexOf("  function normalizeCustomerOrderStatus(");
  const progressEnd = core.indexOf("  function buildHomeActiveOrderCardHtml(", progressStart);
  assert.ok(progressStart >= 0 && progressEnd > progressStart);
  vm.runInContext(core.slice(progressStart, progressEnd), context);
  vm.runInContext(source.slice(start, end), context);
  return { derive: context.window.deriveCustomerOrderView, patch: context.patchShopOrderDetails, context };
}

test("customer route covers each method and actual/legacy status codes", () => {
  const { derive } = loadOrderView();
  const codes = {
    new: "accepted", accepted: "accepted", cooking: "cooking", preparing: "cooking",
    ready: "packed", packed: "packed", on_the_way: "courier", in_transit: "courier", courier: "courier",
    delivered: "completed", received: "completed", completed: "completed", done: "completed",
    canceled: "cancelled", cancelled: "cancelled",
  };
  for (const method of ["delivery", "pickup", "dine_in", "takeaway"]) {
    for (const [status, normalized] of Object.entries(codes)) {
      const view = derive({ id: 1, method_code: method, status_code: status });
      const expected = method === "delivery" && normalized === "packed" ? "cooking"
        : method !== "delivery" && normalized === "courier" ? "packed" : normalized;
      assert.equal(view.stage, expected, `${method}/${status}`);
      assert.equal(view.steps.length, 4);
      assert.equal(view.steps.some((step) => step.code === (method === "delivery" ? "packed" : "courier")), false);
      assert.equal(view.isFinal, ["completed", "cancelled"].includes(normalized));
      if (normalized === "completed") {
        assert.equal(view.steps[3].state, "success");
        assert.equal(view.steps.slice(0, 3).every((step) => step.state === "completed"), true);
      }
      if (normalized === "cancelled") assert.equal(view.steps[3].state, "cancelled");
    }
  }
  assert.equal(derive({ method_code: "delivery", status_code: "delivered" }).steps[3].title, "Доставлен");
  assert.equal(derive({ method_code: "pickup", status_code: "delivered" }).steps[3].title, "Получен");
  assert.equal(derive({ method_code: "takeaway", status_code: "delivered" }).steps[3].title, "Получен");
  assert.equal(derive({ method_code: "dine_in", status_code: "delivered" }).steps[3].title, "Выполнен");
});

test("delivery cooking → ready/packed and duplicate events never touch detail DOM", () => {
  const root = { querySelector() { assert.fail("Hidden transition must not touch a fragment"); } };
  const { derive, patch } = loadOrderView({ querySelectorAll: () => [root] });
  const cooking = { id: 10, method_code: "delivery", status_code: "cooking", items: [], total_price: 100 };
  for (const code of ["ready", "packed", "cooking"]) {
    const order = { ...cooking, status_code: code };
    assert.equal(derive(order).progressKey, derive(cooking).progressKey);
    patch(cooking, order);
  }
});

test("real transitions preserve accordion, products, scroll and root identity", () => {
  const changed = [];
  const makeStep = (index) => {
    const icon = {}, label = {};
    const node = {
      setAttribute() {}, removeAttribute() {},
      classList: { add() {}, remove() {} }, addEventListener() {}, removeEventListener() {},
      querySelector: (selector) => selector === "i" ? icon : label,
    };
    return node;
  };
  const steps = Array.from({ length: 4 }, (_, index) => makeStep(index));
  const announcement = { textContent: "Готовится" };
  const root = {
    scrollTop: 321, closest: () => null,
    querySelector(selector) {
      const match = selector.match(/^\[data-order-progress-step="(\d)"\]$/);
      if (match) { changed.push(Number(match[1])); return steps[Number(match[1])]; }
      if (selector === "[data-order-status-announcement]") return announcement;
      assert.fail(`Status update touched ${selector}`);
    },
  };
  const { patch } = loadOrderView({ querySelectorAll: () => [root] });
  const order = { id: 10, method_code: "delivery", status_code: "cooking", items: [] };
  patch(order, { ...order, status_code: "on_the_way" });
  assert.deepEqual(changed, [1, 2]);
  assert.equal(root.scrollTop, 321);
  changed.length = 0;
  patch({ ...order, status_code: "on_the_way" }, { ...order, status_code: "delivered" });
  assert.deepEqual(changed, [2, 3]);
  assert.match(steps[3].className, /is-success/);
});

test("timing uses store wall time, payment and comments use snapshot values", () => {
  const { derive } = loadOrderView();
  const order = { id: 10, method_code: "delivery", time_option_code: "on_date", scheduled_at: "2026-10-02 12:00:00", payment_code: "online", is_paid: 1, comment: "  Без звонка  ", address: "Адрес заказа", address_comment: "Подъезд заказа" };
  const view = derive(order);
  assert.equal(view.timing, "На дату · 02.10 · 12:00");
  assert.equal(view.payment, "Оплачено онлайн");
  assert.equal(view.comment, "Без звонка");
  assert.equal(view.deliveryRows.some(([label]) => label === "Время"), false);
  assert.equal(derive({ ...order, comment: "   " }).comment, "");
  assert.equal(derive({ ...order, method_code: "pickup" }).deliveryRows.some(([label]) => label === "Адрес"), false);
});

test("reconcile refreshes active orders once and only the visible open detail", async () => {
  const calls = [];
  const root = (id, hidden) => ({
    dataset: { orderDetailsId: String(id) },
    closest: () => hidden ? {} : null,
    getClientRects: () => [1],
  });
  const start = source.indexOf("      async function reconcileOrderSocket() {");
  const end = source.indexOf("      function syncOrderSocket() {", start);
  const context = {
    currentOrderScope: () => "customer-A:store-1",
    window: { updateActiveOrdersBadge: async (options) => { calls.push(["active", options.force, options.reconcile]); } },
    document: { querySelectorAll: () => [root(100, false), root(200, true)] },
    refreshOrderSnapshot: async (id) => { calls.push(["details", id]); },
  };
  vm.createContext(context);
  vm.runInContext(source.slice(start, end), context);
  await context.reconcileOrderSocket();
  assert.deepEqual(calls, [["active", true, true], ["details", 100]]);
});

async function fixture(t) {
  const server = http.createServer();
  const events = createOrdersEventsHub();
  const activeTokens = new Map([["A", 11], ["B", 22]]);
  const db = { query: async (_, [tenant, store]) => [tenant === 1 && [1, 2].includes(store) ? [{ id: store }] : []] };
  // Register both listeners: a stock handler must leave the orders upgrade alone.
  const stock = createStockWebSocketHub({ server, db, ordersEvents: events });
  const orders = createOrdersWebSocketHub({ server, db, ordersEvents: events,
    authenticateCustomer: async (tenant, token) => tenant === 1 && activeTokens.has(token) ? { id: activeTokens.get(token) } : null,
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const clients = [];
  t.after(async () => {
    clients.forEach((client) => client.terminate());
    orders.wss.clients.forEach((client) => client.terminate());
    await Promise.all([new Promise((resolve) => orders.wss.close(resolve)), new Promise((resolve) => stock.wss.close(resolve))]);
    await new Promise((resolve) => server.close(resolve));
  });
  async function connect(token, tenant = 1, store = 1) {
    const socket = new WebSocket(`ws://127.0.0.1:${server.address().port}/api/orders-ws?tenant_id=${tenant}&store_id=${store}`);
    clients.push(socket);
    const messages = [];
    socket.on("message", (raw) => messages.push(JSON.parse(String(raw))));
    await once(socket, "open");
    if (token !== undefined) socket.send(JSON.stringify({ type: "auth", customer_token: token }));
    return { socket, messages };
  }
  return { events, connect, activeTokens };
}

async function until(predicate, timeout = 1000) {
  const deadline = Date.now() + timeout;
  while (!predicate()) {
    if (Date.now() >= deadline) assert.fail("Timed out waiting for WebSocket state");
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}

test("WebSocket customer, tenant and store isolation; revoked sessions are closed", async (t) => {
  const { events, connect, activeTokens } = await fixture(t);
  const a = await connect("A"), b = await connect("B"), otherStore = await connect("A", 1, 2);
  await until(() => [a, b, otherStore].every((client) => client.messages.some((message) => message.type === "ready")));
  events.publish(1, 1, "order.updated", { id: 100, customer_id: 11, customer_phone: "private" });
  await until(() => a.messages.some((message) => message.type === "order.updated"));
  await new Promise((resolve) => setTimeout(resolve, 40));
  assert.equal(b.messages.some((message) => message.type === "order.updated"), false);
  assert.equal(otherStore.messages.some((message) => message.type === "order.updated"), false);
  const notification = a.messages.find((message) => message.type === "order.updated");
  assert.deepEqual(Object.keys(notification).sort(), ["cursor", "order_id", "type"]);
  activeTokens.delete("A");
  const closed = once(a.socket, "close");
  events.publish(1, 1, "order.updated", { id: 100, customer_id: 11 });
  assert.equal((await closed)[0], 1008);
});

test("WebSocket rejects invalid token, wrong tenant/store and missing auth", async (t) => {
  const { connect } = await fixture(t);
  for (const [token, tenant, store] of [["invalid", 1, 1], ["A", 2, 1], ["A", 1, 999], [undefined, 1, 1]]) {
    const client = await connect(token, tenant, store);
    const [code] = await once(client.socket, "close");
    assert.equal(code, 1008);
    assert.equal(client.messages.length, 0);
  }
});

test("reconnected sockets receive ready and subsequent events after a missed update", async (t) => {
  const { events, connect } = await fixture(t);
  const first = await connect("A");
  await until(() => first.messages.some((message) => message.type === "ready"));
  const closed = once(first.socket, "close");
  first.socket.close();
  await closed;
  events.publish(1, 1, "order.updated", { id: 100, customer_id: 11 });
  const next = await connect("A");
  await until(() => next.messages.some((message) => message.type === "ready"));
  events.publish(1, 1, "order.updated", { id: 100, customer_id: 11 });
  await until(() => next.messages.some((message) => message.type === "order.updated"));
});
