const {accumulationWindow,nextRelease,loadStorePrintHours}=require('./helpers/storePrintWindow');
let printEventsHub=null;
function setPrintEventsHub(hub){printEventsHub=hub;}
function notifyPrintChanged(tenantId,storeId){printEventsHub?.publish(tenantId,0,'print.changed',{kind:'queue',store_id:storeId});}
﻿const http = require("http");
const https = require("https");
const { URL } = require("url");
const {isOrderEligibleForFulfillment} = require("./helpers/orderFulfillment");

const CRM_BASE_URL = (process.env.CRM_BASE_URL || "https://markin-me.ru").replace(/\/+$/, "");
const LOCAL_CRM_BASE_URL = `http://127.0.0.1:${Number(process.env.PORT || 3000)}`;
const HTML_JOB_PREFIX = "__HTML_BASE64__:";
const META_JOB_PREFIX = "__PRINT_META__:";
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

function encodeMetaJobPayload(meta) {
  try {
    const json = JSON.stringify(meta || {});
    if (!json || json === "{}") return "";
    return `${META_JOB_PREFIX}${Buffer.from(json, "utf-8").toString("base64")}`;
  } catch {
    return "";
  }
}

function formatScheduleText(order) {
  const title = String(order?.time_option_title || "").trim();
  const scheduledAt = String(order?.scheduled_at || "").trim();
  if (!scheduledAt) return title;
  return title ? `${title}: ${scheduledAt}` : scheduledAt;
}

function formatLabelScheduleText(order) {
  const title = String(order?.time_option_title || "").trim();
  const scheduledAt = String(order?.scheduled_at || "").trim();
  if (!title) return scheduledAt;
  if (title.includes("Ко времени")) {
    const match = scheduledAt.match(/(\d{2}):(\d{2})/);
    return match ? `${title}: ${match[1]}:${match[2]}` : title;
  }
  if (title.includes("На дату")) {
    const match = scheduledAt.match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})/);
    if (match) return `${title}: ${match[3]}.${match[2]} ${match[4]}:${match[5]}`;
  }
  return title || scheduledAt;
}

function formatLabelDateTime(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  const match = raw.match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})/);
  if (!match) return raw;
  return `${match[4]}:${match[5]} ${match[3]}.${match[2]}`;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function resolveTemplatePath(source, path) {
  return String(path || "").split(".").reduce((value, key) => {
    if (value == null) return "";
    return value[key];
  }, source);
}

function renderPrintTemplate(templateHtml, data, rawKeys = new Set()) {
  return String(templateHtml || "").replace(/\{\{\s*([a-zA-Z0-9_.]+)\s*\}\}/g, (match, key) => {
    const value = resolveTemplatePath(data, key);
    if (value == null) return "";
    return rawKeys.has(key) || key.endsWith("_html") ? String(value) : escapeHtml(value);
  });
}

async function fetchActivePrintTemplateHtml(db, tenantId, documentType, templateId = null) {
  const hasTemplateId = Number(templateId || 0) > 0;
  const [rows] = await db.query(
    hasTemplateId
      ? `SELECT template_html
         FROM print_templates
         WHERE tenant_id=? AND id=? AND document_type=? AND is_active=1
         LIMIT 1`
      : `SELECT template_html
         FROM print_templates
         WHERE tenant_id=? AND document_type=? AND is_active=1
         ORDER BY id ASC
         LIMIT 1`,
    hasTemplateId ? [tenantId, templateId, documentType] : [tenantId, documentType]
  );
  return String(rows[0]?.template_html || "").trim() || null;
}

