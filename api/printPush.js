const http = require("http");
const https = require("https");
const { URL } = require("url");

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
            p.system_name AS printer_system_name, p.display_name AS printer_display_name
       FROM prod_store_print_rules rr
       LEFT JOIN print_printers p
         ON p.tenant_id=rr.tenant_id
        AND p.id=rr.printer_id
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
    if (!rule?.printer_system_name || !rule?.template_id) continue;
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
      copies: Math.max(1, qty * Math.max(1, Number(rule.copies || 1) || 1)),
      kind: "label",
    });
  }
  return labelJobs;
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

async function enqueueLabelPrintJobs(db, { tenantId, storeId, tokenId, order }) {
  const jobs = await buildProductionLabelJobs(db, { tenantId, storeId, order });
  if (!jobs.length) return 0;
  const orderId = Number(order?.id || order?.order_id || order?.orderId || 0);
  const publicId = order?.public_id || order?.publicId || null;
  const createdAtValue = String(order?.created_at || "").trim() || null;
  for (let index = 0; index < jobs.length; index += 1) {
    const job = jobs[index];
    const syntheticOrderId = -(orderId * 1000 + (index + 1));
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
        syntheticOrderId,
        publicId,
        job.job_name || "CRM Label",
        payload,
        createdAtValue,
        createdAtValue,
      ]
    );
  }
  return jobs.length;
}

async function sendOrderToPrintBot({ db, order, tenantId, storeId, silentSkipReasons }) {
  const mutedReasons = new Set(
    Array.isArray(silentSkipReasons)
      ? silentSkipReasons.map((reason) => String(reason || "").trim()).filter(Boolean)
      : []
  );
  const orderIdDebug = Number(order?.id || order?.order_id || order?.orderId || 0);
  const fail = (reason, extra = {}) => {
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
    console.error("Label enqueue failed:", {
      orderId: orderIdDebug || null,
      tenantId: resolvedTenantId,
      storeId: resolvedStoreId,
      error: String(labelErr?.message || labelErr || "unknown_error"),
    });
  }
  return true;
}

module.exports = { sendOrderToPrintBot };

