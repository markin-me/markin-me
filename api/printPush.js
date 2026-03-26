const http = require("http");
const https = require("https");
const { URL } = require("url");

const CRM_BASE_URL = (process.env.CRM_BASE_URL || "https://markin-me.ru").replace(/\/+$/, "");
const LOCAL_CRM_BASE_URL = `http://127.0.0.1:${Number(process.env.PORT || 3000)}`;
const HTML_JOB_PREFIX = "__HTML_BASE64__:";
const newStatusIdCache = new Map();
const RUS_NEW_LOWER = "\u043d\u043e\u0432";
const RUS_NEW_TITLE_LIKE = "%\u041d\u043e\u0432%";

function parseTimezoneOffsetToMinutes(value) {
  if (value === undefined || value === null || value === "") return 0;
  const source = String(value).trim();
  if (!source) return 0;
  const alias = source.toUpperCase();
  if (alias === "UTC" || alias === "GMT" || alias === "Z") return 0;
  const named = alias.match(/^(?:UTC|GMT)\s*([+-])\s*(\d{1,2})(?::?(\d{2}))?$/);
  if (named) {
    const sign = named[1] === "-" ? -1 : 1;
    const hh = Number(named[2] || 0);
    const mm = Number(named[3] || 0);
    if (hh <= 14 && mm <= 59) return sign * (hh * 60 + mm);
  }
  const direct = Number(source);
  if (Number.isFinite(direct)) return Math.round(direct * 60);
  const match = source.match(/^([+-]?)(\d{1,2})(?::?(\d{2}))?$/);
  if (!match) return 0;
  const sign = match[1] === "-" ? -1 : 1;
  const hh = Number(match[2] || 0);
  const mm = Number(match[3] || 0);
  if (!Number.isFinite(hh) || !Number.isFinite(mm)) return 0;
  if (hh > 14 || mm > 59) return 0;
  return sign * (hh * 60 + mm);
}

function pad2(n) {
  return String(n).padStart(2, "0");
}

function formatUtcDateTime(value = Date.now()) {
  const d = new Date(value);
  if (!Number.isFinite(d.getTime())) return null;
  return (
    d.getUTCFullYear() +
    "-" +
    pad2(d.getUTCMonth() + 1) +
    "-" +
    pad2(d.getUTCDate()) +
    " " +
    pad2(d.getUTCHours()) +
    ":" +
    pad2(d.getUTCMinutes()) +
    ":" +
    pad2(d.getUTCSeconds())
  );
}

async function getStoreTimezone(db, tenantId, storeId) {
  let storeTimezone = "+0";
  if (tenantId && storeId) {
    const [rows] = await db.query(
      "SELECT timezone FROM ten_stores WHERE tenant_id=? AND id=? LIMIT 1",
      [tenantId, storeId]
    );
    if (rows[0]?.timezone) {
      storeTimezone = rows[0].timezone;
    }
  }
  if ((!storeTimezone || storeTimezone === "+0") && tenantId) {
    const [tenantRows] = await db.query(
      "SELECT timezone FROM ten_tenants WHERE id=? LIMIT 1",
      [tenantId]
    );
    if (tenantRows[0]?.timezone) {
      storeTimezone = tenantRows[0].timezone;
    }
  }
  return storeTimezone || "+0";
}

function getStoreNowDateTime(timezone) {
  const offsetMinutes = parseTimezoneOffsetToMinutes(timezone);
  const shiftedMs = Date.now() + offsetMinutes * 60 * 1000;
  return formatUtcDateTime(shiftedMs);
}