async function buildProductionLabelJobs(db, { tenantId, storeId, order }) {
  const items = Array.isArray(order?.items) ? order.items : [];
  if (!items.length) return [];

  const productIds = [...new Set(
    items
      .map((item) => Number(item?.product_id || 0))
      .filter((id) => id > 0)
  )];
  if (!productIds.length) return [];

  const [productRows] = await db.query(
    `SELECT id, name, production_zone_id
     FROM prod_products
     WHERE tenant_id=? AND id IN (${productIds.map(() => "?").join(",")})`,
    [tenantId, ...productIds]
  );
  const productById = new Map();
  productRows.forEach((row) => {
    productById.set(Number(row.id), {
      id: Number(row.id),
      name: String(row.name || "").trim(),
      production_zone_id: Number(row.production_zone_id || 0) > 0 ? Number(row.production_zone_id) : null,
    });
  });

  const zoneIds = [...new Set(
    productRows
      .map((row) => Number(row.production_zone_id || 0))
      .filter((id) => id > 0)
  )];
  if (!zoneIds.length) return [];

  const [ruleRows] = await db.query(
    `SELECT rr.production_zone_id, rr.printer_id, rr.template_id, rr.copies, rr.is_enabled,
            p.id AS printer_id, a.id AS agent_id, t.id AS token_id,
            p.system_name AS printer_system_name, p.display_name AS printer_display_name
       FROM prod_store_print_rules rr
       LEFT JOIN print_printers p
         ON p.tenant_id=rr.tenant_id
        AND p.store_id=rr.store_id
        AND p.id=rr.printer_id
       LEFT JOIN print_agents a
         ON a.tenant_id=p.tenant_id
        AND a.store_id=p.store_id
        AND a.token_id=p.token_id
        AND a.id=p.agent_id
       LEFT JOIN print_api_tokens t
         ON t.tenant_id=p.tenant_id
        AND t.store_id=p.store_id
        AND t.id=p.token_id
       WHERE rr.tenant_id=? AND rr.store_id=? AND rr.document_type='label' AND rr.is_enabled=1
         AND rr.production_zone_id IN (${zoneIds.map(() => "?").join(",")})
       ORDER BY rr.updated_at DESC, rr.id DESC`,
    [tenantId, storeId, ...zoneIds]
  );

  const ruleByZoneId = new Map();
  ruleRows.forEach((row) => {
    const zoneId = Number(row.production_zone_id || 0);
    if (!(zoneId > 0) || ruleByZoneId.has(zoneId)) return;
    ruleByZoneId.set(zoneId, {
      printer_id: Number(row.printer_id || 0) || null,
      agent_id: Number(row.agent_id || 0) || null,
      token_id: Number(row.token_id || 0) || null,
      template_id: Number(row.template_id || 0) || null,
      copies: Math.max(1, Number(row.copies || 1) || 1),
      printer_system_name: String(row.printer_system_name || "").trim(),
      printer_display_name: String(row.printer_display_name || "").trim(),
    });
  });

  const [zoneRows] = await db.query(
    `SELECT id, name
     FROM prod_production_zones
     WHERE tenant_id=? AND is_active=1 AND id IN (${zoneIds.map(() => "?").join(",")})`,
    [tenantId, ...zoneIds]
  );
  const zoneById = new Map(zoneRows.map((row) => [Number(row.id), { id: Number(row.id), name: String(row.name || "").trim() }]));

  const labelJobs = [];
  for (const item of items) {
    const productId = Number(item?.product_id || 0);
    const qty = Math.max(1, Number(item?.quantity || item?.qty || 1) || 1);
    if (!(productId > 0) || !(qty > 0)) continue;
    const product = productById.get(productId) || null;
    const zoneId = Number(product?.production_zone_id || 0);
    if (!(zoneId > 0)) continue;
    const rule = ruleByZoneId.get(zoneId) || null;
    if (!(rule?.printer_id > 0) || !(rule?.agent_id > 0) || !(rule?.token_id > 0) || !rule?.printer_system_name || !rule?.template_id) {
      throw new Error("PRINT_PRODUCTION_ROUTE_INVALID");
    }
    const zone = zoneById.get(zoneId) || null;
    const templateHtml = await fetchActivePrintTemplateHtml(db, tenantId, "label", rule.template_id);
    if (!templateHtml) continue;

    const scheduleText = formatScheduleText(order);
    const itemData = {
      quantity: qty,
      name: String(item?.name || product?.name || "").trim(),
      total: String(item?.line_total ?? item?.total ?? item?.total_price ?? ""),
      variant_label: String(item?.variant_label || "").trim(),
      ingredients: Array.isArray(item?.ingredients) ? item.ingredients : [],
      options: Array.isArray(item?.options) ? item.options : [],
      client_composition: String(item?.client_composition || "").trim(),
    };
    const compositionLines = [];
    if (itemData.variant_label) compositionLines.push(itemData.variant_label);
    if (Array.isArray(itemData.ingredients) && itemData.ingredients.length) {
      itemData.ingredients.forEach((ingredient) => {
        const ingredientLine = [
          ingredient?.qty ?? ingredient?.quantity ?? ingredient?.amount ?? "",
          ingredient?.unit_label || ingredient?.unit || ingredient?.unit_title || "",
          ingredient?.name || ingredient?.title || "",
        ].map((part) => String(part || "").trim()).filter(Boolean).join(" ");
        if (ingredientLine) compositionLines.push(ingredientLine);
      });
    }
    if (Array.isArray(itemData.options) && itemData.options.length) {
      itemData.options.forEach((option) => {
        const optionLine = [option?.variant_label || option?.variantLabel || "", option?.title || option?.name || ""].map((part) => String(part || "").trim()).filter(Boolean).join(" ");
        if (optionLine) compositionLines.push(optionLine);
      });
    }
    if (itemData.client_composition) compositionLines.push(itemData.client_composition);
    itemData.composition_html = compositionLines.length
      ? compositionLines.map((line) => `<div class="label-composition-item">&bull; ${escapeHtml(line)}</div>`).join("")
      : "";
    const giftData = Number(item?.is_gift_reward || 0) === 1
      ? { html: `<div class="label-composition-item">&bull; ${escapeHtml(String(itemData.name || "").trim())} (Подарок)</div>` }
      : { html: "" };
    const templateData = {
      order: {
        id: order?.id || null,
        created_at: order?.created_at || "",
        created_at_short: formatLabelDateTime(order?.created_at || ""),
        schedule_text: formatLabelScheduleText(order),
      },
      item: itemData,
      gift: giftData,
      zone: {
        id: zone?.id || zoneId,
        name: zone?.name || "",
      }
    };
    const html = renderPrintTemplate(templateHtml, templateData, new Set());
    if (!html || !String(html).trim()) continue;
    labelJobs.push({
      job_name: zone?.name ? `CRM Label ${zone.name}` : "CRM Label",
      html,
      printer_name: rule.printer_system_name,
      printer_id: rule.printer_id,
      agent_id: rule.agent_id,
      token_id: rule.token_id,
      copies: qty * rule.copies,
      kind: "label",
    });
  }
  return labelJobs;
}

