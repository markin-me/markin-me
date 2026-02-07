const http = require("http");
const https = require("https");
const { URL } = require("url");

const BOT_HOST = "127.0.0.1";
const BOT_PORT = 7788;
const CRM_BASE_URL = (process.env.CRM_BASE_URL || "http://localhost:3000").replace(/\/+$/, "");

let browserPromise = null;

async function getPuppeteer() {
  if (!browserPromise) {
    browserPromise = import("puppeteer").then((mod) => mod.default || mod);
  }
  return browserPromise;
}

async function getBrowser() {
  const puppeteer = await getPuppeteer();
  if (getBrowser.instance) return getBrowser.instance;
  getBrowser.instance = await puppeteer.launch({
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
    headless: true
  });
  return getBrowser.instance;
}

async function renderPdfFromHtml(html) {
  const browser = await getBrowser();
  const page = await browser.newPage();
  await page.setContent(html, { waitUntil: "networkidle0" });
  await page.emulateMediaType("print");

  const dimensions = await page.evaluate(() => ({
    width: document.body.scrollWidth,
    height: document.body.scrollHeight
  }));

  const width = Math.ceil(dimensions.width || 0);
  const height = Math.ceil(dimensions.height || 0);

  const pdfBuffer = await page.pdf({
    width: `${width}px`,
    height: `${height}px`,
    printBackground: true,
    margin: { top: "0px", right: "0px", bottom: "0px", left: "0px" }
  });

  await page.close();
  return pdfBuffer;
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

async function getPrintToken(db, tenantId, storeId) {
  const [rows] = await db.query(
    `SELECT token FROM print_api_tokens WHERE tenant_id=? AND store_id=? AND is_active=1 ORDER BY id DESC LIMIT 1`,
    [tenantId, storeId]
  );
  return rows[0]?.token || null;
}

function postToBot(token, payload) {
  return new Promise((resolve) => {
    const body = Buffer.from(JSON.stringify(payload));
    const req = http.request(
      {
        hostname: BOT_HOST,
        port: BOT_PORT,
        path: "/print",
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Content-Length": body.length,
          "X-Api-Key": token || ""
        },
        timeout: 8000
      },
      (res) => {
        res.on("data", () => {});
        res.on("end", () => resolve(true));
      }
    );
    req.on("timeout", () => {
      req.destroy();
      resolve(false);
    });
    req.on("error", () => resolve(false));
    req.write(body);
    req.end();
  });
}

async function sendOrderToPrintBot({ db, order, tenantId, storeId }) {
  if (!order) return false;
  const statusId = Number(order.status_id ?? order.statusId ?? order.statusID ?? 0);
  if (statusId !== 1) return false;

  const resolvedTenantId = Number(tenantId || order.tenant_id || order.tenantId || order.tenantID || order.tenant);
  const resolvedStoreId = Number(storeId || order.store_id || order.storeId || order.storeID || order.store);
  if (!resolvedTenantId || !resolvedStoreId) return false;

  const token = await getPrintToken(db, resolvedTenantId, resolvedStoreId);
  if (!token) return false;

  const html = await fetchReceiptHtml(token, order.id || order.order_id || order.orderId);
  if (!html) return false;

  const pdfBuffer = await renderPdfFromHtml(html);
  if (!pdfBuffer || !pdfBuffer.length) return false;

  const payload = {
    order: {
      id: order.id,
      public_id: order.public_id
    },
    pdf_base64: pdfBuffer.toString("base64")
  };

  await postToBot(token, payload);
  return true;
}

module.exports = { sendOrderToPrintBot };