function fetchReceiptHtmlFromBase(baseUrl, token, orderId) {
  return new Promise((resolve) => {
    const root = String(baseUrl || "").replace(/\/+$/, "");
    const url = new URL(`${root}/api/print/template/${orderId}`);
    const client = url.protocol === "https:" ? https : http;
    const req = client.request(
      {
        protocol: url.protocol,
        hostname: url.hostname,
        port: url.port || (url.protocol === "https:" ? 443 : 80),
        path: url.pathname + url.search,
        method: "GET",
        headers: {
          "X-Api-Key": token || "",
          Accept: "application/json"
        },
        timeout: 4000
      },
      (res) => {
        let body = "";
        res.on("data", (chunk) => {
          body += chunk.toString("utf-8");
        });
        res.on("end", () => {
          try {
            const data = JSON.parse(body || "{}");
            const html = data && data.data && data.data.html ? data.data.html : "";
            resolve(html || "");
          } catch {
            resolve("");
          }
        });
      }
    );
    req.on("timeout", () => {
      req.destroy();
      resolve("");
    });
    req.on("error", () => resolve(""));
    req.end();
  });
}

async function fetchReceiptHtml(token, orderId) {
  const first = await fetchReceiptHtmlFromBase(CRM_BASE_URL, token, orderId);
  if (first) return first;
  // Fallback for local run: if external base URL is wrong/unreachable,
  // call the same CRM instance directly on localhost.
  const baseA = String(CRM_BASE_URL || "").toLowerCase();
  const baseB = String(LOCAL_CRM_BASE_URL || "").toLowerCase();
  if (baseA === baseB) return "";
  return fetchReceiptHtmlFromBase(LOCAL_CRM_BASE_URL, token, orderId);
}

function encodeHtmlJobPayload(html) {
  const rawHtml = String(html || "");
  if (!rawHtml.trim()) return "";
  return `${HTML_JOB_PREFIX}${Buffer.from(rawHtml, "utf-8").toString("base64")}`;
}

async function getPrintTokenRow(db, tenantId, storeId) {
  const [rows] = await db.query(
    `SELECT id, token FROM print_api_tokens WHERE tenant_id=? AND store_id=? AND is_active=1 ORDER BY id DESC LIMIT 1`,
    [tenantId, storeId]
  );
  return rows[0] || null;
}

async function findNewStatusId(db, tenantId, storeId) {
  const cacheKey = `${Number(tenantId)}:${Number(storeId)}`;
  if (newStatusIdCache.has(cacheKey)) {
    return newStatusIdCache.get(cacheKey);
  }

  const [rowsByCode] = await db.query(
    "SELECT id FROM order_statuses WHERE tenant_id=? AND store_id=? AND is_active=1 AND code='new' LIMIT 1",
    [tenantId, storeId]
  );
  if (rowsByCode.length) {
    const id = Number(rowsByCode[0].id || 0) || null;
    if (id) newStatusIdCache.set(cacheKey, id);
    return id;
  }

  const [rowsByTitle] = await db.query(
    "SELECT id FROM order_statuses WHERE tenant_id=? AND store_id=? AND is_active=1 AND title LIKE ? ORDER BY sort ASC, id ASC LIMIT 1",
    [tenantId, storeId, RUS_NEW_TITLE_LIKE]
  );
  const fallbackId = rowsByTitle.length ? (Number(rowsByTitle[0].id || 0) || null) : null;
  if (fallbackId) newStatusIdCache.set(cacheKey, fallbackId);
  return fallbackId;
}