async function getReceiptPrintCopies(db, { tenantId, storeId }) {
  const [rows] = await db.query(
    `SELECT rr.copies
       FROM prod_store_print_rules rr
       INNER JOIN print_templates pt
               ON pt.tenant_id=rr.tenant_id
              AND pt.id=rr.template_id
              AND pt.document_type='receipt'
              AND pt.is_active=1
      WHERE rr.tenant_id=? AND rr.store_id=? AND rr.is_enabled=1
      ORDER BY rr.updated_at DESC, rr.id DESC
      LIMIT 1`,
    [tenantId, storeId]
  );
  return Math.max(1, Number(rows[0]?.copies || 1) || 1);
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

async function enqueuePrintJob(db, { tenantId, storeId, tokenId, targetPrinterId = null, targetAgentId = null, order, html, createdAt }) {
  const orderId = Number(order?.id || order?.order_id || order?.orderId || 0);
  if (!orderId) return false;
  const publicId = order?.public_id || order?.publicId || null;
  const jobName = publicId ? `CRM Receipt ${publicId}` : `CRM Receipt #${orderId}`;
  const copies = Math.max(1, Number(order?.receipt_copies || order?.copies || 1) || 1);
  const jobPayload = encodeMetaJobPayload({
    kind: "receipt",
    html,
    copies,
    job_name: jobName,
  });
  if (!jobPayload) return false;
  const createdAtValue = String(createdAt || "").trim() || null;

  await db.query(
    `
    INSERT INTO print_jobs
      (tenant_id, store_id, token_id, target_printer_id, target_agent_id, order_id, public_id, job_name, pdf_base64, status, attempts, last_error, locked_at, acked_at, created_at, updated_at)
    VALUES
      (?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', 0, NULL, NULL, NULL, COALESCE(?, NOW()), COALESCE(?, NOW()))
    ON DUPLICATE KEY UPDATE
      token_id=VALUES(token_id), target_printer_id=VALUES(target_printer_id), target_agent_id=VALUES(target_agent_id),
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
      targetPrinterId,
      targetAgentId,
      orderId,
      publicId,
      jobName,
      jobPayload,
      createdAtValue,
      createdAtValue,
    ]
  );
  notifyPrintChanged(tenantId,storeId);
  return true;
}

async function getDefaultPrintRoute(db, tenantId, storeId) {
  const [rows] = await db.query(
    `SELECT p.id, p.agent_id, p.token_id FROM print_printers p
     INNER JOIN ten_stores s ON s.tenant_id=p.tenant_id AND s.id=p.store_id
      AND s.default_receipt_printer_id=p.id
     WHERE p.tenant_id=? AND p.store_id=? AND p.removed_at IS NULL
     ORDER BY p.id ASC LIMIT 1`,
    [tenantId, storeId]
  );
  const row = rows[0] || null;
  return row && Number(row.agent_id) > 0 && Number(row.token_id) > 0
    ? { printerId: Number(row.id), agentId: Number(row.agent_id), tokenId: Number(row.token_id) }
    : null;
}

async function enqueueLabelPrintJobs(db, { tenantId, storeId, tokenId, order, reprintNonce = 0 }) {
  const jobs = await buildProductionLabelJobs(db, { tenantId, storeId, order });
  if (!jobs.length) return 0;
  const orderId = Number(order?.id || order?.order_id || order?.orderId || 0);
  const publicId = order?.public_id || order?.publicId || null;
  const createdAtValue = String(order?.created_at || "").trim() || null;
  const nonceValue = Number(reprintNonce || 0) > 0 ? Number(reprintNonce || 0) : 0;
  for (let index = 0; index < jobs.length; index += 1) {
    const job = jobs[index];
    const syntheticOrderId = nonceValue > 0
      ? -(orderId * 1000 + nonceValue + (index + 1))
      : -(orderId * 1000 + (index + 1));
    const payload = encodeMetaJobPayload({
      kind: job.kind || "label",
      printer_name: job.printer_name || "",
      copies: Number(job.copies || 1) || 1,
      html: job.html || "",
      job_name: job.job_name || "CRM Label",
    });
    if (!payload) continue;
    await db.query(
      `
      INSERT INTO print_jobs
        (tenant_id, store_id, token_id, target_printer_id, target_agent_id, order_id, public_id, job_name, pdf_base64, status, attempts, last_error, locked_at, acked_at, created_at, updated_at)
      VALUES
        (?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', 0, NULL, NULL, NULL, COALESCE(?, NOW()), COALESCE(?, NOW()))
      ON DUPLICATE KEY UPDATE
        token_id=VALUES(token_id), target_printer_id=VALUES(target_printer_id), target_agent_id=VALUES(target_agent_id),
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
        Number(job.token_id || tokenId),
        job.printer_id,
        job.agent_id,
        syntheticOrderId,
        publicId,
        job.job_name || "CRM Label",
        payload,
        createdAtValue,
        createdAtValue,
      ]
    );
  }
  if(jobs.length)notifyPrintChanged(tenantId,storeId);
  return jobs.length;
}

