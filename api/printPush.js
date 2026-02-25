const http = require("http");
const https = require("https");
const { URL } = require("url");

const CRM_BASE_URL = (process.env.CRM_BASE_URL || "https://markin-me.ru").replace(/\/+$/, "");
const HTML_JOB_PREFIX = "__HTML_BASE64__:";

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

function fetchReceiptHtml(token, orderId) {
  return new Promise((resolve) => {
    const url = new URL(`${CRM_BASE_URL}/api/print/template/${orderId}`);
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
  if (!order) return false;
  const statusId = Number(order.status_id ?? order.statusId ?? order.statusID ?? 0);

  const resolvedTenantId = Number(tenantId || order.tenant_id || order.tenantId || order.tenantID || order.tenant);
  const resolvedStoreId = Number(storeId || order.store_id || order.storeId || order.storeID || order.store);
  if (!resolvedTenantId || !resolvedStoreId) return false;

  const tokenRow = await getPrintTokenRow(db, resolvedTenantId, resolvedStoreId);
  console.log("sendOrderToPrintBot", { orderId: order.id, statusId, tokenRow: !!tokenRow });
  if (statusId !== 1) return false;
  if (!tokenRow?.token) return false;

  const orderId = order.id || order.order_id || order.orderId;
  if (!orderId) return false;

  const html = await fetchReceiptHtml(tokenRow.token, orderId);
  if (!html) return false;
  const storeTimezone = await getStoreTimezone(db, resolvedTenantId, resolvedStoreId);
  const createdAt = getStoreNowDateTime(storeTimezone);

  return enqueuePrintJob(db, {
    tenantId: resolvedTenantId,
    storeId: resolvedStoreId,
    tokenId: Number(tokenRow.id),
    order,
    html,
    createdAt,
  });
}

module.exports = { sendOrderToPrintBot };