async function enqueuePrintJob(db, { tenantId, storeId, tokenId, order, html, createdAt }) {
  const orderId = Number(order?.id || order?.order_id || order?.orderId || 0);
  if (!orderId) return false;
  const publicId = order?.public_id || order?.publicId || null;
  const jobName = publicId ? `CRM Receipt ${publicId}` : `CRM Receipt #${orderId}`;
  const jobPayload = encodeHtmlJobPayload(html);
  if (!jobPayload) return false;
  const createdAtValue = String(createdAt || "").trim() || null;

  await db.query(
    `
    INSERT INTO print_jobs
      (tenant_id, store_id, token_id, order_id, public_id, job_name, pdf_base64, status, attempts, last_error, locked_at, acked_at, created_at, updated_at)
    VALUES
      (?, ?, ?, ?, ?, ?, ?, 'pending', 0, NULL, NULL, NULL, COALESCE(?, NOW()), COALESCE(?, NOW()))
    ON DUPLICATE KEY UPDATE
      token_id=VALUES(token_id),
      public_id=VALUES(public_id),
      job_name=VALUES(job_name),
      pdf_base64=VALUES(pdf_base64),
      status='pending',
      last_error=NULL,
      locked_at=NULL,
      acked_at=NULL,
      updated_at=COALESCE(VALUES(updated_at), NOW())
    `,
    [
      tenantId,
      storeId,
      tokenId,
      orderId,
      publicId,
      jobName,
      jobPayload,
      createdAtValue,
      createdAtValue,
    ]
  );
  return true;
}

async function sendOrderToPrintBot({ db, order, tenantId, storeId }) {
  const orderIdDebug = Number(order?.id || order?.order_id || order?.orderId || 0);
  const fail = (reason, extra = {}) => {
    try {
      console.warn("Print enqueue skipped:", {
        reason,
        orderId: orderIdDebug || null,
        tenantId: Number(tenantId || order?.tenant_id || order?.tenantId || 0) || null,
        storeId: Number(storeId || order?.store_id || order?.storeId || 0) || null,
        ...extra,
      });
    } catch {}
    return false;
  };

  if (!order) return false;
  const statusId = Number(order.status_id ?? order.statusId ?? order.statusID ?? 0);
  const statusCode = String(
    order.status_code ?? order.statusCode ?? order.code ?? ""
  ).trim().toLowerCase();
  const statusTitle = String(
    order.status_title ?? order.statusTitle ?? order.title ?? ""
  ).trim().toLowerCase();
  const isNewByCode = statusCode === "new";
  const isNewByTitle = statusTitle.startsWith(RUS_NEW_LOWER);


  const resolvedTenantId = Number(tenantId || order.tenant_id || order.tenantId || order.tenantID || order.tenant);
  const resolvedStoreId = Number(storeId || order.store_id || order.storeId || order.storeID || order.store);
  if (!resolvedTenantId || !resolvedStoreId) return fail("TENANT_OR_STORE_MISSING");

  const newStatusId = await findNewStatusId(db, resolvedTenantId, resolvedStoreId);
  const isNewStatus = (newStatusId && statusId === Number(newStatusId)) || isNewByCode || isNewByTitle;
  if (!isNewStatus) return fail("ORDER_STATUS_NOT_NEW", { statusId, statusCode, statusTitle, newStatusId: Number(newStatusId || 0) || null });

  const tokenRow = await getPrintTokenRow(db, resolvedTenantId, resolvedStoreId);
  if (!tokenRow?.token) return fail("PRINT_TOKEN_NOT_FOUND");

  const orderId = order.id || order.order_id || order.orderId;
  if (!orderId) return fail("ORDER_ID_MISSING");

  let html = "";
  for (let attempt = 1; attempt <= 3; attempt++) {
    html = await fetchReceiptHtml(tokenRow.token, orderId);
    if (html) break;
    if (attempt < 3) {
      await new Promise((resolve) => setTimeout(resolve, 250 * attempt));
    }
  }
  if (!html) return fail("RECEIPT_HTML_EMPTY");
  const storeTimezone = await getStoreTimezone(db, resolvedTenantId, resolvedStoreId);
  const createdAt = getStoreNowDateTime(storeTimezone);

  const enqueued = await enqueuePrintJob(db, {
    tenantId: resolvedTenantId,
    storeId: resolvedStoreId,
    tokenId: Number(tokenRow.id),
    order,
    html,
    createdAt,
  });
  if (!enqueued) return fail("ENQUEUE_RETURNED_FALSE");
  return true;
}

module.exports = { sendOrderToPrintBot };