async function enqueueSingleLabelPrintJob(db, { tenantId, storeId, tokenId, order, itemIndex, productId, reprintNonce }) {
  const items = Array.isArray(order?.items) ? order.items : [];
  const resolvedProductId = Number(productId || 0);
  let selectedItem = null;
  if (Number.isFinite(resolvedProductId) && resolvedProductId > 0) {
    selectedItem = items.find((item) => Number(item?.product_id || 0) === resolvedProductId) || null;
  }
  let index = Number(itemIndex || 0);
  if (!selectedItem && Number.isFinite(index) && index >= 0 && index < items.length) {
    selectedItem = items[index];
  }
  if (!Array.isArray(items) || !items.length || !selectedItem) return 0;
  if (!selectedItem || Number(selectedItem?.product_id || 0) <= 0) return 0;
  const singleOrder = {
    ...order,
    items: [{
      ...selectedItem,
      qty: 1,
      quantity: 1,
    }],
  };
  return enqueueLabelPrintJobs(db, {
    tenantId,
    storeId,
    tokenId,
    order: singleOrder,
    reprintNonce,
  });
}

async function sendOrderToPrintBot({ db, order, tenantId, storeId, silentSkipReasons, strictErrors=false }) {
  const gateOrderId=Number(order?.id || order?.order_id || order?.orderId);
  if(gateOrderId>0){
    const [gate]=await db.query("SELECT total_price,payment_projection,online_payment_required,online_payment_status FROM order_orders WHERE tenant_id=? AND store_id=? AND id=?",[tenantId,storeId,gateOrderId]);
    if(!gate.length || !isOrderEligibleForFulfillment(gate[0]))return false;
  }
  const mutedReasons = new Set(
    Array.isArray(silentSkipReasons)
      ? silentSkipReasons.map((reason) => String(reason || "").trim()).filter(Boolean)
      : []
  );
  const orderIdDebug = Number(order?.id || order?.order_id || order?.orderId || 0);
  const fail = (reason, extra = {}) => {
    if(strictErrors && !['PRINT_TOKEN_NOT_FOUND','PRINT_RECEIPT_ROUTE_NOT_FOUND','ORDER_STATUS_NOT_NEW'].includes(reason))
      throw Object.assign(new Error(),{code:`ORDER_PAYMENT_PRINT_${reason}`});
    try {
      if (!mutedReasons.has(String(reason || "").trim())) {
        console.warn("Print enqueue skipped:", {
          reason,
          orderId: orderIdDebug || null,
          tenantId: Number(tenantId || order?.tenant_id || order?.tenantId || 0) || null,
          storeId: Number(storeId || order?.store_id || order?.storeId || 0) || null,
          ...extra,
        });
      }
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

  const [configured] = await db.query('SELECT id FROM prod_store_print_rules WHERE tenant_id=? AND store_id=? AND config_version=2 LIMIT 1',[resolvedTenantId,resolvedStoreId]);
  if (configured.length) {
    const choices=await getPrintChoices(db,resolvedTenantId,resolvedStoreId);
    const autoTimezone=await getStoreTimezone(db,resolvedTenantId,resolvedStoreId);
    const today=getStoreNowDateTime(autoTimezone).slice(0,10);
    const [dateRows]=await db.query("SELECT DATE_FORMAT(scheduled_at,'%Y-%m-%d') AS scheduled_day,DATE_FORMAT(created_at,'%Y-%m-%d %H:%i:%s') AS created_at FROM order_orders WHERE tenant_id=? AND store_id=? AND id=?",[resolvedTenantId,resolvedStoreId,Number(order.id || order.order_id || order.orderId)]);
    if(!dateRows.length)return fail('ORDER_NOT_FOUND');
    const createdLocal=require('./helpers').utcToStoreDateTime(dateRows[0].created_at,autoTimezone);
    const orderDay=dateRows[0].scheduled_day || createdLocal.slice(0,10);
    const scheduledRules=choices.rules.filter(rule=>Number(rule.zone_auto_print)===1&&Number(rule.scheduled_auto_print)===1);
    const hours=scheduledRules.length?await loadStorePrintHours(db,resolvedTenantId,resolvedStoreId):null;
    const windows=new Map(scheduledRules.map(rule=>[Number(rule.id),accumulationWindow(hours,rule.scheduled_auto_print_time,createdLocal)]));
    const timedRules=scheduledRules.filter(rule=>Number(rule.scheduled_print)===1&&(windows.get(Number(rule.id))||(rule.auto_print_date_scope==='today'&&orderDay>createdLocal.slice(0,10))));
    if(timedRules.length){
      const deferred=timedRules.map(rule=>{
        let due=windows.get(Number(rule.id))?.dueDate||orderDay;
        if(rule.auto_print_date_scope==='today'&&orderDay>due)due=orderDay;
        due=nextRelease(hours,rule.scheduled_auto_print_time,due+' 00:00:00').slice(0,10);
        return [resolvedTenantId,resolvedStoreId,Number(order.id||order.order_id||order.orderId),rule.id,due];
      });
      await db.query(`INSERT INTO print_auto_deferred (tenant_id,store_id,order_id,rule_id,due_date) VALUES ${deferred.map(()=>'(?,?,?,?,?)').join(',')} ON DUPLICATE KEY UPDATE due_date=IF(state='pending',VALUES(due_date),due_date)`,deferred.flat());
      notifyPrintChanged(resolvedTenantId,resolvedStoreId);
    }
    const rules=choices.rules.filter(rule=>Number(rule.zone_auto_print)===1&&Number(rule.auto_print)===1&&rule.template_type!=='assembly_batch'&&!windows.get(Number(rule.id))&&(rule.auto_print_date_scope==='all'||(rule.auto_print_date_scope==='today'&&orderDay===today)));
    if (!rules.length) return true;
    const documents=[];
    for (const rule of rules) {
      const prepared=await preparePrintDocuments(db,{tenantId:resolvedTenantId,storeId:resolvedStoreId,orderIds:[Number(order.id || order.order_id || order.orderId)],automatic:true,selections:[{template_id:Number(rule.template_id),copies:Number(rule.copies),rule_id:Number(rule.id)}]});
      documents.push(...prepared);
    }
    await enqueueDocuments(db,{tenantId:resolvedTenantId,storeId:resolvedStoreId,documents,automatic:true,requestId:'new-order'});
    return true;
  }
  const tokenRow = await getPrintTokenRow(db, resolvedTenantId, resolvedStoreId);
  if (!tokenRow?.token) return fail("PRINT_TOKEN_NOT_FOUND");

  const orderId = order.id || order.order_id || order.orderId;
  if (!orderId) return fail("ORDER_ID_MISSING");

  const receiptCopies = await getReceiptPrintCopies(db, {
    tenantId: resolvedTenantId,
    storeId: resolvedStoreId,
  });

  let html = "";
  for (let attempt = 1; attempt <= 3; attempt++) {
    html = await fetchReceiptHtml(tokenRow.token, orderId);
    if (html) break;
    if (attempt < 3) {
      await new Promise((resolve) => setTimeout(resolve, 250 * attempt));
    }
  }
  if (!html) return fail("RECEIPT_HTML_EMPTY");
  const receiptRoute = await getDefaultPrintRoute(db, resolvedTenantId, resolvedStoreId);
  if (!receiptRoute) return fail("PRINT_RECEIPT_ROUTE_NOT_FOUND");
  const storeTimezone = await getStoreTimezone(db, resolvedTenantId, resolvedStoreId);
  const createdAt = getStoreNowDateTime(storeTimezone);

  const enqueued = await enqueuePrintJob(db, {
    tenantId: resolvedTenantId,
    storeId: resolvedStoreId,
    tokenId: receiptRoute.tokenId,
    targetPrinterId: receiptRoute.printerId,
    targetAgentId: receiptRoute.agentId,
    order: {
      ...order,
      receipt_copies: receiptCopies,
    },
    html,
    createdAt,
  });
  if (!enqueued) return fail("ENQUEUE_RETURNED_FALSE");

  try {
    await enqueueLabelPrintJobs(db, {
      tenantId: resolvedTenantId,
      storeId: resolvedStoreId,
      tokenId: Number(tokenRow.id),
      order: {
        ...order,
        created_at: createdAt,
      },
    });
  } catch (labelErr) {
    if(strictErrors)throw Object.assign(new Error(),{code:'ORDER_PAYMENT_LABELS_UNCERTAIN'});
    console.error("Label enqueue failed:", {
      orderId: orderIdDebug || null,
      tenantId: resolvedTenantId,
      storeId: resolvedStoreId,
      error: String(labelErr?.message || labelErr || "unknown_error"),
    });
  }
  return true;
}

// Shared real-document preparation for automatic, manual and browser printing.
async function getPrintChoices(db, tenantId, storeId) {
  const [templates] = await db.query("SELECT id,title,document_type FROM print_templates WHERE tenant_id=? AND is_active=1 AND document_type IN ('receipt','assembly','assembly_batch','delivery','label') ORDER BY id",[tenantId]);
  const [rules] = await db.query(`SELECT r.*,t.document_type AS template_type,z.name AS zone_name,p.system_name AS printer_name,p.agent_id,p.token_id,tok.is_active AS connection_active
    FROM prod_store_print_rules r JOIN print_templates t ON t.tenant_id=r.tenant_id AND t.id=r.template_id AND t.is_active=1
    JOIN prod_production_zones z ON z.tenant_id=r.tenant_id AND z.id=r.production_zone_id AND z.is_active=1
    LEFT JOIN print_printers p ON p.tenant_id=r.tenant_id AND p.store_id=r.store_id AND p.id=r.printer_id AND p.removed_at IS NULL
    LEFT JOIN print_api_tokens tok ON tok.tenant_id=p.tenant_id AND tok.store_id=p.store_id AND tok.id=p.token_id
    WHERE r.tenant_id=? AND r.store_id=? AND r.is_enabled=1 ORDER BY r.sort_order,r.id`,[tenantId,storeId]);
  const [products] = await db.query('SELECT id,production_zone_id FROM prod_products WHERE tenant_id=? AND production_zone_id IS NOT NULL',[tenantId]);
  return {templates,rules,product_zones:products};
}
function mergeAssemblyItems(items) {
  const rows = new Map();
  const canonical = value => Array.isArray(value) ? value.map(canonical) : value && typeof value === 'object' ? Object.fromEntries(Object.keys(value).sort().map(key=>[key,canonical(value[key])])) : value;
  for (const item of items) {
    const configuration = {...item};
    for (const key of ['quantity','qty','price','total','total_price','line_total','old_line_total','id','order_id','discount']) delete configuration[key];
    const key = JSON.stringify(canonical(configuration));
    const quantity = Number(item.quantity || item.qty || 1);
    if (rows.has(key)) { rows.get(key).quantity += quantity; rows.get(key).qty = rows.get(key).quantity; }
    else rows.set(key,{...item,quantity,qty:quantity});
  }
  return [...rows.values()];
}
async function preparePrintDocuments(db, {tenantId,storeId,orderIds,selections,automatic=false,destination="browser",bulk=false}) {
  if (!Array.isArray(orderIds) || !orderIds.length || orderIds.length > 100 || orderIds.some(id=>!Number.isSafeInteger(id)||id<=0)) throw new Error('BAD_ORDER_IDS');
  if (!Array.isArray(selections) || !selections.length || selections.length > 5 || new Set(selections.map(selection=>Number(selection.template_id))).size !== selections.length) throw new Error('BAD_PRINT_SELECTION');
  const choices = await getPrintChoices(db,tenantId,storeId);
  if(selections.some(selection=>!Number.isSafeInteger(selection.template_id) || !choices.templates.some(template=>Number(template.id)===selection.template_id)))throw new Error('BAD_PRINT_SELECTION');
  const builder = require('./print').createOrderPrintTemplateBuilder({db,helpers:require('./helpers')});
  const printData=await builder.buildOrderTemplateHtml(tenantId,storeId,orderIds,{dataOnly:true,templateIds:selections.map(selection=>Number(selection.template_id)),productZones:choices.product_zones});
  if(bulk){
    orderIds=orderIds.filter(id=>!['delivered','canceled','cancelled'].includes(String(printData.orders.get(Number(id))?.statusCode || '').trim().toLowerCase()));
    if(!orderIds.length)throw new Error('NO_MATCHING_DOCUMENTS');
  }
  const documents=[];
  for (const selection of selections) {
    const template = choices.templates.find(t=>Number(t.id)===Number(selection.template_id));
    if (!template || (!automatic && destination === 'agent' ? false : !Number.isSafeInteger(selection.copies) || selection.copies < 1 || selection.copies > 100)) throw new Error('BAD_PRINT_SELECTION');
    const routes = automatic
      ? choices.rules.filter(rule=>Number(rule.id)===Number(selection.rule_id) && Number(rule.template_id)===Number(template.id))
      : destination === 'agent'
        ? choices.rules.filter(rule=>Number(rule.template_id)===Number(template.id) && rule.printer_name && Number(rule.agent_id)>0 && Number(rule.token_id)>0 && Number(rule.connection_active)===1)
        : [null];
    if (!routes.length) throw new Error('PRINT_RULE_NOT_FOUND');
    for (const route of routes) {
      const copies = route ? Number(route.copies) : selection.copies;
      if (!Number.isSafeInteger(copies) || copies<1 || copies>100) throw new Error('BAD_PRINT_SELECTION');
      const scope = route?.item_scope === 'zone' && ['assembly','label'].includes(template.document_type) ? Number(route.production_zone_id) : 0;
      let batchItems,assemblyGroups;
      if (template.document_type==='assembly_batch') {
        const groups=new Map();
        for (const id of orderIds) {
          const data=await builder.buildOrderTemplateHtml(tenantId,storeId,id,{dataOnly:true,printData});
          if (!data) throw new Error('ORDER_NOT_FOUND');
          const order=data.order;
          const code=String(order.time_option_code || '').trim().toLowerCase();
          const scheduled=String(order.scheduled_at || '').match(/^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2})/);
          const asap=['asap','urgent'].includes(code) || (!order.scheduled_at && !['at_time','on_date'].includes(code));
          const date=scheduled?.[1] || String(order.created_at || '').match(/^(\d{4}-\d{2}-\d{2})/)?.[1];
          if(!date)throw new Error('BAD_ORDER_SCHEDULE');
          const key=`${date}:${asap?'0:asap':scheduled?'1:'+scheduled[2]:'2:unscheduled'}`;
          if(!groups.has(key))groups.set(key,{key,date,title:asap?'Как можно быстрее':scheduled?`Ко времени ${scheduled[2]}`:'Время не указано',orders:[],items:[]});
          const group=groups.get(key);
          group.orders.push({id:Number(order.id),comment:String(order.comment || '').trim()});
          group.items.push(...(order.remaining_order?.items || order.items));
        }
        assemblyGroups=[...groups.values()].sort((a,b)=>a.key.localeCompare(b.key)).map(group=>({...group,items:mergeAssemblyItems(group.items)}));
        batchItems=assemblyGroups.flatMap(group=>group.items);
      }
      const ids = batchItems ? [orderIds[0]] : orderIds;
      for (const id of ids) {
        let result;
        try{
          result=await builder.buildOrderTemplateHtml(tenantId,storeId,id,{templateId:template.id,zoneId:scope,items:batchItems,assemblyGroups,printData,individualPrint:!automatic && !bulk && orderIds.length===1});
        }catch(error){error.printContext={orderId:id,templateId:template.id,documentType:template.document_type};throw error;}
        if (result===null) {
          const exists=printData.orders.has(Number(id));
          if (!exists) throw new Error('ORDER_NOT_FOUND');
          // Delivery sheets do not apply to pickup/dine-in orders; keep other selected documents.

          continue;
        }
        const parts=Array.isArray(result)?result:[{html:result,copies:1}];
        parts.forEach((part,index)=>documents.push({html:part.html,copies:copies*part.copies,orderId:id,templateId:template.id,type:template.document_type,title:template.title,route,part:index}));
      }
    }
  }
  if (!automatic && !documents.length) throw new Error('NO_MATCHING_DOCUMENTS');
  return documents;
}
async function enqueueDocuments(db, {tenantId,storeId,documents,requestId,automatic=false,deferredIds=[]}) {
  if (!/^[a-zA-Z0-9_-]{8,80}$/.test(String(requestId || ''))) throw new Error('BAD_PRINT_REQUEST');
  if (documents.some(doc=>!doc.route?.printer_name || !Number(doc.route?.agent_id) || !Number(doc.route?.token_id) || Number(doc.route?.connection_active)!==1)) throw new Error('PRINT_ROUTE_NOT_CONFIGURED');
  const connection=await db.getConnection();
  try {
    await connection.beginTransaction();
    let pending=[],pendingBytes=0;
    const writePending=async()=>{
      if(!pending.length)return;
      await connection.query(`INSERT INTO print_jobs (tenant_id,store_id,token_id,target_printer_id,target_agent_id,order_id,job_key,job_name,pdf_base64,status)
        VALUES ${pending.map(()=>"(?,?,?,?,?,?,?,?,?,'pending')").join(',')} ON DUPLICATE KEY UPDATE id=id`,pending.flat());
      pending=[];pendingBytes=0;
    };
    for (let index=0;index<documents.length;index++) {
      const doc=documents[index];
      const jobKey=`${automatic?'auto':'manual'}:${requestId}:${doc.orderId}:${doc.route.id}:${doc.templateId}:${doc.part}`;
      const payload=encodeMetaJobPayload({kind:doc.type,html:doc.html,copies:doc.copies,printer_name:doc.route.printer_name,job_key:jobKey,notify_order:automatic && index===0,job_name:doc.title});
      const bytes=Buffer.byteLength(payload,'utf8');
      if(pending.length && (pending.length>=50 || pendingBytes+bytes>512*1024))await writePending();
      pending.push([tenantId,storeId,doc.route.token_id,doc.route.printer_id,doc.route.agent_id,doc.orderId,jobKey,doc.title,payload]);pendingBytes+=bytes;
    }
    await writePending();
    if(deferredIds.length)await connection.query(`UPDATE print_auto_deferred SET state='completed' WHERE tenant_id=? AND store_id=? AND state='pending' AND id IN (${deferredIds.map(()=>'?').join(',')})`,[tenantId,storeId,...deferredIds]);
    await connection.commit();
    if(documents.length)notifyPrintChanged(tenantId,storeId);
    return documents.length;
  } catch(error) {await connection.rollback();throw error;} finally {connection.release();}
}
let scheduledAutoPrintTimer=null,scheduledAutoPrintRunning=false;
const scheduledAutoCursors=new Map();
function startScheduledAutoPrint(db){
  if(scheduledAutoPrintTimer)return;
  const tick=async()=>{
    if(scheduledAutoPrintRunning)return;
    scheduledAutoPrintRunning=true;
    try{
      const [rules]=await db.query(`SELECT DISTINCT r.* FROM prod_store_print_rules r JOIN print_auto_deferred d ON d.tenant_id=r.tenant_id AND d.store_id=r.store_id AND d.rule_id=r.id AND d.state='pending' JOIN prod_production_zones z ON z.tenant_id=r.tenant_id AND z.id=r.production_zone_id AND z.is_active=1 WHERE r.is_enabled=1 AND r.zone_auto_print=1 AND r.scheduled_auto_print=1 AND r.scheduled_print=1 AND d.due_date<=DATE_ADD(UTC_DATE(),INTERVAL 1 DAY)`);
      const timezones=new Map(),hoursByStore=new Map();
      for(const rule of rules){
        const key=`${rule.tenant_id}:${rule.store_id}`;
        if(!timezones.has(key))timezones.set(key,await getStoreTimezone(db,rule.tenant_id,rule.store_id));
        const timezone=timezones.get(key),now=getStoreNowDateTime(timezone),today=now.slice(0,10);
        try{if(!hoursByStore.has(key))hoursByStore.set(key,await loadStorePrintHours(db,rule.tenant_id,rule.store_id));}
        catch(error){console.error('Scheduled print store hours:',{tenantId:rule.tenant_id,storeId:rule.store_id,error:error.message});continue;}
        const hours=hoursByStore.get(key);
        if(now.slice(11,16)<String(rule.scheduled_auto_print_time).slice(0,5))continue;
        const lockName=`print-auto:${key}:${rule.id}`;
        const connection=await db.getConnection();let locked=false;
        try{
          const [locks]=await connection.query('SELECT GET_LOCK(?,0) AS acquired',[lockName]);
          if(Number(locks[0]?.acquired)!==1)continue;
          locked=true;
          const cursor=scheduledAutoCursors.get(lockName) || 0;
          const [pending]=await connection.query(`SELECT d.id AS dispatch_id,d.order_id,DATE_FORMAT(d.due_date,'%Y-%m-%d') AS due_date,o.is_active,o.online_payment_required,o.online_payment_status,o.payment_projection,o.is_paid,o.total_price,DATE_FORMAT(o.scheduled_at,'%Y-%m-%d') AS scheduled_day,DATE_FORMAT(o.created_at,'%Y-%m-%d %H:%i:%s') AS created_at,s.code AS status_code FROM print_auto_deferred d LEFT JOIN order_orders o ON o.tenant_id=d.tenant_id AND o.store_id=d.store_id AND o.id=d.order_id LEFT JOIN order_statuses s ON s.tenant_id=o.tenant_id AND s.store_id=o.store_id AND s.id=o.status_id WHERE d.tenant_id=? AND d.store_id=? AND d.rule_id=? AND d.state='pending' AND d.due_date<=? AND d.id>? ORDER BY d.id LIMIT 100`,[rule.tenant_id,rule.store_id,rule.id,today,cursor]);
          if(!pending.length){scheduledAutoCursors.set(lockName,0);continue;}
          scheduledAutoCursors.set(lockName,Number(pending[pending.length-1].dispatch_id));
          const ready=[],skipped=[];
          for(const order of pending){
            const due=String(order.due_date instanceof Date?order.due_date.toISOString().slice(0,10):order.due_date).slice(0,10);
            if(now<nextRelease(hours,rule.scheduled_auto_print_time,due+' 00:00:00'))continue;
            if(!Number(order.is_active) || ['delivered','canceled','cancelled'].includes(String(order.status_code))){skipped.push(order.dispatch_id);continue;}
            const day=order.scheduled_day || due;
            if(rule.auto_print_date_scope==='today' && day>today){await connection.query('UPDATE print_auto_deferred SET due_date=? WHERE id=? AND state=\'pending\'',[day,order.dispatch_id]);continue;}
            if(rule.auto_print_date_scope==='today' && day<today){skipped.push(order.dispatch_id);continue;}
            if(isOrderEligibleForFulfillment(order))ready.push(order);
          }
          if(skipped.length)await connection.query(`UPDATE print_auto_deferred SET state='skipped' WHERE tenant_id=? AND store_id=? AND id IN (${skipped.map(()=>'?').join(',')})`,[rule.tenant_id,rule.store_id,...skipped]);
          if(skipped.length)notifyPrintChanged(rule.tenant_id,rule.store_id);
          if(!ready.length)continue;
          const orderIds=ready.map(order=>Number(order.order_id));
          let documents;
          try{documents=await preparePrintDocuments(db,{tenantId:rule.tenant_id,storeId:rule.store_id,orderIds,automatic:true,bulk:true,selections:[{template_id:Number(rule.template_id),copies:Number(rule.copies),rule_id:Number(rule.id)}]});}
          catch(error){if(error.message!=='NO_MATCHING_DOCUMENTS')throw error;documents=[];}
          await enqueueDocuments(db,{tenantId:rule.tenant_id,storeId:rule.store_id,documents,automatic:true,requestId:`scheduled_${rule.id}_${ready[0].dispatch_id}`,deferredIds:ready.map(order=>Number(order.dispatch_id))});
        }catch(error){console.error('Scheduled auto-print rule:',{tenantId:rule.tenant_id,storeId:rule.store_id,ruleId:rule.id},error);}
        finally{try{if(locked)await connection.query('SELECT RELEASE_LOCK(?)',[lockName]);}finally{connection.release();}}
      }
    }catch(error){console.error('Scheduled auto-print:',error);}
    finally{scheduledAutoPrintRunning=false;}
  };
  scheduledAutoPrintTimer=setInterval(()=>void tick(),30000);
  scheduledAutoPrintTimer.unref?.();
  void tick();
}
module.exports = { setPrintEventsHub, encodeMetaJobPayload, sendOrderToPrintBot, enqueueSingleLabelPrintJob, getPrintChoices, preparePrintDocuments, enqueueDocuments, startScheduledAutoPrint };
