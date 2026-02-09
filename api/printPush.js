const http = require("http");
const https = require("https");
const { URL } = require("url");

const CRM_BASE_URL = (process.env.CRM_BASE_URL || "https://markin-me.ru").replace(/\/+$/, "");
const HTML_JOB_PREFIX = "__HTML_BASE64__:";

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

async function enqueuePrintJob(db, { tenantId, storeId, tokenId, order, html }) {
  const orderId = Number(order?.id || order?.order_id || order?.orderId || 0);
  if (!orderId) return false;
  const publicId = order?.public_id || order?.publicId || null;
  const jobName = publicId ? `CRM Receipt ${publicId}` : `CRM Receipt #${orderId}`;
  const jobPayload = encodeHtmlJobPayload(html);
  if (!jobPayload) return false;

  await db.query(
    `
    INSERT INTO print_jobs
      (tenant_id, store_id, token_id, order_id, public_id, job_name, pdf_base64, status, attempts, last_error, locked_at, acked_at)
    VALUES
      (?, ?, ?, ?, ?, ?, ?, 'pending', 0, NULL, NULL, NULL)
    ON DUPLICATE KEY UPDATE
      token_id=VALUES(token_id),
      public_id=VALUES(public_id),
      job_name=VALUES(job_name),
      pdf_base64=VALUES(pdf_base64),
      status='pending',
      last_error=NULL,
      locked_at=NULL,
      acked_at=NULL,
      updated_at=NOW()
    `,
    [tenantId, storeId, tokenId, orderId, publicId, jobName, jobPayload]
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

  return enqueuePrintJob(db, {
    tenantId: resolvedTenantId,
    storeId: resolvedStoreId,
    tokenId: Number(tokenRow.id),
    order,
    html
  });
}

module.exports = { sendOrderToPrintBot };
