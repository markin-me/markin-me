const express = require('express');
const path = require('path');
const crypto = require('crypto');
const fs = require('fs');
const multer = require('multer');

module.exports = function makeAdminProductsRouter({ db, helpers }) {
  const router = express.Router();
  let hasCategoryCheckoutVisibilityColumn = null;
  let discountDeletedColumnsReady = false;
  let ensureDiscountDeletedColumnsPromise = null;
  const PRODUCT_BLOCK_KEYS = Object.freeze([
    "description",
    "variants",
    "options",
    "ingredients",
    "promotions",
  ]);
  const ADMIN_CACHE_TTL_MS = Object.freeze({
    checkoutConstructorDraft: 30_000,
    newOrderManifest: 5_000,
  });
  const adminResponseCache = new Map();
  const adminResponseInflight = new Map();
  const ADMIN_CACHE_MAX_KEYS = 500;

  function stableCachePart(value) {
    if (Array.isArray(value)) return value.map((v) => stableCachePart(v));
    if (value && typeof value === "object") {
      const out = {};
      Object.keys(value).sort().forEach((k) => {
        out[k] = stableCachePart(value[k]);
      });
      return out;
    }
    return value;
  }

  function makeAdminCacheKey(prefix, parts) {
    return `${String(prefix || "admin")}::${JSON.stringify(stableCachePart(parts || {}))}`;
  }

  function getAdminCache(key) {
    const hit = adminResponseCache.get(key);
    if (!hit) return null;
    if (hit.expiresAt <= Date.now()) {
      adminResponseCache.delete(key);
      return null;
    }
    return hit.data;
  }

  function pruneAdminCacheIfNeeded() {
    if (adminResponseCache.size <= ADMIN_CACHE_MAX_KEYS) return;
    const entries = Array.from(adminResponseCache.entries());
    entries.sort((a, b) => Number(a[1]?.createdAt || 0) - Number(b[1]?.createdAt || 0));
    const overflow = adminResponseCache.size - ADMIN_CACHE_MAX_KEYS;
    for (let i = 0; i < overflow; i += 1) adminResponseCache.delete(entries[i][0]);
  }

  function setAdminCache(key, data, ttlMs) {
    const ttl = Math.max(1000, Number(ttlMs || 0));
    adminResponseCache.set(key, {
      data,
      createdAt: Date.now(),
      expiresAt: Date.now() + ttl,
    });
    pruneAdminCacheIfNeeded();
  }

  async function loadAdminCachedPayload(cacheKey, ttlMs, loader) {
    const cached = getAdminCache(cacheKey);
    if (cached) return { payload: cached, cacheState: "HIT" };

    const inflight = adminResponseInflight.get(cacheKey);
    if (inflight) {
      const payload = await inflight;
      return { payload, cacheState: "WAIT" };
    }

    const task = (async () => {
      const fresh = await loader();
      setAdminCache(cacheKey, fresh, ttlMs);
      return fresh;
    })().finally(() => {
      adminResponseInflight.delete(cacheKey);
    });
    adminResponseInflight.set(cacheKey, task);
    const payload = await task;
    return { payload, cacheState: "MISS" };
  }

  function invalidateAdminCacheByPrefix(prefix) {
    const p = String(prefix || "");
    if (!p) return;
    for (const key of adminResponseCache.keys()) {
      if (key.startsWith(p)) adminResponseCache.delete(key);
    }
  }

  async function readTableStamp(table, whereSql, params = []) {
    const safeTable = String(table || "").trim();
    if (!/^[a-zA-Z0-9_]+$/.test(safeTable)) return "0:0";
    const whereClause = String(whereSql || "1");
    const tryQueries = [
      `SELECT UNIX_TIMESTAMP(MAX(updated_at)) AS stamp, COUNT(*) AS cnt FROM \`${safeTable}\` WHERE ${whereClause}`,
      `SELECT UNIX_TIMESTAMP(MAX(created_at)) AS stamp, COUNT(*) AS cnt FROM \`${safeTable}\` WHERE ${whereClause}`,
      `SELECT MAX(id) AS stamp, COUNT(*) AS cnt FROM \`${safeTable}\` WHERE ${whereClause}`,
    ];
    for (const sql of tryQueries) {
      try {
        const [rows] = await db.query(sql, params);
        const row = Array.isArray(rows) ? (rows[0] || {}) : {};
        const stamp = Number(row?.stamp || 0);
        const cnt = Number(row?.cnt || 0);
        const safeStamp = Number.isFinite(stamp) ? stamp : 0;
        const safeCnt = Number.isFinite(cnt) ? cnt : 0;
        return `${safeStamp}:${safeCnt}`;
      } catch {}
    }
    return "0:0";
  }

  function makeStampToken(parts) {
    const src = JSON.stringify(Array.isArray(parts) ? parts : []);
    return crypto.createHash("sha1").update(src).digest("hex").slice(0, 16);
  }

  router.use((req, res, next) => {
    const method = String(req.method || "").toUpperCase();
    const shouldWatch = method === "POST" || method === "PUT" || method === "PATCH" || method === "DELETE";
    if (!shouldWatch) return next();
    res.on("finish", () => {
      if (res.statusCode >= 200 && res.statusCode < 400) {
        invalidateAdminCacheByPrefix("new-order-manifest::");
      }
    });
    next();
  });

  async function ensureCategoryCheckoutVisibilityColumnKnown() {
    if (hasCategoryCheckoutVisibilityColumn !== null) return hasCategoryCheckoutVisibilityColumn;
    try {
      const [rows] = await db.query("SHOW COLUMNS FROM prod_categories LIKE 'checkout_visibility'");
      hasCategoryCheckoutVisibilityColumn = Array.isArray(rows) && rows.length > 0;
    } catch (e) {
      hasCategoryCheckoutVisibilityColumn = false;
    }
    return hasCategoryCheckoutVisibilityColumn;
  }

  async function ensureDiscountDeletedColumnsKnown() {
    if (discountDeletedColumnsReady) return true;
    if (ensureDiscountDeletedColumnsPromise) return ensureDiscountDeletedColumnsPromise;
    ensureDiscountDeletedColumnsPromise = (async () => {
      const [columnRows] = await db.query("SHOW COLUMNS FROM mkt_discounts");
      const existing = new Set(
        (Array.isArray(columnRows) ? columnRows : [])
          .map((row) => String(row?.Field || "").trim())
          .filter(Boolean)
      );
      if (!existing.has("is_deleted")) {
        try {
          await db.query("ALTER TABLE mkt_discounts ADD COLUMN `is_deleted` TINYINT(1) NOT NULL DEFAULT 0 AFTER `hide_in_benefits`");
          existing.add("is_deleted");
        } catch (err) {
          if (String(err?.code || "") !== "ER_DUP_FIELDNAME") throw err;
          existing.add("is_deleted");
        }
      }
      if (!existing.has("deleted_at")) {
        try {
          await db.query("ALTER TABLE mkt_discounts ADD COLUMN `deleted_at` DATETIME NULL AFTER `is_deleted`");
          existing.add("deleted_at");
        } catch (err) {
          if (String(err?.code || "") !== "ER_DUP_FIELDNAME") throw err;
          existing.add("deleted_at");
        }
      }
      discountDeletedColumnsReady = existing.has("is_deleted") && existing.has("deleted_at");
      return discountDeletedColumnsReady;
    })()
      .catch((err) => {
        ensureDiscountDeletedColumnsPromise = null;
        throw err;
      })
      .finally(() => {
        if (discountDeletedColumnsReady) {
          ensureDiscountDeletedColumnsPromise = null;
        }
      });
    return ensureDiscountDeletedColumnsPromise;
  }

  function getDefaultProductBlocksConfig() {
    return {
      description: false,
      variants: false,
      options: false,
      ingredients: false,
      promotions: false,
    };
  }

  function normalizeProductBlocksConfig(rawValue, fallbackValue = null) {
    let parsed = rawValue;
    if (typeof parsed === "string") {
      const trimmed = parsed.trim();
      if (!trimmed) parsed = null;
      else {
        try {
          parsed = JSON.parse(trimmed);
        } catch {
          parsed = null;
        }
      }
    }
    const fallback = fallbackValue && typeof fallbackValue === "object"
      ? fallbackValue
      : getDefaultProductBlocksConfig();
    const out = {};
    PRODUCT_BLOCK_KEYS.forEach((key) => {
      out[key] = Boolean(parsed && typeof parsed === "object" && parsed[key] != null ? parsed[key] : fallback[key]);
    });
    return out;
  }

  async function resolveProductBlocksConfigMap(tenantId, storeId, productRows = []) {
    const rows = Array.isArray(productRows) ? productRows : [];
    const rowById = new Map();
    rows.forEach((row) => {
      const productId = Number(row?.id || 0);
      if (productId > 0) rowById.set(productId, row);
    });
    const productIds = Array.from(rowById.keys());
    const result = new Map();
    if (!productIds.length) return result;

    const unresolvedIds = [];
    for (const productId of productIds) {
      const row = rowById.get(productId);
      const raw = row?.blocks_config_json ?? row?.blocks_config ?? null;
      if (raw != null) {
        result.set(productId, normalizeProductBlocksConfig(raw));
      } else {
        unresolvedIds.push(productId);
      }
    }
    if (!unresolvedIds.length) return result;

    const computedById = new Map();
    unresolvedIds.forEach((productId) => {
      const row = rowById.get(productId) || {};
      computedById.set(productId, {
        ...getDefaultProductBlocksConfig(),
        description: Boolean(
          String(row.description_short || "").trim()
          || String(row.description || "").trim()
        ),
      });
    });

    await ensureDiscountDeletedColumnsKnown();
    const placeholders = unresolvedIds.map(() => "?").join(",");

    const [variantRows] = await db.query(
      `SELECT DISTINCT product_id
       FROM prod_variant_assignments
       WHERE tenant_id=? AND product_id IN (${placeholders}) AND is_active=1`,
      [tenantId, ...unresolvedIds]
    );
    variantRows.forEach((row) => {
      const cfg = computedById.get(Number(row.product_id));
      if (cfg) cfg.variants = true;
    });

    const [optionRows] = await db.query(
      `SELECT DISTINCT assign_id AS product_id
       FROM prod_option_assignments
       WHERE tenant_id=? AND assign_type='product' AND assign_id IN (${placeholders}) AND is_active=1`,
      [tenantId, ...unresolvedIds]
    );
    optionRows.forEach((row) => {
      const cfg = computedById.get(Number(row.product_id));
      if (cfg) cfg.options = true;
    });

    const [ingredientRows] = await db.query(
      `SELECT DISTINCT product_id
       FROM prod_product_ingredients
       WHERE tenant_id=? AND product_id IN (${placeholders})`,
      [tenantId, ...unresolvedIds]
    );
    ingredientRows.forEach((row) => {
      const cfg = computedById.get(Number(row.product_id));
      if (cfg) cfg.ingredients = true;
    });

    const [promotionRows] = await db.query(
      `SELECT p.id AS product_id,
              CASE
                WHEN EXISTS (
                  SELECT 1
                  FROM mkt_discount_products dp
                  JOIN mkt_discounts d
                    ON d.id = dp.discount_id
                   AND d.tenant_id = dp.tenant_id
                  WHERE dp.tenant_id = p.tenant_id
                    AND d.store_id = ?
                    AND d.is_deleted = 0
                    AND dp.product_id = p.id
                ) OR EXISTS (
                  SELECT 1
                  FROM prod_product_categories pc
                  JOIN mkt_discount_products dp
                    ON dp.tenant_id = pc.tenant_id
                   AND dp.category_id = pc.category_id
                  JOIN mkt_discounts d
                    ON d.id = dp.discount_id
                   AND d.tenant_id = dp.tenant_id
                  WHERE pc.tenant_id = p.tenant_id
                    AND d.store_id = ?
                    AND d.is_deleted = 0
                    AND pc.product_id = p.id
                )
                THEN 1 ELSE 0
              END AS has_promotions
       FROM prod_products p
       WHERE p.tenant_id=? AND p.id IN (${placeholders})`,
      [storeId, storeId, tenantId, ...unresolvedIds]
    );
    promotionRows.forEach((row) => {
      const cfg = computedById.get(Number(row.product_id));
      if (cfg) cfg.promotions = Number(row.has_promotions || 0) === 1;
    });

    unresolvedIds.forEach((productId) => {
      result.set(productId, normalizeProductBlocksConfig(computedById.get(productId)));
    });

    return result;
  }

  // Удаляет файлы фото с диска (оригинал + .webp + thumb)
  function deletePhotoFiles(urls) {
    const staticRoot = path.join(__dirname, '..', '..');
    for (const url of urls) {
      if (!url || !url.startsWith('/static/uploads/products/')) continue;
      const filePath = path.join(staticRoot, url);
      // Удаляем сам файл (webp)
      fs.unlink(filePath, () => {});
      // Удаляем thumb-вариант (-thumb.webp)
      const thumbPath = filePath.replace(/\.webp$/, '-thumb.webp');
      fs.unlink(thumbPath, () => {});
      // Удаляем оригинал (если webp — ищем jpg/png рядом)
      const origBase = filePath.replace(/\.webp$/, '');
      for (const ext of ['.jpg', '.jpeg', '.png', '.gif']) {
        fs.unlink(origBase + ext, () => {});
      }
    }
  }

  // ------------------------------
  // Upload: product images (up to 10)
  // POST /api/upload/product-images
  // ------------------------------
  const uploadStorage = multer.diskStorage({
    destination(req, file, cb) {
      const tenantId = helpers.getTenantId(req);
      const folder = path.join(__dirname, '..', '..', 'static', 'uploads', 'products', String(tenantId));
      helpers.ensureDir(folder);
      cb(null, folder);
    },
    filename(req, file, cb) {
      const ext = path.extname(file.originalname || '').toLowerCase() || '.jpg';
      const name = crypto.randomBytes(16).toString('hex') + ext;
      cb(null, name);
    }
  });

  const upload = multer({
    storage: uploadStorage,
    limits: { files: 10, fileSize: 5 * 1024 * 1024 },
    fileFilter(req, file, cb) {
      const mime = String(file.mimetype || '').toLowerCase();
      const name = String(file.originalname || '').toLowerCase();
      const okByMime = /^image\//.test(mime);
      const okByExt = /\.(jpe?g|png|webp|gif|bmp|svg|heic|heif|avif)$/i.test(name);
      const ok = okByMime || okByExt;
      cb(ok ? null : new Error('ONLY_IMAGES'), ok);
    }
  });

  router.post('/upload/product-images', upload.array('images', 10), async (req, res) => {
    try {
      const tenantId = helpers.getTenantId(req);
      const files = req.files || [];

      // Читаем настройки конвертации из tenant
      const [tenantRows] = await db.query(
        'SELECT img_webp_quality, img_thumb_quality, img_thumb_width, img_main_width, img_webp_aggressive, img_delete_original FROM ten_tenants WHERE id=? LIMIT 1',
        [tenantId]
      );
      const imgSettings = tenantRows[0] || {};
      const webpQuality = imgSettings.img_webp_quality ?? 82;
      const thumbQuality = imgSettings.img_thumb_quality ?? 72;
      const thumbWidth = imgSettings.img_thumb_width ?? 480;
      const mainWidth = imgSettings.img_main_width ?? 1200;
      const webpAggressive = (imgSettings.img_webp_aggressive ?? 0) == 1;
      const deleteOriginal = imgSettings.img_delete_original ?? 1;

      // Гарантируем наличие WebP-варианта для каждого файла
      const webpPaths = await Promise.all(
        files.map((f) =>
          helpers.ensureWebpVariant(
            f.path || path.join(__dirname, '..', '..', 'static', 'uploads', 'products', String(tenantId), f.filename),
            { quality: webpQuality, width: mainWidth, aggressive: webpAggressive, recompress: true, forceUnique: true }
          )
        )
      );
      // Не допускаем тихий fallback без конвертации: если WebP не получен, считаем загрузку ошибкой.
      if (webpPaths.some((p) => !p || !/\.webp$/i.test(String(p)))) {
        return res.status(500).json({ ok: false, error: 'IMAGE_CONVERSION_FAILED' });
      }
      // Генерируем уменьшенные варианты для сетки витрины (LCP)
      await Promise.all(
        webpPaths
          .filter(Boolean)
          .map((p) => helpers.ensureThumbVariant(p, { width: thumbWidth, quality: thumbQuality }))
      );

      // Удаляем исходные загруженные файлы, если включена настройка.
      // Важно: для входного .webp конвертер может вернуть новый файл с другим именем,
      // тогда исходный .webp тоже нужно удалить.
      if (deleteOriginal) {
        for (let idx = 0; idx < files.length; idx++) {
          const f = files[idx];
          const origPath = f.path || path.join(__dirname, '..', '..', 'static', 'uploads', 'products', String(tenantId), f.filename);
          const convertedPath = webpPaths[idx];
          const sameFile = convertedPath && path.resolve(String(convertedPath)) === path.resolve(String(origPath));
          if (!sameFile) {
            fs.unlink(origPath, () => {});
          }
        }
      }

      const staticRoot = path.join(__dirname, '..', '..');
      const urls = files.map((f, idx) => {
        const convertedPath = webpPaths[idx];
        if (convertedPath) {
          const rel = path.relative(path.join(__dirname, '..', '..', 'static'), convertedPath).replace(/\\/g, '/');
          return `/static/${rel}`;
        }
        const ext = path.extname(f.filename || '');
        const fallbackName = ext ? `${f.filename.slice(0, -ext.length)}.webp` : `${f.filename}.webp`;
        return `/static/uploads/products/${tenantId}/${fallbackName}`;
      });

      // Собираем размеры итоговых файлов
      const sizes = urls.map((url) => {
        try { return fs.statSync(path.join(staticRoot, url)).size; } catch { return 0; }
      });

      res.json({ ok: true, urls, sizes });
    } catch (e) {
      console.error(e);
      res.status(500).json({ ok: false, error: 'UPLOAD_ERROR' });
    }
  });

  // ------------------------------
  // Upload: category icon
  // POST /api/upload/category-icon
  // ------------------------------
  const categoryIconStorage = multer.diskStorage({
    destination(req, file, cb) {
      const folder = path.join(__dirname, '..', '..', 'static', 'uploads', 'categories');
      helpers.ensureDir(folder);
      cb(null, folder);
    },
    filename(req, file, cb) {
      const ext = path.extname(file.originalname || '').toLowerCase() || '.jpg';
      const name = crypto.randomBytes(16).toString('hex') + ext;
      cb(null, name);
    }
  });

  const categoryIconUpload = multer({
    storage: categoryIconStorage,
    limits: { files: 1, fileSize: 5 * 1024 * 1024 },
    fileFilter(req, file, cb) {
      const ok = /^image\/(jpeg|png|webp)$/.test(file.mimetype);
      cb(ok ? null : new Error('ONLY_IMAGES'), ok);
    }
  });

  router.post('/upload/category-icon', categoryIconUpload.single('icon'), async (req, res) => {
    try {
      const file = req.file;
      if (!file) return res.status(400).json({ ok: false, error: 'ICON_REQUIRED' });
      await helpers.ensureWebpVariant(file.path || path.join(__dirname, '..', '..', 'static', 'uploads', 'categories', file.filename));
      const url = `/static/uploads/categories/${file.filename.replace(/\.(jpe?g|png|gif)$/i, '.webp')}`;
      res.json({ ok: true, url });
    } catch (e) {
      console.error(e);
      res.status(500).json({ ok: false, error: 'UPLOAD_ERROR' });
    }
  });

  // ------------------------------
  // Categories: /api/prod_categories
  // ------------------------------
  router.get('/prod_categories', async (req, res) => {
    try {
      const tenantId = helpers.getTenantId(req);
      const rows = await helpers.ensureDefaultCategories(db, tenantId);
      res.json({ ok: true, data: rows });
    } catch (e) {
      console.error(e);
      res.status(500).json({ ok: false, error: 'DB_ERROR' });
    }
  });

  // ------------------------------
  // New-order lightweight data manifest
  // GET /api/new-order/manifest
  // ------------------------------
  router.get('/new-order/manifest', async (req, res) => {
    try {
      const tenantId = helpers.getTenantId(req);
      const storeId = helpers.getStoreId(req);
      const cacheKey = makeAdminCacheKey("new-order-manifest", { tenantId, storeId });
      const { payload, cacheState } = await loadAdminCachedPayload(
        cacheKey,
        ADMIN_CACHE_TTL_MS.newOrderManifest,
        async () => {
          const [
            categoriesStamp,
            checkoutBlocksStamp,
            checkoutBlockCategoriesStamp,
            productsStamp,
            productCategoriesStamp,
            productStocksStamp,
            variantsAssignmentsStamp,
            variantGroupsStamp,
            variantDiscountTiersStamp,
            ingredientsStamp,
            optionAssignmentsStamp,
            optionGroupsStamp,
            optionItemsStamp,
            combosStamp,
            comboSetBlocksStamp,
            comboBlocksStamp,
            comboBlockProductsStamp,
            discountsStamp,
            discountProductsStamp,
            unitConversionsStamp,
            tenantStamp,
            storesStamp,
            orderPaymentsStamp,
            orderDeliveryStamp,
            orderTimeOptionsStamp,
          ] = await Promise.all([
            readTableStamp("prod_categories", "tenant_id=?", [tenantId]),
            readTableStamp("prod_checkout_constructor_blocks", "tenant_id=?", [tenantId]),
            readTableStamp("prod_checkout_constructor_block_categories", "tenant_id=?", [tenantId]),
            readTableStamp("prod_products", "tenant_id=?", [tenantId]),
            readTableStamp("prod_product_categories", "tenant_id=?", [tenantId]),
            readTableStamp("prod_product_stocks", "tenant_id=? AND store_id=?", [tenantId, storeId]),
            readTableStamp("prod_variant_assignments", "tenant_id=?", [tenantId]),
            readTableStamp("prod_variant_groups", "tenant_id=?", [tenantId]),
            readTableStamp("prod_variant_discount_tiers", "tenant_id=?", [tenantId]),
            readTableStamp("prod_variant_value_exclusions", "tenant_id=?", [tenantId]),
            readTableStamp("prod_product_ingredients", "tenant_id=?", [tenantId]),
            readTableStamp("prod_option_assignments", "tenant_id=?", [tenantId]),
            readTableStamp("prod_option_groups", "tenant_id=?", [tenantId]),
            readTableStamp("prod_option_items", "tenant_id=?", [tenantId]),
            readTableStamp("prod_option_item_exclusions", "tenant_id=?", [tenantId]),
            readTableStamp("prod_combos", "tenant_id=?", [tenantId]),
            readTableStamp("prod_combo_set_blocks", "tenant_id=?", [tenantId]),
            readTableStamp("prod_combo_blocks", "tenant_id=?", [tenantId]),
            readTableStamp("prod_combo_block_products", "tenant_id=?", [tenantId]),
            readTableStamp("mkt_discounts", "tenant_id=? AND store_id=?", [tenantId, storeId]),
            readTableStamp("mkt_discount_products", "tenant_id=?", [tenantId]),
            readTableStamp("prod_unit_conversions", "tenant_id=?", [tenantId]),
            readTableStamp("ten_tenants", "id=?", [tenantId]),
            readTableStamp("ten_stores", "tenant_id=?", [tenantId]),
            readTableStamp("order_payments", "tenant_id=?", [tenantId]),
            readTableStamp("order_delivery_types", "tenant_id=?", [tenantId]),
            readTableStamp("order_time_options", "tenant_id=?", [tenantId]),
          ]);

          const domains = {
            categories: {
              token: makeStampToken([categoriesStamp]),
            },
            checkout: {
              token: makeStampToken([checkoutBlocksStamp, checkoutBlockCategoriesStamp]),
            },
            products: {
              token: makeStampToken([
                productsStamp,
                productCategoriesStamp,
                productStocksStamp,
                variantsAssignmentsStamp,
                variantGroupsStamp,
                variantDiscountTiersStamp,
                ingredientsStamp,
                optionAssignmentsStamp,
                optionGroupsStamp,
                optionItemsStamp,
                combosStamp,
                comboSetBlocksStamp,
                comboBlocksStamp,
                comboBlockProductsStamp,
                discountsStamp,
                discountProductsStamp,
                unitConversionsStamp,
              ]),
            },
            refs: {
              token: makeStampToken([
                tenantStamp,
                storesStamp,
                orderPaymentsStamp,
                orderDeliveryStamp,
                orderTimeOptionsStamp,
              ]),
            },
          };

          return {
            ok: true,
            data: {
              generated_at: Date.now(),
              domains,
            },
          };
        }
      );

      res.set("x-admin-cache", cacheState);
      return res.json(payload);
    } catch (e) {
      console.error(e);
      return res.status(500).json({ ok: false, error: "DB_ERROR" });
    }
  });

  // ------------------------------
  // Checkout constructor draft (tenant-level)
  // GET /api/checkout-constructor/draft
  // PUT /api/checkout-constructor/draft
  // ------------------------------
  router.get('/checkout-constructor/draft', async (req, res) => {
    try {
      const tenantId = helpers.getTenantId(req);
      const cacheKey = makeAdminCacheKey("checkout-constructor-draft", { tenantId });
      const { payload, cacheState } = await loadAdminCachedPayload(
        cacheKey,
        ADMIN_CACHE_TTL_MS.checkoutConstructorDraft,
        async () => {
          const [blocksRows] = await db.query(
            `SELECT id, title, require_all, sort_order
             FROM prod_checkout_constructor_blocks
             WHERE tenant_id=? AND is_active=1
             ORDER BY sort_order ASC, id ASC`,
            [tenantId]
          );

          const blockIds = blocksRows.map((r) => Number(r.id)).filter((id) => Number.isFinite(id) && id > 0);
          let categoriesRows = [];
          if (blockIds.length) {
            const [catRows] = await db.query(
              `SELECT block_id, category_id, sort_order
               FROM prod_checkout_constructor_block_categories
               WHERE tenant_id=? AND block_id IN (?)
               ORDER BY sort_order ASC, id ASC`,
              [tenantId, blockIds]
            );
            categoriesRows = Array.isArray(catRows) ? catRows : [];
          }

          const categoriesByBlock = new Map();
          categoriesRows.forEach((row) => {
            const blockId = Number(row.block_id || 0);
            const categoryId = Number(row.category_id || 0);
            if (!(blockId > 0) || !(categoryId > 0)) return;
            if (!categoriesByBlock.has(blockId)) categoriesByBlock.set(blockId, []);
            categoriesByBlock.get(blockId).push(categoryId);
          });

          const blocks = blocksRows.map((row) => {
            const id = Number(row.id || 0);
            return {
              id,
              title: String(row.title || ''),
              requireAll: Number(row.require_all || 0) !== 0,
              categoryIds: categoriesByBlock.get(id) || [],
            };
          });
          return { ok: true, data: { blocks } };
        }
      );
      res.set("x-admin-cache", cacheState);
      res.json(payload);
    } catch (e) {
      console.error(e);
      res.status(500).json({ ok: false, error: 'DB_ERROR' });
    }
  });

  router.put('/checkout-constructor/draft', async (req, res) => {
    const conn = await db.getConnection();
    try {
      const tenantId = helpers.getTenantId(req);
      const inputBlocks = Array.isArray(req.body?.blocks) ? req.body.blocks : [];
      const normalizedBlocks = inputBlocks
        .map((block, index) => {
          const rawCategoryIds = Array.isArray(block?.categoryIds) ? block.categoryIds : [];
          const categoryIds = [...new Set(
            rawCategoryIds
              .map((id) => Number(id))
              .filter((id) => Number.isFinite(id) && id > 0)
          )];
          if (!categoryIds.length) return null;
          return {
            title: String(block?.title || '').trim().slice(0, 120),
            requireAll: block?.requireAll == null ? true : !!block.requireAll,
            sortOrder: Number.isFinite(Number(block?.sortOrder)) ? Number(block.sortOrder) : (index + 1) * 10,
            categoryIds,
          };
        })
        .filter(Boolean);

      await conn.beginTransaction();

      await conn.query('DELETE FROM prod_checkout_constructor_block_categories WHERE tenant_id=?', [tenantId]);
      await conn.query('DELETE FROM prod_checkout_constructor_blocks WHERE tenant_id=?', [tenantId]);

      if (normalizedBlocks.length) {
        const allCategoryIds = [...new Set(normalizedBlocks.flatMap((b) => b.categoryIds))];
        const [allowedRows] = await conn.query(
          'SELECT id FROM prod_categories WHERE tenant_id=? AND id IN (?)',
          [tenantId, allCategoryIds]
        );
        const allowed = new Set((Array.isArray(allowedRows) ? allowedRows : []).map((r) => Number(r.id || 0)));

        for (let i = 0; i < normalizedBlocks.length; i += 1) {
          const block = normalizedBlocks[i];
          const sortOrder = Number.isFinite(Number(block.sortOrder)) ? Number(block.sortOrder) : (i + 1) * 10;
          const [insertBlock] = await conn.query(
            `INSERT INTO prod_checkout_constructor_blocks (tenant_id, title, require_all, sort_order, is_active)
             VALUES (?, ?, ?, ?, 1)`,
            [tenantId, block.title || null, block.requireAll ? 1 : 0, sortOrder]
          );
          const blockId = Number(insertBlock.insertId || 0);
          const filteredCategoryIds = block.categoryIds.filter((id) => allowed.has(Number(id)));
          for (let j = 0; j < filteredCategoryIds.length; j += 1) {
            const categoryId = Number(filteredCategoryIds[j]);
            await conn.query(
              `INSERT INTO prod_checkout_constructor_block_categories (tenant_id, block_id, category_id, sort_order)
               VALUES (?, ?, ?, ?)`,
              [tenantId, blockId, categoryId, (j + 1) * 10]
            );
          }
        }
      }

      await conn.commit();
      invalidateAdminCacheByPrefix("checkout-constructor-draft::");
      res.json({ ok: true });
    } catch (e) {
      try { await conn.rollback(); } catch {}
      console.error(e);
      res.status(500).json({ ok: false, error: 'DB_ERROR' });
    } finally {
      conn.release();
    }
  });

  router.post('/prod_categories', async (req, res) => {
    try {
      const tenantId = helpers.getTenantId(req);

      const title = helpers.strOrNull(req.body.title);
      if (!title) return res.status(400).json({ ok: false, error: 'TITLE_REQUIRED' });

      const code = helpers.strOrNull(req.body.code) || helpers.makeCodeFromTitle(title);
      const icon = helpers.strOrNull(req.body.icon);

      const site_visibility = helpers.toBool(req.body.site_visibility, true) ? 1 : 0;
      const is_active = helpers.toBool(req.body.is_active, true) ? 1 : 0;
      const cart_visibility = helpers.toBool(req.body.cart_visibility, false) ? 1 : 0;
      const checkout_visibility = helpers.toBool(req.body.checkout_visibility, true) ? 1 : 0;
      const hasCheckoutVisibilityColumn = await ensureCategoryCheckoutVisibilityColumnKnown();

      const sort_order =
        helpers.numOrNull(req.body.sort_order) ??
        (await helpers.nextSortOrderForCategories(db, tenantId, 10));

      const [result] = hasCheckoutVisibilityColumn
        ? await db.query(
          'INSERT INTO prod_categories (tenant_id, code, title, icon, site_visibility, is_active, cart_visibility, checkout_visibility, sort_order) VALUES (?,?,?,?,?,?,?,?,?)',
          [tenantId, code, title, icon, site_visibility, is_active, cart_visibility, checkout_visibility, sort_order]
        )
        : await db.query(
          'INSERT INTO prod_categories (tenant_id, code, title, icon, site_visibility, is_active, cart_visibility, sort_order) VALUES (?,?,?,?,?,?,?,?)',
          [tenantId, code, title, icon, site_visibility, is_active, cart_visibility, sort_order]
        );

      res.json({ ok: true, id: result.insertId });
    } catch (e) {
      console.error(e);
      res.status(500).json({ ok: false, error: 'DB_ERROR' });
    }
  });

  router.put('/prod_categories/:id', async (req, res) => {
    try {
      const tenantId = helpers.getTenantId(req);
      const id = Number(req.params.id);
      if (!Number.isFinite(id) || id <= 0) return res.status(400).json({ ok: false, error: 'BAD_ID' });

      const title = helpers.strOrNull(req.body.title);
      if (!title) return res.status(400).json({ ok: false, error: 'TITLE_REQUIRED' });

      const code = helpers.strOrNull(req.body.code) || helpers.makeCodeFromTitle(title);
      const icon = helpers.strOrNull(req.body.icon);
      const site_visibility = helpers.toBool(req.body.site_visibility, true) ? 1 : 0;
      const is_active = helpers.toBool(req.body.is_active, true) ? 1 : 0;
      const cart_visibility = helpers.toBool(req.body.cart_visibility, false) ? 1 : 0;
      const checkout_visibility = helpers.toBool(req.body.checkout_visibility, true) ? 1 : 0;
      const sort_order = helpers.numOrNull(req.body.sort_order);
      const hasCheckoutVisibilityColumn = await ensureCategoryCheckoutVisibilityColumnKnown();

      if (hasCheckoutVisibilityColumn) {
        await db.query(
          `UPDATE prod_categories
           SET code=?, title=?, icon=?, site_visibility=?, is_active=?, cart_visibility=?, checkout_visibility=?, sort_order=COALESCE(?, sort_order)
           WHERE tenant_id=? AND id=?`,
          [code, title, icon, site_visibility, is_active, cart_visibility, checkout_visibility, sort_order, tenantId, id]
        );
      } else {
        await db.query(
          `UPDATE prod_categories
           SET code=?, title=?, icon=?, site_visibility=?, is_active=?, cart_visibility=?, sort_order=COALESCE(?, sort_order)
           WHERE tenant_id=? AND id=?`,
          [code, title, icon, site_visibility, is_active, cart_visibility, sort_order, tenantId, id]
        );
      }

      res.json({ ok: true });
    } catch (e) {
      console.error(e);
      res.status(500).json({ ok: false, error: 'DB_ERROR' });
    }
  });

  // ------------------------------
  // Products that use a given product as ingredient (for "Пересчитать в составе")
  // GET /api/admin/products/used-as-ingredient/:ingredientId
  // ------------------------------
  router.get('/admin/products/used-as-ingredient/:ingredientId', async (req, res) => {
    try {
      const tenantId = helpers.getTenantId(req);
      const ingredientId = Number(req.params.ingredientId);
      if (!Number.isFinite(ingredientId) || ingredientId <= 0) {
        return res.status(400).json({ ok: false, error: 'BAD_INGREDIENT_ID' });
      }
      const [rows] = await db.query(
        `SELECT DISTINCT product_id
         FROM prod_product_ingredients
         WHERE tenant_id=? AND ingredient_id=?
         ORDER BY product_id ASC`,
        [tenantId, ingredientId]
      );
      const product_ids = rows.map((r) => Number(r.product_id)).filter((id) => Number.isFinite(id));
      res.json({ ok: true, product_ids });
    } catch (e) {
      console.error(e);
      res.status(500).json({ ok: false, error: 'DB_ERROR' });
    }
  });

  // GET one product (for recalc: need base_unit_id, base_qty)
  router.get('/prod_products/:id', async (req, res) => {
    try {
      const tenantId = helpers.getTenantId(req);
      const storeId = helpers.getStoreId(req);
      const id = Number(req.params.id);
      if (!Number.isFinite(id) || id <= 0) return res.status(400).json({ ok: false, error: 'BAD_ID' });
      const [rows] = await db.query(
        `SELECT p.id, p.name, p.sku, p.description_short, p.description, p.price, p.old_price, p.cost_price,
                p.unit_id, p.base_unit_id, p.base_qty, p.photos_json, p.blocks_config_json, p.is_active, p.site_visibility,
                s.qty AS stock_qty
         FROM prod_products p
         LEFT JOIN prod_product_stocks s ON s.tenant_id=p.tenant_id AND s.store_id=? AND s.product_id=p.id
         WHERE p.tenant_id=? AND p.id=? LIMIT 1`,
        [storeId, tenantId, id]
      );
      if (!rows.length) return res.status(404).json({ ok: false, error: 'NOT_FOUND' });
      const r = rows[0];
      r.photos = helpers.safeJsonArray(r.photos_json);
      const blocksConfigMap = await resolveProductBlocksConfigMap(tenantId, storeId, [r]);
      r.blocks_config = blocksConfigMap.get(Number(r.id)) || getDefaultProductBlocksConfig();
      res.json({ ok: true, data: r });
    } catch (e) {
      console.error(e);
      res.status(500).json({ ok: false, error: 'DB_ERROR' });
    }
  });

  // ------------------------------
  // Product categories (chips)
  // GET /api/prod_products/:id/categories
  // ------------------------------
  router.get('/prod_products/:id/categories', async (req, res) => {
    try {
      const tenantId = helpers.getTenantId(req);
      const productId = Number(req.params.id);
      if (!Number.isFinite(productId) || productId <= 0) {
        return res.status(400).json({ ok: false, error: 'BAD_ID' });
      }

      const [rows] = await db.query(
        `SELECT c.id, c.code, c.title, c.icon
         FROM prod_product_categories pc
         JOIN prod_categories c
           ON c.tenant_id = pc.tenant_id AND c.id = pc.category_id
         WHERE pc.tenant_id=? AND pc.product_id=?
         ORDER BY c.sort_order ASC, c.id ASC`,
        [tenantId, productId]
      );

      res.json({ ok: true, data: rows });
    } catch (e) {
      console.error(e);
      res.status(500).json({ ok: false, error: 'DB_ERROR' });
    }
  });

  // ------------------------------
  // Product discounts
  // GET /api/prod_products/:id/discounts
  // ------------------------------
  router.get('/prod_products/:id/discounts', async (req, res) => {
    try {
      await ensureDiscountDeletedColumnsKnown();
      const tenantId = helpers.getTenantId(req);
      const storeId = helpers.getStoreId(req);
      const productId = Number(req.params.id);
      
      if (!Number.isFinite(productId) || productId <= 0) {
        return res.status(400).json({ ok: false, error: 'BAD_ID' });
      }

      // Получаем категории товара
      const [productCategories] = await db.query(
        `SELECT category_id FROM prod_product_categories WHERE tenant_id = ? AND product_id = ?`,
        [tenantId, productId]
      );
      const categoryIds = productCategories.map(c => c.category_id);

      // Скидки привязанные напрямую к товару
      const [directDiscounts] = await db.query(
        `SELECT DISTINCT d.id, d.title, d.discount_type, d.discount_value, 
                d.apply_to, d.is_active, d.starts_at, d.ends_at,
                'direct' AS link_type
         FROM mkt_discounts d
         JOIN mkt_discount_products dp ON dp.discount_id = d.id AND dp.tenant_id = d.tenant_id
         WHERE d.tenant_id = ? AND d.store_id = ? AND d.is_deleted = 0 AND dp.product_id = ?`,
        [tenantId, storeId, productId]
      );

      // Скидки по категориям товара
      let categoryDiscounts = [];
      if (categoryIds.length > 0) {
        const [catDisc] = await db.query(
          `SELECT DISTINCT d.id, d.title, d.discount_type, d.discount_value,
                  d.apply_to, d.is_active, d.starts_at, d.ends_at,
                  'category' AS link_type, pc.title AS category_title
           FROM mkt_discounts d
           JOIN mkt_discount_products dp ON dp.discount_id = d.id AND dp.tenant_id = d.tenant_id
           JOIN prod_categories pc ON pc.id = dp.category_id AND pc.tenant_id = dp.tenant_id
           WHERE d.tenant_id = ? AND d.store_id = ? AND d.is_deleted = 0 AND dp.category_id IN (?)`,
          [tenantId, storeId, categoryIds]
        );
        categoryDiscounts = catDisc;
      }

      // Объединяем и убираем дубликаты
      const allDiscounts = [...directDiscounts];
      const existingIds = new Set(directDiscounts.map(d => d.id));
      
      for (const discount of categoryDiscounts) {
        if (!existingIds.has(discount.id)) {
          allDiscounts.push(discount);
          existingIds.add(discount.id);
        }
      }

      res.json({ ok: true, data: allDiscounts });
    } catch (e) {
      console.error('GET /api/prod_products/:id/discounts error:', e);
      res.status(500).json({ ok: false, error: 'DB_ERROR' });
    }
  });

  // ------------------------------
  // Products: /api/prod_products
  // ------------------------------
  router.get('/prod_products', async (req, res) => {
    try {
      const tenantId = helpers.getTenantId(req);
      const storeId = helpers.getStoreId(req);
      const allCategoryId = await helpers.getAllCategoryId(db, tenantId);
      const q = helpers.strOrNull(req.query.q);
      const hasSearch = Boolean(q);
      const searchSql = hasSearch ? ' AND (p.name LIKE ? OR p.sku LIKE ?)' : '';
      const searchParams = hasSearch ? [`%${q}%`, `%${q}%`] : [];

      const categoryId = Number(req.query.category_id || allCategoryId);
      if (!Number.isFinite(categoryId)) return res.status(400).json({ ok: false, error: 'BAD_CATEGORY_ID' });
      const paginationRequested = req.query.limit !== undefined || req.query.offset !== undefined;
      const listMode = helpers.toBool(req.query.list, false);
      const listSelectFields = `
        p.id, p.tenant_id, p.name, p.sku, p.description_short, p.description,
        p.price, p.old_price, p.cost_price,
        p.unit_id, p.base_unit_id, p.base_qty,
        p.photos_json, p.blocks_config_json,
        p.is_active, p.site_visibility,
        p.created_at, p.updated_at
      `;
      const productSelectFields = listMode ? listSelectFields : 'p.*';
      let limit = null;
      let offset = 0;
      if (paginationRequested) {
        limit = Number(req.query.limit ?? 80);
        offset = Number(req.query.offset ?? 0);
        if (!Number.isFinite(limit) || limit <= 0) limit = 80;
        if (limit > 200) limit = 200;
        if (!Number.isFinite(offset) || offset < 0) offset = 0;
        limit = Math.trunc(limit);
        offset = Math.trunc(offset);
      }

      if (categoryId === allCategoryId) {
        const baseSql =
          `SELECT ${productSelectFields}, pc.sort_order AS link_sort_order, s.qty AS stock_qty
         FROM prod_products p
         LEFT JOIN prod_product_stocks s
           ON s.tenant_id = p.tenant_id AND s.store_id = ? AND s.product_id = p.id
         LEFT JOIN prod_product_categories pc
           ON pc.tenant_id = p.tenant_id AND pc.product_id = p.id AND pc.category_id = ?
         WHERE p.tenant_id=?${searchSql}
         ORDER BY COALESCE(pc.sort_order, 999999) ASC, p.id ASC`;
        const baseParams = [storeId, categoryId, tenantId, ...searchParams];
        const [rows] = paginationRequested
          ? await db.query(`${baseSql} LIMIT ? OFFSET ?`, [...baseParams, limit, offset])
          : await db.query(baseSql, baseParams);

        const missing = [];
        for (const r of rows) {
          r.photos = helpers.safeJsonArray(r.photos_json);
          if (r.link_sort_order == null) missing.push(r);
        }
        const blocksConfigMap = await resolveProductBlocksConfigMap(tenantId, storeId, rows);
        rows.forEach((r) => {
          r.blocks_config = blocksConfigMap.get(Number(r.id)) || getDefaultProductBlocksConfig();
        });

        if (missing.length) {
          let next = await helpers.nextSortOrderForCategory(db, tenantId, categoryId, 10);
          for (const r of missing) {
            await db.query(
              `INSERT INTO prod_product_categories (tenant_id, product_id, category_id, sort_order)
               VALUES (?,?,?,?)
               ON DUPLICATE KEY UPDATE sort_order=VALUES(sort_order)`,
              [tenantId, r.id, categoryId, next]
            );
            r.link_sort_order = next;
            next += 10;
          }
          rows.sort(
            (a, b) =>
              (a.link_sort_order ?? 999999) - (b.link_sort_order ?? 999999) ||
              a.id - b.id
          );
        }

        if (!paginationRequested) {
          return res.json({ ok: true, data: rows, category_id: categoryId });
        }

        const [[cntRow]] = await db.query(
          `SELECT COUNT(*) AS c
           FROM prod_products p
           WHERE p.tenant_id=?${searchSql}`,
          [tenantId, ...searchParams]
        );

        return res.json({
          ok: true,
          data: rows,
          category_id: categoryId,
          total: Number(cntRow?.c || 0),
          limit,
          offset,
        });
      }

      const baseSql =
        `SELECT ${productSelectFields}, pc.sort_order AS link_sort_order, s.qty AS stock_qty
         FROM prod_product_categories pc
         JOIN prod_products p
           ON p.tenant_id = pc.tenant_id AND p.id = pc.product_id
         LEFT JOIN prod_product_stocks s
           ON s.tenant_id = p.tenant_id AND s.store_id = ? AND s.product_id = p.id
         WHERE pc.tenant_id=? AND pc.category_id=?${searchSql}
         ORDER BY pc.sort_order ASC, pc.id ASC`;
      const baseParams = [storeId, tenantId, categoryId, ...searchParams];
      const [rows] = paginationRequested
        ? await db.query(`${baseSql} LIMIT ? OFFSET ?`, [...baseParams, limit, offset])
        : await db.query(baseSql, baseParams);

      for (const r of rows) r.photos = helpers.safeJsonArray(r.photos_json);
      const blocksConfigMap = await resolveProductBlocksConfigMap(tenantId, storeId, rows);
      rows.forEach((r) => {
        r.blocks_config = blocksConfigMap.get(Number(r.id)) || getDefaultProductBlocksConfig();
      });

      if (!paginationRequested) {
        return res.json({ ok: true, data: rows, category_id: categoryId });
      }

      const [[cntRow]] = await db.query(
        `SELECT COUNT(*) AS c
         FROM prod_product_categories pc
         JOIN prod_products p
           ON p.tenant_id = pc.tenant_id AND p.id = pc.product_id
         WHERE pc.tenant_id=? AND pc.category_id=?${searchSql}`,
        [tenantId, categoryId, ...searchParams]
      );

      res.json({
        ok: true,
        data: rows,
        category_id: categoryId,
        total: Number(cntRow?.c || 0),
        limit,
        offset,
      });
    } catch (e) {
      console.error(e);
      res.status(500).json({ ok: false, error: 'DB_ERROR' });
    }
  });

  router.post('/prod_products', async (req, res) => {
    try {
      const tenantId = helpers.getTenantId(req);
      const storeId = helpers.getStoreId(req);

      const name = helpers.strOrNull(req.body.name);
      if (!name) return res.status(400).json({ ok: false, error: 'NAME_REQUIRED' });

      const sku = helpers.strOrNull(req.body.sku);
      const description_short = helpers.strOrNull(req.body.description_short);
      const description = helpers.strOrNull(req.body.description);

      const price = helpers.numOrNull(req.body.price) ?? 0;
      const old_price = helpers.numOrNull(req.body.old_price);
      const cost_price = helpers.numOrNull(req.body.cost_price);
      const unit_id = helpers.numOrNull(req.body.unit_id);
      const base_unit_id = helpers.numOrNull(req.body.base_unit_id);
      const base_qty = helpers.numOrNull(req.body.base_qty);
      const stock_qty = helpers.numOrNull(req.body.stock);

      const is_active = helpers.toBool(req.body.is_active, true) ? 1 : 0;
      const site_visibility = helpers.toBool(req.body.site_visibility, true) ? 1 : 0;
      const blocks_config = normalizeProductBlocksConfig(req.body.blocks_config);
      const blocks_config_json = JSON.stringify(blocks_config);

      const photosArr = helpers.safeJsonArray(req.body.photos_json || req.body.photos);
      const photos_json = photosArr.length ? JSON.stringify(photosArr.slice(0, 10)) : null;

      const [result] = await db.query(
        `INSERT INTO prod_products
          (tenant_id, name, sku, description_short, description, price, old_price, cost_price, unit_id, base_unit_id, base_qty, photos_json, blocks_config_json, is_active, site_visibility)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        [
          tenantId, name, sku, description_short, description,
          price, old_price, cost_price, unit_id, base_unit_id, base_qty, photos_json, blocks_config_json,
          is_active, site_visibility
        ]
      );

      const productId = result.insertId;
      const categoryIds = Array.isArray(req.body.category_ids) ? req.body.category_ids : [];
      await helpers.setProductCategories(db, tenantId, productId, categoryIds);

      await db.query(
        `INSERT INTO prod_product_stocks (tenant_id, store_id, product_id, qty)
         VALUES (?,?,?,?)
         ON DUPLICATE KEY UPDATE qty=VALUES(qty)`,
        [tenantId, storeId, productId, stock_qty]
      );

      res.json({ ok: true, id: productId });
    } catch (e) {
      console.error(e);
      res.status(500).json({ ok: false, error: 'DB_ERROR' });
    }
  });

  router.put('/prod_products/:id', async (req, res) => {
    try {
      const tenantId = helpers.getTenantId(req);
      const storeId = helpers.getStoreId(req);
      const id = Number(req.params.id);
      if (!Number.isFinite(id) || id <= 0) return res.status(400).json({ ok: false, error: 'BAD_ID' });

      const name = helpers.strOrNull(req.body.name);
      if (!name) return res.status(400).json({ ok: false, error: 'NAME_REQUIRED' });

      const sku = helpers.strOrNull(req.body.sku);
      const description_short = helpers.strOrNull(req.body.description_short);
      const description = helpers.strOrNull(req.body.description);

      const price = helpers.numOrNull(req.body.price) ?? 0;
      const old_price = helpers.numOrNull(req.body.old_price);
      const cost_price = helpers.numOrNull(req.body.cost_price);
      const unit_id = helpers.numOrNull(req.body.unit_id);
      const base_unit_id = helpers.numOrNull(req.body.base_unit_id);
      const base_qty = helpers.numOrNull(req.body.base_qty);
      const stock_qty = helpers.numOrNull(req.body.stock);

      const is_active = helpers.toBool(req.body.is_active, true) ? 1 : 0;
      const site_visibility = helpers.toBool(req.body.site_visibility, true) ? 1 : 0;
      const hasBlocksConfig = Object.prototype.hasOwnProperty.call(req.body || {}, 'blocks_config');
      const blocks_config = hasBlocksConfig ? normalizeProductBlocksConfig(req.body.blocks_config) : null;
      const blocks_config_json = hasBlocksConfig ? JSON.stringify(blocks_config) : null;

      const photosArr = helpers.safeJsonArray(req.body.photos_json || req.body.photos);
      const photos_json = photosArr.length ? JSON.stringify(photosArr.slice(0, 10)) : null;

      // Удаляем файлы фото, которые были удалены пользователем
      const [oldRows] = await db.query(
        'SELECT photos_json FROM prod_products WHERE tenant_id=? AND id=? LIMIT 1',
        [tenantId, id]
      );
      if (oldRows.length) {
        const oldPhotos = helpers.safeJsonArray(oldRows[0].photos_json);
        const newSet = new Set(photosArr);
        const removed = oldPhotos.filter((u) => !newSet.has(u));
        if (removed.length) deletePhotoFiles(removed);
      }

      await db.query(
        `UPDATE prod_products
         SET name=?, sku=?, description_short=?, description=?, price=?, old_price=?, cost_price=?, unit_id=?, base_unit_id=?, base_qty=?, photos_json=?, blocks_config_json=COALESCE(?, blocks_config_json), is_active=?, site_visibility=?
         WHERE tenant_id=? AND id=?`,
        [
          name, sku, description_short, description,
          price, old_price, cost_price, unit_id, base_unit_id, base_qty, photos_json, blocks_config_json,
          is_active, site_visibility,
          tenantId, id
        ]
      );

      const categoryIds = Array.isArray(req.body.category_ids) ? req.body.category_ids : [];
      await helpers.setProductCategories(db, tenantId, id, categoryIds);

      await db.query(
        `INSERT INTO prod_product_stocks (tenant_id, store_id, product_id, qty)
         VALUES (?,?,?,?)
         ON DUPLICATE KEY UPDATE qty=VALUES(qty)`,
        [tenantId, storeId, id, stock_qty]
      );

      res.json({ ok: true });
    } catch (e) {
      console.error(e);
      res.status(500).json({ ok: false, error: 'DB_ERROR' });
    }
  });

  // PATCH /api/prod_products/:id — только cost_price, price, base_qty (для пересчёта по составу)
  router.patch('/prod_products/:id', async (req, res) => {
    try {
      const tenantId = helpers.getTenantId(req);
      const storeId = helpers.getStoreId(req);
      const id = Number(req.params.id);
      if (!Number.isFinite(id) || id <= 0) return res.status(400).json({ ok: false, error: 'BAD_ID' });
      const hasCostPrice = Object.prototype.hasOwnProperty.call(req.body || {}, 'cost_price');
      const hasPrice = Object.prototype.hasOwnProperty.call(req.body || {}, 'price');
      const hasOldPrice = Object.prototype.hasOwnProperty.call(req.body || {}, 'old_price');
      const hasBaseQty = Object.prototype.hasOwnProperty.call(req.body || {}, 'base_qty');
      const hasIsActive = Object.prototype.hasOwnProperty.call(req.body || {}, 'is_active');
      const hasSiteVisibility = Object.prototype.hasOwnProperty.call(req.body || {}, 'site_visibility');
      const hasStock = Object.prototype.hasOwnProperty.call(req.body || {}, 'stock');
      const cost_price = helpers.numOrNull(req.body.cost_price);
      const price = helpers.numOrNull(req.body.price);
      const old_price = helpers.numOrNull(req.body.old_price);
      const base_qty = helpers.numOrNull(req.body.base_qty);
      const stock_qty = helpers.numOrNull(req.body.stock);
      const is_active = helpers.toBool(req.body.is_active, true) ? 1 : 0;
      const site_visibility = helpers.toBool(req.body.site_visibility, true) ? 1 : 0;
      const updates = [];
      const params = [];
      if (hasCostPrice) { updates.push('cost_price=?'); params.push(cost_price); }
      if (hasPrice) { updates.push('price=?'); params.push(price ?? 0); }
      if (hasOldPrice) { updates.push('old_price=?'); params.push(old_price); }
      if (hasBaseQty) { updates.push('base_qty=?'); params.push(base_qty); }
      if (hasIsActive) { updates.push('is_active=?'); params.push(is_active); }
      if (hasSiteVisibility) { updates.push('site_visibility=?'); params.push(site_visibility); }
      if (updates.length > 0) {
        params.push(tenantId, id);
        await db.query(
          `UPDATE prod_products SET ${updates.join(', ')} WHERE tenant_id=? AND id=?`,
          params
        );
      }
      if (hasStock) {
        await db.query(
          `INSERT INTO prod_product_stocks (tenant_id, store_id, product_id, qty)
           VALUES (?,?,?,?)
           ON DUPLICATE KEY UPDATE qty=VALUES(qty)`,
          [tenantId, storeId, id, stock_qty]
        );
      }
      res.json({ ok: true });
    } catch (e) {
      console.error(e);
      res.status(500).json({ ok: false, error: 'DB_ERROR' });
    }
  });

  // ------------------------------
  // DELETE product (hard delete from DB; order history kept in order_orders.items JSON)
  // DELETE /api/prod_products/:id
  // ------------------------------
  router.delete('/prod_products/:id', async (req, res) => {
    let conn;
    try {
      const tenantId = helpers.getTenantId(req);
      const id = Number(req.params.id);
      if (!Number.isFinite(id) || id <= 0) {
        return res.status(400).json({ ok: false, error: 'BAD_ID' });
      }

      conn = await db.getConnection();
      await conn.beginTransaction();

      const [rows] = await conn.query(
        'SELECT id, photos_json FROM prod_products WHERE tenant_id=? AND id=? LIMIT 1',
        [tenantId, id]
      );
      if (!rows.length) {
        await conn.rollback();
        conn.release();
        return res.status(404).json({ ok: false, error: 'NOT_FOUND' });
      }

      // Удаляем файлы фото с диска
      const photos = helpers.safeJsonArray(rows[0].photos_json);
      if (photos.length) deletePhotoFiles(photos);

      // Remove this product where it is used as ingredient in other products (FK has no ON DELETE)
      await conn.query(
        'DELETE FROM prod_product_ingredients WHERE tenant_id=? AND ingredient_id=?',
        [tenantId, id]
      );
      // Remove category links (no FK to prod_products in schema; avoid orphans)
      await conn.query(
        'DELETE FROM prod_product_categories WHERE tenant_id=? AND product_id=?',
        [tenantId, id]
      );
      // Delete product (CASCADE will remove: prod_product_ingredients product_id, prod_product_stocks, prod_variant_assignments)
      await conn.query(
        'DELETE FROM prod_products WHERE tenant_id=? AND id=?',
        [tenantId, id]
      );

      await conn.commit();
      conn.release();
      res.json({ ok: true });
    } catch (e) {
      if (conn) {
        try { await conn.rollback(); } catch (_) {}
        conn.release();
      }
      console.error(e);
      res.status(500).json({ ok: false, error: 'DB_ERROR' });
    }
  });

  // ------------------------------
  // Sorting
  // POST /api/sort/prod_categories
  // POST /api/sort/prod_products
  // ------------------------------
  router.post('/sort/prod_categories', async (req, res) => {
    const tenantId = helpers.getTenantId(req);
    const ids = Array.isArray(req.body.orderedIds) ? req.body.orderedIds : [];
    const norm = ids.map(x => Number(x)).filter(x => Number.isFinite(x));
    if (!norm.length) return res.status(400).json({ ok: false, error: 'EMPTY' });

    const conn = await db.getConnection();
    try {
      await conn.beginTransaction();
      let sort = 0;
      for (const id of norm) {
        await conn.query(
          'UPDATE prod_categories SET sort_order=? WHERE tenant_id=? AND id=?',
          [sort, tenantId, id]
        );
        sort += 10;
      }
      await conn.commit();
      res.json({ ok: true });
    } catch (e) {
      await conn.rollback();
      console.error(e);
      res.status(500).json({ ok: false, error: 'DB_ERROR' });
    } finally {
      conn.release();
    }
  });

  router.post('/sort/prod_products', async (req, res) => {
    const tenantId = helpers.getTenantId(req);
    const categoryId = Number(req.body.category_id);
    const ids = Array.isArray(req.body.orderedProductIds) ? req.body.orderedProductIds : [];

    if (!Number.isFinite(categoryId)) return res.status(400).json({ ok: false, error: 'BAD_CATEGORY_ID' });
    const norm = ids.map(x => Number(x)).filter(x => Number.isFinite(x));
    if (!norm.length) return res.status(400).json({ ok: false, error: 'EMPTY' });

    const conn = await db.getConnection();
    const maxAttempts = 3;
    try {
      for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
        try {
          await conn.beginTransaction();
          let sort = 0;
          for (const productId of norm) {
            await conn.query(
              `INSERT INTO prod_product_categories (tenant_id, product_id, category_id, sort_order)
               VALUES (?,?,?,?)
               ON DUPLICATE KEY UPDATE sort_order=VALUES(sort_order)`,
              [tenantId, productId, categoryId, sort]
            );
            sort += 10;
          }
          await conn.commit();
          return res.json({ ok: true });
        } catch (e) {
          try { await conn.rollback(); } catch (_) {}
          const isDeadlock = e && (e.code === 'ER_LOCK_DEADLOCK' || e.errno === 1213 || e.sqlState === '40001');
          if (!isDeadlock || attempt >= maxAttempts) throw e;
          await new Promise((resolve) => setTimeout(resolve, attempt * 60));
        }
      }
      return res.status(500).json({ ok: false, error: 'DB_ERROR' });
    } catch (e) {
      console.error(e);
      return res.status(500).json({ ok: false, error: 'DB_ERROR' });
    } finally {
      conn.release();
    }
  });

  // ------------------------------
  // Options: groups/items/assignments
  // ------------------------------
  router.get('/admin/options/groups', async (req, res) => {
    try {
      const tenantId = helpers.getTenantId(req);
      const [rows] = await db.query(
        `SELECT g.*,
                (SELECT COUNT(*) FROM prod_option_items i WHERE i.tenant_id=g.tenant_id AND i.group_id=g.id) AS items_count,
                (SELECT COUNT(*) FROM prod_option_assignments a WHERE a.tenant_id=g.tenant_id AND a.group_id=g.id) AS assignments_count
         FROM prod_option_groups g
         WHERE g.tenant_id=?
         ORDER BY g.sort_order ASC, g.id ASC`,
        [tenantId]
      );
      res.json({ ok: true, data: rows });
    } catch (e) {
      console.error(e);
      res.status(500).json({ ok: false, error: 'DB_ERROR' });
    }
  });

  router.get('/admin/options/groups/:id', async (req, res) => {
    try {
      const tenantId = helpers.getTenantId(req);
      const id = Number(req.params.id);
      const scopedProductId = Number(req.query?.product_id || 0);
      if (!Number.isFinite(id) || id <= 0) return res.status(400).json({ ok: false, error: 'BAD_ID' });

      const [[group]] = await db.query(
        'SELECT * FROM prod_option_groups WHERE tenant_id=? AND id=? LIMIT 1',
        [tenantId, id]
      );
      if (!group) return res.status(404).json({ ok: false, error: 'NOT_FOUND' });

      const [items] = await db.query(
        `SELECT i.*,
                p.name AS product_name,
                p.price AS product_price,
                p.photos_json AS product_photos_json
        FROM prod_option_items i
        JOIN prod_products p ON p.tenant_id=i.tenant_id AND p.id=i.target_product_id
        WHERE i.tenant_id=? AND i.group_id=? AND i.target_type='product'
        ORDER BY i.sort_order ASC, i.id ASC`,
        [tenantId, id]
      );

      const itemProductIds = items
        .map((item) => Number(item.target_product_id))
        .filter((productId) => Number.isFinite(productId) && productId > 0);
      const itemCategoryMap = new Map();
      if (itemProductIds.length) {
        const [categoryRows] = await db.query(
          `SELECT product_id, category_id
           FROM prod_product_categories
           WHERE tenant_id=? AND product_id IN (${itemProductIds.map(() => '?').join(',')})`,
          [tenantId, ...itemProductIds]
        );
        (Array.isArray(categoryRows) ? categoryRows : []).forEach((row) => {
          const productId = Number(row.product_id);
          const categoryId = Number(row.category_id);
          if (!Number.isFinite(productId) || productId <= 0) return;
          if (!Number.isFinite(categoryId) || categoryId <= 0) return;
          if (!itemCategoryMap.has(productId)) itemCategoryMap.set(productId, []);
          itemCategoryMap.get(productId).push(categoryId);
        });
      }

      let excludedItemIds = new Set();
      if (Number.isFinite(scopedProductId) && scopedProductId > 0) {
        try {
          const [excludedRows] = await db.query(
            `SELECT option_item_id
             FROM prod_option_item_exclusions
             WHERE tenant_id=? AND product_id=? AND group_id=?`,
            [tenantId, scopedProductId, id]
          );
          excludedItemIds = new Set(
            (Array.isArray(excludedRows) ? excludedRows : [])
              .map((row) => Number(row.option_item_id))
              .filter((itemId) => Number.isFinite(itemId) && itemId > 0)
          );
        } catch (error) {
          if (error?.code !== 'ER_NO_SUCH_TABLE' && error?.code !== 'ER_BAD_TABLE_ERROR') {
            throw error;
          }
        }
      }

      const [assignments] = await db.query(
        `SELECT a.*, p.name AS product_name
         FROM prod_option_assignments a
         JOIN prod_products p ON p.tenant_id=a.tenant_id AND p.id=a.assign_id
         WHERE a.tenant_id=? AND a.group_id=? AND a.assign_type='product'
         ORDER BY a.sort_order ASC, a.id ASC`,
        [tenantId, id]
      );

      const normalizedItems = items.map((item) => ({
        ...item,
        category_ids: itemCategoryMap.get(Number(item.target_product_id)) || [],
        is_excluded_for_product: excludedItemIds.has(Number(item.id)),
      }));
      const visibleItemIds = normalizedItems
        .filter((item) => item.is_excluded_for_product !== true)
        .map((item) => Number(item.id))
        .filter((itemId) => Number.isFinite(itemId) && itemId > 0);

      res.json({
        ok: true,
        data: {
          group,
          items: normalizedItems,
          assignments,
          product_scope: Number.isFinite(scopedProductId) && scopedProductId > 0
            ? {
                product_id: scopedProductId,
                excluded_item_ids: Array.from(excludedItemIds),
                visible_item_ids: visibleItemIds,
              }
            : null,
        },
      });
    } catch (e) {
      console.error(e);
      res.status(500).json({ ok: false, error: 'DB_ERROR' });
    }
  });

router.post('/admin/options/group-bundle', async (req, res) => {
  const tenantId = helpers.getTenantId(req);
  const group = req.body.group || req.body || {};
  const items = Array.isArray(req.body.items) ? req.body.items : [];
  const assignments = Array.isArray(req.body.assignments) ? req.body.assignments : [];

  const title = helpers.strOrNull(group.title);
  if (!title) return res.status(400).json({ ok: false, error: 'TITLE_REQUIRED' });

  const selectionType = group.selection_type === 'multiple' ? 'multiple' : 'single';

  const minSelect = helpers.numOrNull(group.min_select) ?? 0;
  const maxSelect = helpers.numOrNull(group.max_select);
  const isActive = helpers.toBool(group.is_active, true) ? 1 : 0;

  // ✅ is_required только для single
  const isRequired =
    selectionType === 'single'
      ? (helpers.toBool(group.is_required, true) ? 1 : 0)
      : 0;

  // ✅ allow_variants (переключатель вариантов у пунктов опции)
  const allowVariants = helpers.toBool(group.allow_variants, false) ? 1 : 0;

  const outOfStockAction = helpers.numOrNull(group.out_of_stock_action) ?? 1;

  const sortOrder = helpers.numOrNull(group.sort_order) ?? 0;

  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();

    const [result] = await conn.query(
      `INSERT INTO prod_option_groups
       (tenant_id, title, selection_type, min_select, max_select, is_active, is_required, allow_variants, out_of_stock_action, sort_order)
       VALUES (?,?,?,?,?,?,?,?,?,?)`,
      [tenantId, title, selectionType, minSelect, maxSelect, isActive, isRequired, allowVariants, outOfStockAction, sortOrder]
    );
    const groupId = result.insertId;

    if (items.length) {
      const values = items.map((item, idx) => {
        const priceMode = item.price_mode === 'fixed' ? 'fixed' : 'from_target';

        // ⚠️ ВАЖНО: price_value не должен быть NULL
        // fixed -> обязателен price_value
        // from_target -> ставим 0 (или можно цену target, если у тебя такая логика отдельно)
        let priceValue = 0;
        if (priceMode === 'fixed') {
          const v = helpers.numOrNull(item.price_value);
          if (v == null) throw new Error('PRICE_VALUE_REQUIRED');
          priceValue = v;
        }

        return [
          tenantId,
          groupId,
          'product',
          Number(item.target_product_id),
          priceMode,
          priceValue,
          helpers.numOrNull(item.qty_min) ?? 1,
          helpers.numOrNull(item.qty_max) ?? 1,
          1,
          helpers.numOrNull(item.sort_order) ?? idx * 10
        ];
      });

      await conn.query(
        `INSERT INTO prod_option_items
         (tenant_id, group_id, target_type, target_product_id, price_mode, price_value, qty_min, qty_max, is_active, sort_order)
         VALUES ?`,
        [values]
      );
    }

    if (assignments.length) {
      const values = assignments.map((assignment, idx) => ([
        tenantId,
        groupId,
        'product',
        Number(assignment.assign_id),
        helpers.numOrNull(assignment.priority) ?? 0,
        helpers.numOrNull(assignment.sort_order) ?? idx * 10,
        helpers.numOrNull(assignment.out_of_stock_action) ?? 1,
        1
      ]));
      await conn.query(
        `INSERT INTO prod_option_assignments
         (tenant_id, group_id, assign_type, assign_id, priority, sort_order, out_of_stock_action, is_active)
         VALUES ?
         ON DUPLICATE KEY UPDATE
           priority=VALUES(priority),
           sort_order=VALUES(sort_order),
           out_of_stock_action=VALUES(out_of_stock_action)`,
        [values]
      );
    }

    await conn.commit();
    res.json({ ok: true, id: groupId });
  } catch (e) {
    await conn.rollback();
    console.error(e);

    if (String(e?.message) === 'PRICE_VALUE_REQUIRED') {
      return res.status(400).json({ ok: false, error: 'PRICE_VALUE_REQUIRED' });
    }

    res.status(500).json({ ok: false, error: 'DB_ERROR' });
  } finally {
    conn.release();
  }
});

router.patch('/admin/options/groups/:id', async (req, res) => {
  try {
    const tenantId = helpers.getTenantId(req);
    const id = Number(req.params.id);
    if (!Number.isFinite(id) || id <= 0) return res.status(400).json({ ok: false, error: 'BAD_ID' });

    const fields = [];
    const values = [];

    // будем знать, к чему переключили тип (если переключили)
    let nextSelectionType = null;

    if (Object.prototype.hasOwnProperty.call(req.body, 'title')) {
      const title = helpers.strOrNull(req.body.title);
      if (!title) return res.status(400).json({ ok: false, error: 'TITLE_REQUIRED' });
      fields.push('title=?');
      values.push(title);
    }

    if (Object.prototype.hasOwnProperty.call(req.body, 'selection_type')) {
      nextSelectionType = req.body.selection_type === 'multiple' ? 'multiple' : 'single';
      fields.push('selection_type=?');
      values.push(nextSelectionType);

      // ✅ если перевели в multiple — required всегда 0
      if (nextSelectionType === 'multiple') {
        fields.push('is_required=?');
        values.push(0);
      }
    }

    if (Object.prototype.hasOwnProperty.call(req.body, 'min_select')) {
      fields.push('min_select=?');
      values.push(helpers.numOrNull(req.body.min_select) ?? 0);
    }

    if (Object.prototype.hasOwnProperty.call(req.body, 'max_select')) {
      fields.push('max_select=?');
      values.push(helpers.numOrNull(req.body.max_select));
    }

    if (Object.prototype.hasOwnProperty.call(req.body, 'is_active')) {
      fields.push('is_active=?');
      values.push(helpers.toBool(req.body.is_active, true) ? 1 : 0);
    }

    if (Object.prototype.hasOwnProperty.call(req.body, 'allow_variants')) {
      fields.push('allow_variants=?');
      values.push(helpers.toBool(req.body.allow_variants, false) ? 1 : 0);
    }

    if (Object.prototype.hasOwnProperty.call(req.body, 'out_of_stock_action')) {
      const outOfStockAction = helpers.numOrNull(req.body.out_of_stock_action);
      if (outOfStockAction != null) {
        fields.push('out_of_stock_action=?');
        values.push(outOfStockAction);
      }
    }

    // ✅ is_required только для single
    if (Object.prototype.hasOwnProperty.call(req.body, 'is_required')) {
      const incoming = helpers.toBool(req.body.is_required, true) ? 1 : 0;

      // если тип в этом же PATCH не задан — аккуратно обновляем,
      // но только если группа по факту single (проверим в БД)
      if (nextSelectionType == null) {
        const [[row]] = await db.query(
          'SELECT selection_type FROM prod_option_groups WHERE tenant_id=? AND id=? LIMIT 1',
          [tenantId, id]
        );
        const currentType = row?.selection_type === 'multiple' ? 'multiple' : 'single';
        if (currentType === 'single') {
          fields.push('is_required=?');
          values.push(incoming);
        } else {
          // multiple -> принудительно 0
          fields.push('is_required=?');
          values.push(0);
        }
      } else {
        // тип задан в этом запросе
        if (nextSelectionType === 'single') {
          fields.push('is_required=?');
          values.push(incoming);
        } else {
          fields.push('is_required=?');
          values.push(0);
        }
      }
    }

    if (Object.prototype.hasOwnProperty.call(req.body, 'sort_order')) {
      fields.push('sort_order=?');
      values.push(helpers.numOrNull(req.body.sort_order) ?? 0);
    }

    if (!fields.length) return res.json({ ok: true });

    values.push(tenantId, id);
    await db.query(
      `UPDATE prod_option_groups
       SET ${fields.join(', ')}
       WHERE tenant_id=? AND id=?`,
      values
    );

    res.json({ ok: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ ok: false, error: 'DB_ERROR' });
  }
});

  async function tableExists(conn, tableName) {
    const [[row]] = await conn.query(
      `SELECT COUNT(*) AS cnt
       FROM information_schema.tables
       WHERE table_schema=DATABASE() AND table_name=?`,
      [tableName]
    );
    return Boolean(row && row.cnt);
  }

  router.delete('/admin/options/groups/:id', async (req, res) => {
    const tenantId = helpers.getTenantId(req);
    const id = Number(req.params.id);
    if (!Number.isFinite(id) || id <= 0) return res.status(400).json({ ok: false, error: 'BAD_ID' });

    const conn = await db.getConnection();
    try {
      await conn.beginTransaction();

      const [[group]] = await conn.query(
        'SELECT id FROM prod_option_groups WHERE tenant_id=? AND id=? LIMIT 1 FOR UPDATE',
        [tenantId, id]
      );
      if (!group) {
        await conn.rollback();
        return res.status(404).json({ ok: false, error: 'NOT_FOUND' });
      }

      // Каскадное удаление всех связей опции
      // Удаляем items
      await conn.query(
        'DELETE FROM prod_option_items WHERE tenant_id=? AND group_id=?',
        [tenantId, id]
      );

      // Удаляем assignments
      await conn.query(
        'DELETE FROM prod_option_assignments WHERE tenant_id=? AND group_id=?',
        [tenantId, id]
      );

      // Удаляем overrides (если таблица существует)
      if (await tableExists(conn, 'prod_option_overrides')) {
        await conn.query(
          'DELETE FROM prod_option_overrides WHERE tenant_id=? AND group_id=?',
          [tenantId, id]
        );
      }

      // Удаляем exclusions (если таблица существует)
      if (await tableExists(conn, 'prod_option_exclusions')) {
        await conn.query(
          'DELETE FROM prod_option_exclusions WHERE tenant_id=? AND group_id=?',
          [tenantId, id]
        );
      }

      // Удаляем саму группу опций
      await conn.query(
        'DELETE FROM prod_option_groups WHERE tenant_id=? AND id=?',
        [tenantId, id]
      );

      await conn.commit();
      res.json({ ok: true });
    } catch (e) {
      await conn.rollback();
      console.error(e);
      res.status(500).json({ ok: false, error: 'DB_ERROR' });
    } finally {
      conn.release();
    }
  });

  router.post('/admin/options/groups/:id/items', async (req, res) => {
    const tenantId = helpers.getTenantId(req);
    const groupId = Number(req.params.id);
    if (!Number.isFinite(groupId) || groupId <= 0) return res.status(400).json({ ok: false, error: 'BAD_ID' });

    const items = Array.isArray(req.body.items) ? req.body.items : [];
    if (!items.length) return res.status(400).json({ ok: false, error: 'EMPTY' });
    const targetIds = Array.from(new Set(items.map((x) => Number(x.target_product_id)).filter((x) => Number.isFinite(x) && x > 0)));
    if (!targetIds.length) return res.status(400).json({ ok: false, error: 'EMPTY' });

    const conn = await db.getConnection();
    try {
      await conn.beginTransaction();
      const [existing] = await conn.query(
        `SELECT id, target_product_id
         FROM prod_option_items
         WHERE tenant_id=? AND group_id=? AND target_type='product'
           AND target_product_id IN (${targetIds.map(() => '?').join(',')})`,
        [tenantId, groupId, ...targetIds]
      );
      const map = new Map(existing.map((row) => [Number(row.target_product_id), row]));
      const added = [];
      const updated = [];

      for (const item of items) {
        const targetId = Number(item.target_product_id);
        if (!Number.isFinite(targetId) || targetId <= 0) continue;
        const row = map.get(targetId);
        const priceMode = item.price_mode === 'fixed' ? 'fixed' : 'from_target';
        // Унифицировано: для from_target используем 0 (как в bundle-endpoint)
        const priceValue = priceMode === 'fixed' ? (helpers.numOrNull(item.price_value) ?? 0) : 0;
        const qtyMin = helpers.numOrNull(item.qty_min) ?? 1;
        const qtyMax = helpers.numOrNull(item.qty_max) ?? 1;
        const sortOrder = helpers.numOrNull(item.sort_order) ?? 0;

        if (!row) {
          await conn.query(
            `INSERT INTO prod_option_items
             (tenant_id, group_id, target_type, target_product_id, price_mode, price_value, qty_min, qty_max, is_active, sort_order)
             VALUES (?,?,?,?,?,?,?,?,?,?)`,
            [tenantId, groupId, 'product', targetId, priceMode, priceValue, qtyMin, qtyMax, 1, sortOrder]
          );
          added.push(targetId);
          continue;
        }

        await conn.query(
          `UPDATE prod_option_items
           SET price_mode=?, price_value=?, qty_min=?, qty_max=?, sort_order=?
           WHERE tenant_id=? AND id=?`,
          [priceMode, priceValue, qtyMin, qtyMax, sortOrder, tenantId, row.id]
        );
        updated.push(targetId);
      }

      await conn.commit();
      res.json({ ok: true, added, updated });
    } catch (e) {
      await conn.rollback();
      console.error(e);
      res.status(500).json({ ok: false, error: 'DB_ERROR' });
    } finally {
      conn.release();
    }
  });

  router.patch('/admin/options/items/:id', async (req, res) => {
    try {
      const tenantId = helpers.getTenantId(req);
      const id = Number(req.params.id);
      if (!Number.isFinite(id) || id <= 0) return res.status(400).json({ ok: false, error: 'BAD_ID' });

      const fields = [];
      const values = [];

      if (Object.prototype.hasOwnProperty.call(req.body, 'price_mode')) {
        const priceMode = req.body.price_mode === 'fixed' ? 'fixed' : 'from_target';
        fields.push('price_mode=?');
        values.push(priceMode);
        if (Object.prototype.hasOwnProperty.call(req.body, 'price_value')) {
          // Унифицировано: для from_target используем 0
          values.push(priceMode === 'fixed' ? (helpers.numOrNull(req.body.price_value) ?? 0) : 0);
          fields.push('price_value=?');
        }
      } else if (Object.prototype.hasOwnProperty.call(req.body, 'price_value')) {
        fields.push('price_value=?');
        values.push(helpers.numOrNull(req.body.price_value) ?? 0);
      }

      if (Object.prototype.hasOwnProperty.call(req.body, 'qty_min')) {
        fields.push('qty_min=?');
        values.push(helpers.numOrNull(req.body.qty_min) ?? 1);
      }
      if (Object.prototype.hasOwnProperty.call(req.body, 'qty_max')) {
        fields.push('qty_max=?');
        values.push(helpers.numOrNull(req.body.qty_max) ?? 1);
      }
      if (Object.prototype.hasOwnProperty.call(req.body, 'sort_order')) {
        fields.push('sort_order=?');
        values.push(helpers.numOrNull(req.body.sort_order) ?? 0);
      }

      if (!fields.length) return res.json({ ok: true });

      values.push(tenantId, id);
      await db.query(
        `UPDATE prod_option_items
         SET ${fields.join(', ')}
         WHERE tenant_id=? AND id=?`,
        values
      );

      res.json({ ok: true });
    } catch (e) {
      console.error(e);
      res.status(500).json({ ok: false, error: 'DB_ERROR' });
    }
  });

  router.delete('/admin/options/items/:id', async (req, res) => {
    try {
      const tenantId = helpers.getTenantId(req);
      const id = Number(req.params.id);
      if (!Number.isFinite(id) || id <= 0) return res.status(400).json({ ok: false, error: 'BAD_ID' });

      await db.query(
        `DELETE FROM prod_option_items
         WHERE tenant_id=? AND id=?`,
        [tenantId, id]
      );

      res.json({ ok: true });
    } catch (e) {
      console.error(e);
      res.status(500).json({ ok: false, error: 'DB_ERROR' });
    }
  });

  router.post('/admin/options/groups/:id/assignments', async (req, res) => {
    const tenantId = helpers.getTenantId(req);
    const groupId = Number(req.params.id);
    if (!Number.isFinite(groupId) || groupId <= 0) return res.status(400).json({ ok: false, error: 'BAD_ID' });
    const assignIds = Array.isArray(req.body.assign_ids) ? req.body.assign_ids : [];
    const assignmentObjects = Array.isArray(req.body.assignments) ? req.body.assignments : [];
    const normalizedAssignments = assignmentObjects
      .map((item) => ({
        assign_id: Number(item.assign_id ?? item.id),
        out_of_stock_action: helpers.numOrNull(item.out_of_stock_action) ?? 1,
        priority: helpers.numOrNull(item.priority) ?? 0,
        sort_order: helpers.numOrNull(item.sort_order) ?? 0,
      }))
      .filter((item) => Number.isFinite(item.assign_id) && item.assign_id > 0);
    const assignmentMap = new Map(normalizedAssignments.map((item) => [item.assign_id, item]));
    const norm = Array.from(
      new Set([
        ...assignIds.map((x) => Number(x)).filter((x) => Number.isFinite(x) && x > 0),
        ...normalizedAssignments.map((item) => item.assign_id),
      ])
    );
    if (!norm.length) return res.status(400).json({ ok: false, error: 'EMPTY' });

      const conn = await db.getConnection();
      try {
        await conn.beginTransaction();
        const [existing] = await conn.query(
        `SELECT id, assign_id
         FROM prod_option_assignments
         WHERE tenant_id=? AND group_id=? AND assign_type='product'
           AND assign_id IN (${norm.map(() => '?').join(',')})`,
        [tenantId, groupId, ...norm]
      );
      const map = new Map(existing.map((row) => [Number(row.assign_id), row]));

      const added = [];
      const skipped = [];

      for (const id of norm) {
        const row = map.get(id);
        if (!row) {
          const payload = assignmentMap.get(id) || { out_of_stock_action: 1, priority: 0, sort_order: 0 };
          await conn.query(
            `INSERT INTO prod_option_assignments
             (tenant_id, group_id, assign_type, assign_id, priority, sort_order, out_of_stock_action, is_active)
             VALUES (?,?,?,?,?,?,?,1)`,
            [tenantId, groupId, 'product', id, payload.priority, payload.sort_order, payload.out_of_stock_action]
          );
          added.push(id);
          continue;
        }
        skipped.push(id);
      }

      await conn.commit();
      res.json({ ok: true, added, skipped });
    } catch (e) {
      await conn.rollback();
      console.error(e);
      res.status(500).json({ ok: false, error: 'DB_ERROR' });
    } finally {
      conn.release();
    }
  });

  router.patch('/admin/options/assignments/:id', async (req, res) => {
    try {
      const tenantId = helpers.getTenantId(req);
      const id = Number(req.params.id);
      if (!Number.isFinite(id) || id <= 0) return res.status(400).json({ ok: false, error: 'BAD_ID' });

      const priority = helpers.numOrNull(req.body.priority);
      const sortOrder = helpers.numOrNull(req.body.sort_order);
      const outOfStockAction = helpers.numOrNull(req.body.out_of_stock_action);

      await db.query(
        `UPDATE prod_option_assignments
         SET priority=COALESCE(?, priority),
             sort_order=COALESCE(?, sort_order),
             out_of_stock_action=COALESCE(?, out_of_stock_action)
         WHERE tenant_id=? AND id=?`,
        [priority, sortOrder, outOfStockAction, tenantId, id]
      );

      res.json({ ok: true });
    } catch (e) {
      console.error(e);
      res.status(500).json({ ok: false, error: 'DB_ERROR' });
    }
  });

  router.delete('/admin/options/assignments/:id', async (req, res) => {
    try {
      const tenantId = helpers.getTenantId(req);
      const id = Number(req.params.id);
      if (!Number.isFinite(id) || id <= 0) return res.status(400).json({ ok: false, error: 'BAD_ID' });

      await db.query(
        `DELETE FROM prod_option_assignments
         WHERE tenant_id=? AND id=?`,
        [tenantId, id]
      );

      res.json({ ok: true });
    } catch (e) {
      console.error(e);
      res.status(500).json({ ok: false, error: 'DB_ERROR' });
    }
  });

  // ------------------------------
  // Variants: groups/discount_tiers/assignments
  // ------------------------------
  router.get('/admin/variants/groups', async (req, res) => {
    try {
      const tenantId = helpers.getTenantId(req);
      const [rows] = await db.query(
        `SELECT g.*,
                (SELECT COUNT(*) FROM prod_variant_assignments a WHERE a.tenant_id=g.tenant_id AND a.variant_group_id=g.id) AS assignments_count
         FROM prod_variant_groups g
         WHERE g.tenant_id=?
         ORDER BY g.sort_order ASC, g.id ASC`,
        [tenantId]
      );
      for (const r of rows) {
        r.values = helpers.safeJsonArray(r.values);
      }
      res.json({ ok: true, data: rows });
    } catch (e) {
      console.error(e);
      res.status(500).json({ ok: false, error: 'DB_ERROR' });
    }
  });

  router.get('/admin/variants/groups/:id', async (req, res) => {
    try {
      const tenantId = helpers.getTenantId(req);
      const id = Number(req.params.id);
      const scopedProductId = Number(req.query?.product_id || 0);
      if (!Number.isFinite(id) || id <= 0) return res.status(400).json({ ok: false, error: 'BAD_ID' });

      const [[group]] = await db.query(
        'SELECT * FROM prod_variant_groups WHERE tenant_id=? AND id=? LIMIT 1',
        [tenantId, id]
      );
      if (!group) return res.status(404).json({ ok: false, error: 'NOT_FOUND' });

      group.values = helpers.safeJsonArray(group.values);
      group.default_value_index = group.default_value_index != null ? Number(group.default_value_index) : null;
      
      // debug log removed

      const [tiers] = await db.query(
        `SELECT * FROM prod_variant_discount_tiers
         WHERE tenant_id=? AND variant_group_id=?
         ORDER BY sort_order ASC, min_quantity ASC`,
        [tenantId, id]
      );

      let excludedValueIndexes = new Set();
      if (Number.isFinite(scopedProductId) && scopedProductId > 0) {
        try {
          const [excludedRows] = await db.query(
            `SELECT value_index
             FROM prod_variant_value_exclusions
             WHERE tenant_id=? AND product_id=? AND variant_group_id=?`,
            [tenantId, scopedProductId, id]
          );
          excludedValueIndexes = new Set(
            (Array.isArray(excludedRows) ? excludedRows : [])
              .map((row) => Number(row.value_index))
              .filter((valueIndex) => Number.isFinite(valueIndex) && valueIndex >= 0)
          );
        } catch (error) {
          if (error?.code !== 'ER_NO_SUCH_TABLE' && error?.code !== 'ER_BAD_TABLE_ERROR') {
            throw error;
          }
        }
      }

      const [assignments] = await db.query(
        `SELECT a.*, p.name AS product_name
         FROM prod_variant_assignments a
         JOIN prod_products p ON p.tenant_id=a.tenant_id AND p.id=a.product_id
         WHERE a.tenant_id=? AND a.variant_group_id=?
         ORDER BY a.sort_order ASC, a.id ASC`,
        [tenantId, id]
      );
      // Преобразуем default_value_index в число или null
      assignments.forEach(a => {
        a.default_value_index = a.default_value_index != null ? Number(a.default_value_index) : null;
      });

      const getTierRowsForValueIndex = (valueIndex) => {
        const exact = tiers.filter((tier) => Number(tier?.sort_order) === Number(valueIndex));
        if (exact.length) return exact;
        return tiers.filter((tier) => Number(tier?.sort_order) === Number(valueIndex) + 1);
      };

      const valuesMeta = (Array.isArray(group.values) ? group.values : []).map((value, index) => {
        const tierRows = getTierRowsForValueIndex(index);
        const primaryTier = tierRows[0] || null;
        return {
          index,
          value: value == null ? '' : String(value),
          is_excluded_for_product: excludedValueIndexes.has(index),
          discount_percent: primaryTier?.discount_percent != null ? Number(primaryTier.discount_percent) : 0,
          tier_rows: tierRows.map((tier) => ({ ...tier })),
        };
      });

      const visibleValueIndexes = valuesMeta
        .filter((item) => item.is_excluded_for_product !== true)
        .map((item) => Number(item.index))
        .filter((valueIndex) => Number.isFinite(valueIndex) && valueIndex >= 0);

      const scopedAssignment = Number.isFinite(scopedProductId) && scopedProductId > 0
        ? assignments.find((assignment) => Number(assignment.product_id) === scopedProductId)
        : null;
      const rawDefaultValueIndex = scopedAssignment?.default_value_index != null
        ? Number(scopedAssignment.default_value_index)
        : group.default_value_index;
      const resolvedDefaultValueIndex = visibleValueIndexes.includes(rawDefaultValueIndex)
        ? rawDefaultValueIndex
        : (visibleValueIndexes.length ? visibleValueIndexes[0] : null);
      const resolvedDefaultVisibleIndex = resolvedDefaultValueIndex == null
        ? null
        : visibleValueIndexes.indexOf(resolvedDefaultValueIndex);
      const visibleValues = visibleValueIndexes.map((valueIndex) => group.values[valueIndex]);
      const visibleTiers = [];
      visibleValueIndexes.forEach((originalValueIndex, visibleValueIndex) => {
        getTierRowsForValueIndex(originalValueIndex).forEach((tier) => {
          visibleTiers.push({
            ...tier,
            sort_order: visibleValueIndex,
          });
        });
      });

      res.json({
        ok: true,
        data: {
          group,
          tiers,
          assignments,
          values_meta: valuesMeta,
          product_scope: Number.isFinite(scopedProductId) && scopedProductId > 0
            ? {
                product_id: scopedProductId,
                excluded_value_indexes: Array.from(excludedValueIndexes),
                visible_value_indexes: visibleValueIndexes,
                visible_values: visibleValues,
                visible_tiers: visibleTiers,
                resolved_default_value_index: resolvedDefaultValueIndex,
                resolved_default_visible_index: Number.isFinite(resolvedDefaultVisibleIndex) && resolvedDefaultVisibleIndex >= 0
                  ? resolvedDefaultVisibleIndex
                  : null,
              }
            : null,
        },
      });
    } catch (e) {
      console.error(e);
      res.status(500).json({ ok: false, error: 'DB_ERROR' });
    }
  });

  router.post('/admin/variants/group-bundle', async (req, res) => {
    const tenantId = helpers.getTenantId(req);
    const group = req.body.group || req.body || {};
    const tiers = Array.isArray(req.body.tiers) ? req.body.tiers : [];
    const assignments = Array.isArray(req.body.assignments) ? req.body.assignments : [];

    const title = helpers.strOrNull(group.title);
    if (!title) return res.status(400).json({ ok: false, error: 'TITLE_REQUIRED' });

    const unitId = helpers.numOrNull(group.unit_id);
    const values = Array.isArray(group.values) ? JSON.stringify(group.values) : null;
    const isActive = helpers.toBool(group.is_active, true) ? 1 : 0;
    const sortOrder = helpers.numOrNull(group.sort_order) ?? 0;

    const conn = await db.getConnection();
    try {
      await conn.beginTransaction();

      const defaultValueIndexRaw = group.default_value_index;
      // debug log removed
      // Важно: 0 - это валидное значение (первый вариант), поэтому обрабатываем его отдельно
      const defaultValueIndex = defaultValueIndexRaw === null || defaultValueIndexRaw === undefined 
        ? null 
        : (Number.isFinite(Number(defaultValueIndexRaw)) ? Number(defaultValueIndexRaw) : null);
      // debug log removed
      const [result] = await conn.query(
        `INSERT INTO prod_variant_groups
         (tenant_id, title, unit_id, \`values\`, selection_type, is_active, sort_order, default_value_index)
         VALUES (?,?,?,?,'single',?,?,?)`,
        [tenantId, title, unitId, values, isActive, sortOrder, defaultValueIndex]
      );
      const groupId = result.insertId;

      for (let idx = 0; idx < tiers.length; idx++) {
        const tier = tiers[idx];
        const minQuantity = helpers.numOrNull(tier.min_quantity) ?? 1;
        const discountPercent = helpers.numOrNull(tier.discount_percent) ?? 0;
        const tierSortOrder = helpers.numOrNull(tier.sort_order) ?? (idx * 10);

        await conn.query(
          `INSERT INTO prod_variant_discount_tiers
           (tenant_id, variant_group_id, min_quantity, discount_percent, sort_order)
           VALUES (?,?,?,?,?)`,
          [tenantId, groupId, minQuantity, discountPercent, tierSortOrder]
        );
      }

      for (const assignId of assignments) {
        const id = Number(assignId);
        if (!Number.isFinite(id) || id <= 0) continue;

        const [existing] = await conn.query(
          `SELECT id FROM prod_variant_assignments
           WHERE tenant_id=? AND product_id=? AND variant_group_id=?`,
          [tenantId, id, groupId]
        );
        if (existing.length) continue;

        await conn.query(
          `INSERT INTO prod_variant_assignments
           (tenant_id, product_id, variant_group_id, sort_order, is_active)
           VALUES (?,?,?,0,1)`,
          [tenantId, id, groupId]
        );
      }

      await conn.commit();
      res.json({ ok: true, id: groupId });
    } catch (e) {
      await conn.rollback();
      console.error(e);
      res.status(500).json({ ok: false, error: 'DB_ERROR' });
    } finally {
      conn.release();
    }
  });

  // ВАЖНО: этот маршрут должен быть объявлен ПЕРЕД общим маршрутом /:id
  router.patch('/admin/variants/groups/:id/defaultIndex', async (req, res) => {
    try {
      const tenantId = helpers.getTenantId(req);
      const id = Number(req.params.id);
      if (!Number.isFinite(id) || id <= 0) return res.status(400).json({ ok: false, error: 'BAD_ID' });

      let default_value_index = req.body.default_value_index;
      if (default_value_index !== null && default_value_index !== undefined) {
        default_value_index = Number(default_value_index);
        if (!Number.isFinite(default_value_index) || default_value_index < 0) {
          return res.status(400).json({ ok: false, error: 'INVALID_INDEX' });
        }
      } else {
        default_value_index = null;
      }

      await db.query(
        'UPDATE prod_variant_groups SET default_value_index=? WHERE tenant_id=? AND id=?',
        [default_value_index, tenantId, id]
      );

      res.json({ ok: true });
    } catch (e) {
      console.error(e);
      res.status(500).json({ ok: false, error: 'DB_ERROR' });
    }
  });

  router.patch('/admin/variants/groups/:id', async (req, res) => {
    // debug logs removed
    try {
      const tenantId = helpers.getTenantId(req);
      const id = Number(req.params.id);
      // debug log removed
      if (!Number.isFinite(id) || id <= 0) return res.status(400).json({ ok: false, error: 'BAD_ID' });

      const fields = [];
      const values = [];

      if (Object.prototype.hasOwnProperty.call(req.body, 'title')) {
        const title = helpers.strOrNull(req.body.title);
        if (!title) return res.status(400).json({ ok: false, error: 'TITLE_REQUIRED' });
        fields.push('title=?');
        values.push(title);
      }

      if (Object.prototype.hasOwnProperty.call(req.body, 'unit_id')) {
        fields.push('unit_id=?');
        values.push(helpers.numOrNull(req.body.unit_id));
      }

      if (Object.prototype.hasOwnProperty.call(req.body, 'values')) {
        const vals = Array.isArray(req.body.values) ? JSON.stringify(req.body.values) : null;
        fields.push('`values`=?');
        values.push(vals);
      }

      if (Object.prototype.hasOwnProperty.call(req.body, 'is_active')) {
        fields.push('is_active=?');
        values.push(helpers.toBool(req.body.is_active, true) ? 1 : 0);
      }

      if (Object.prototype.hasOwnProperty.call(req.body, 'sort_order')) {
        fields.push('sort_order=?');
        values.push(helpers.numOrNull(req.body.sort_order) ?? 0);
      }

      if (Object.prototype.hasOwnProperty.call(req.body, 'default_value_index')) {
        const defaultValueIndex = req.body.default_value_index;
        // debug log removed
        // Важно: 0 - это валидное значение (первый вариант), поэтому обрабатываем его отдельно
        let processedValue;
        if (defaultValueIndex === null || defaultValueIndex === undefined) {
          processedValue = null;
        } else if (Number.isFinite(Number(defaultValueIndex))) {
          processedValue = Number(defaultValueIndex);
        } else {
          processedValue = null;
        }
        // debug log removed
        fields.push('default_value_index=?');
        values.push(processedValue);
        
        // Сохраняем для использования в проверке после UPDATE
        req.body._processedDefaultValueIndex = processedValue;
      }

      if (!fields.length) return res.json({ ok: true });

      values.push(tenantId, id);
      
      // debug logs removed
      
      await db.query(
        `UPDATE prod_variant_groups
         SET ${fields.join(', ')}
         WHERE tenant_id=? AND id=?`,
        values
      );
      
      // Проверяем, что значение сохранилось
      const [check] = await db.query(
        `SELECT default_value_index, updated_at, title, \`values\` FROM prod_variant_groups WHERE tenant_id=? AND id=? LIMIT 1`,
        [tenantId, id]
      );
      
      const savedValue = check[0]?.default_value_index;
      const requestedValue = req.body.default_value_index;
      
      // debug log removed
      
      // Проверяем, что значение действительно сохранилось
      if (Object.prototype.hasOwnProperty.call(req.body, 'default_value_index')) {
        const processedValue = req.body._processedDefaultValueIndex;
        const actualSavedValue = savedValue != null ? Number(savedValue) : null;
        
        if (processedValue !== actualSavedValue) {
          console.error('[API] PATCH /admin/variants/groups/:id - VALUE MISMATCH', {
            processedValue,
            actualSavedValue,
            requestedValue,
            savedValueRaw: savedValue
          });
        } else {
          // debug log removed
        }
      }
      // debug logs removed
      
      res.json({ ok: true });
    } catch (e) {
      console.error(e);
      res.status(500).json({ ok: false, error: 'DB_ERROR' });
    }
  });

  router.delete('/admin/variants/groups/:id', async (req, res) => {
    try {
      const tenantId = helpers.getTenantId(req);
      const id = Number(req.params.id);
      if (!Number.isFinite(id) || id <= 0) return res.status(400).json({ ok: false, error: 'BAD_ID' });

      await db.query(
        `DELETE FROM prod_variant_groups
         WHERE tenant_id=? AND id=?`,
        [tenantId, id]
      );

      res.json({ ok: true });
    } catch (e) {
      console.error(e);
      res.status(500).json({ ok: false, error: 'DB_ERROR' });
    }
  });

  router.post('/admin/variants/groups/:id/tiers', async (req, res) => {
    try {
      const tenantId = helpers.getTenantId(req);
      const groupId = Number(req.params.id);
      if (!Number.isFinite(groupId) || groupId <= 0) return res.status(400).json({ ok: false, error: 'BAD_ID' });

      const tiers = Array.isArray(req.body.tiers) ? req.body.tiers : [];
      const conn = await db.getConnection();
      try {
        await conn.beginTransaction();

        for (let idx = 0; idx < tiers.length; idx++) {
          const tier = tiers[idx];
          const tierId = Number(tier.id);
          const minQuantity = helpers.numOrNull(tier.min_quantity) ?? 1;
          const discountPercent = helpers.numOrNull(tier.discount_percent) ?? 0;
          const tierSortOrder = helpers.numOrNull(tier.sort_order) ?? (idx * 10);

          if (Number.isFinite(tierId) && tierId > 0) {
            await conn.query(
              `UPDATE prod_variant_discount_tiers
               SET min_quantity=?, discount_percent=?, sort_order=?
               WHERE tenant_id=? AND id=?`,
              [minQuantity, discountPercent, tierSortOrder, tenantId, tierId]
            );
          } else {
            await conn.query(
              `INSERT INTO prod_variant_discount_tiers
               (tenant_id, variant_group_id, min_quantity, discount_percent, sort_order)
               VALUES (?,?,?,?,?)`,
              [tenantId, groupId, minQuantity, discountPercent, tierSortOrder]
            );
          }
        }

        const deleteIds = Array.isArray(req.body.delete_ids) ? req.body.delete_ids : [];
        for (const delId of deleteIds) {
          const id = Number(delId);
          if (!Number.isFinite(id) || id <= 0) continue;
          await conn.query(
            `DELETE FROM prod_variant_discount_tiers WHERE tenant_id=? AND id=?`,
            [tenantId, id]
          );
        }

        await conn.commit();
        res.json({ ok: true });
      } catch (e) {
        await conn.rollback();
        console.error(e);
        res.status(500).json({ ok: false, error: 'DB_ERROR' });
      } finally {
        conn.release();
      }
    } catch (e) {
      console.error(e);
      res.status(500).json({ ok: false, error: 'DB_ERROR' });
    }
  });

  router.post('/admin/variants/groups/:id/assignments', async (req, res) => {
    const tenantId = helpers.getTenantId(req);
    const groupId = Number(req.params.id);
    if (!Number.isFinite(groupId) || groupId <= 0) return res.status(400).json({ ok: false, error: 'BAD_ID' });
    const assignIds = Array.isArray(req.body.assign_ids) ? req.body.assign_ids : [];
    const norm = Array.from(new Set(assignIds.map((x) => Number(x)).filter((x) => Number.isFinite(x) && x > 0)));
    if (!norm.length) return res.status(400).json({ ok: false, error: 'EMPTY' });

    const conn = await db.getConnection();
    try {
      await conn.beginTransaction();
      const [existing] = await conn.query(
        `SELECT id, product_id
         FROM prod_variant_assignments
         WHERE tenant_id=? AND variant_group_id=?
           AND product_id IN (${norm.map(() => '?').join(',')})`,
        [tenantId, groupId, ...norm]
      );
      const map = new Map(existing.map((row) => [Number(row.product_id), row]));

      const added = [];
      const skipped = [];

      for (const id of norm) {
        const row = map.get(id);
        if (!row) {
          await conn.query(
            `INSERT INTO prod_variant_assignments
             (tenant_id, product_id, variant_group_id, sort_order, is_active)
             VALUES (?,?,?,0,1)`,
            [tenantId, id, groupId]
          );
          added.push(id);
          continue;
        }
        skipped.push(id);
      }

      await conn.commit();
      res.json({ ok: true, added, skipped });
    } catch (e) {
      await conn.rollback();
      console.error(e);
      res.status(500).json({ ok: false, error: 'DB_ERROR' });
    } finally {
      conn.release();
    }
  });

  router.patch('/admin/variants/assignments/:id', async (req, res) => {
    try {
      const tenantId = helpers.getTenantId(req);
      const id = Number(req.params.id);
      if (!Number.isFinite(id) || id <= 0) return res.status(400).json({ ok: false, error: 'BAD_ID' });

      const fields = [];
      const values = [];

      if (Object.prototype.hasOwnProperty.call(req.body, 'default_value_index')) {
        fields.push('default_value_index=?');
        values.push(helpers.numOrNull(req.body.default_value_index));
      }

      if (Object.prototype.hasOwnProperty.call(req.body, 'is_active')) {
        fields.push('is_active=?');
        values.push(helpers.toBool(req.body.is_active, true) ? 1 : 0);
      }

      if (Object.prototype.hasOwnProperty.call(req.body, 'sort_order')) {
        fields.push('sort_order=?');
        values.push(helpers.numOrNull(req.body.sort_order) ?? 0);
      }

      if (!fields.length) return res.json({ ok: true });

      values.push(tenantId, id);
      await db.query(
        `UPDATE prod_variant_assignments
         SET ${fields.join(', ')}
         WHERE tenant_id=? AND id=?`,
        values
      );

      res.json({ ok: true });
    } catch (e) {
      console.error(e);
      res.status(500).json({ ok: false, error: 'DB_ERROR' });
    }
  });

  router.delete('/admin/variants/assignments/:id', async (req, res) => {
    try {
      const tenantId = helpers.getTenantId(req);
      const id = Number(req.params.id);
      if (!Number.isFinite(id) || id <= 0) return res.status(400).json({ ok: false, error: 'BAD_ID' });

      await db.query(
        `DELETE FROM prod_variant_assignments
         WHERE tenant_id=? AND id=?`,
        [tenantId, id]
      );

      res.json({ ok: true });
    } catch (e) {
      console.error(e);
      res.status(500).json({ ok: false, error: 'DB_ERROR' });
    }
  });

  router.get('/admin/products/:id/variants', async (req, res) => {
    try {
      const tenantId = helpers.getTenantId(req);
      const productId = Number(req.params.id);
      if (!Number.isFinite(productId) || productId <= 0) {
        return res.status(400).json({ ok: false, error: 'BAD_ID' });
      }

      const [variants] = await db.query(
        `SELECT 
          vg.id,
          vg.title,
          vg.unit_id,
          vg.values,
          vg.is_active,
          vg.sort_order,
          vg.default_value_index AS group_default_value_index,
          va.id AS assignment_id,
          va.variant_group_id,
          va.product_id,
          va.sort_order AS assignment_sort_order,
          va.default_value_index AS assignment_default_value_index,
          u.code AS unit_code,
          u.short_title AS unit_short_title,
          u.title AS unit_title
        FROM prod_variant_assignments va
        JOIN prod_variant_groups vg ON vg.id=va.variant_group_id
        LEFT JOIN prod_units u ON u.id=vg.unit_id AND u.tenant_id=vg.tenant_id
        WHERE va.tenant_id=? AND va.product_id=? AND va.is_active=1 AND vg.is_active=1
        ORDER BY va.sort_order ASC, vg.sort_order ASC`,
        [tenantId, productId]
      );

      for (const v of variants) {
        v.values = helpers.safeJsonArray(v.values);
        v.group_default_value_index = v.group_default_value_index != null ? Number(v.group_default_value_index) : null;
        v.assignment_default_value_index = v.assignment_default_value_index != null ? Number(v.assignment_default_value_index) : null;
        // Определяем дефолтный индекс: сначала из привязки, потом из группы
        v.default_value_index = v.assignment_default_value_index != null ? v.assignment_default_value_index : v.group_default_value_index;
        const [tiers] = await db.query(
          `SELECT min_quantity, discount_percent, sort_order
           FROM prod_variant_discount_tiers
           WHERE tenant_id=? AND variant_group_id=?
           ORDER BY sort_order ASC, min_quantity ASC`,
          [tenantId, v.id]
        );
        v.discount_tiers = tiers;
      }

      res.json({ ok: true, data: variants });
    } catch (e) {
      console.error(e);
      res.status(500).json({ ok: false, error: 'DB_ERROR' });
    }
  });

  // ------------------------------
  // Auto-add items to cart (groups + items)
  // ------------------------------

  router.get('/admin/auto-add/groups', async (req, res) => {
    try {
      const tenantId = helpers.getTenantId(req);

      const [groups] = await db.query(
        `SELECT g.*,
                (SELECT COUNT(*) FROM prod_auto_add_items i
                 WHERE i.tenant_id=g.tenant_id AND i.group_id=g.id) AS items_count
         FROM prod_auto_add_groups g
         WHERE g.tenant_id=?
         ORDER BY g.sort_order ASC, g.id ASC`,
        [tenantId]
      );

      const [items] = await db.query(
        `SELECT i.*,
                p.name AS product_name,
                p.price AS product_price,
                p.photos_json AS product_photos_json
         FROM prod_auto_add_items i
         JOIN prod_products p ON p.tenant_id=i.tenant_id AND p.id=i.product_id
         WHERE i.tenant_id=?
         ORDER BY i.sort_order ASC, i.id ASC`,
        [tenantId]
      );

      for (const it of items) {
        it.product_photos = helpers.safeJsonArray(it.product_photos_json);
      }

      res.json({ ok: true, data: { groups, items } });
    } catch (e) {
      console.error(e);
      res.status(500).json({ ok: false, error: 'DB_ERROR' });
    }
  });

  router.post('/admin/auto-add/groups', async (req, res) => {
    try {
      const tenantId = helpers.getTenantId(req);
      const title = helpers.strOrNull(req.body.title);
      if (!title) return res.status(400).json({ ok: false, error: 'TITLE_REQUIRED' });

      const description = helpers.strOrNull(req.body.description);
      const isActive = helpers.toBool(req.body.is_active, true) ? 1 : 0;
      const sortOrder = helpers.numOrNull(req.body.sort_order) ?? 0;
      const minCartAmount = helpers.numOrNull(req.body.min_cart_amount);
      const maxCartAmount = helpers.numOrNull(req.body.max_cart_amount);
      const includeAutoInTotal = helpers.toBool(req.body.include_auto_in_total, false) ? 1 : 0;
      const maxItemsQty = helpers.numOrNull(req.body.max_items_qty);
      const allowCustomerQty = helpers.toBool(req.body.allow_customer_qty, true) ? 1 : 0;
      const allowCustomerRemove = helpers.toBool(req.body.allow_customer_remove, true) ? 1 : 0;

      const [r] = await db.query(
        `INSERT INTO prod_auto_add_groups
         (tenant_id, title, description, is_active, sort_order, min_cart_amount, max_cart_amount, include_auto_in_total, max_items_qty, allow_customer_qty, allow_customer_remove)
         VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
        [tenantId, title, description, isActive, sortOrder, minCartAmount, maxCartAmount, includeAutoInTotal, maxItemsQty, allowCustomerQty, allowCustomerRemove]
      );

      res.json({ ok: true, id: r.insertId });
    } catch (e) {
      console.error(e);
      res.status(500).json({ ok: false, error: 'DB_ERROR' });
    }
  });

  router.patch('/admin/auto-add/groups/:id', async (req, res) => {
    try {
      const tenantId = helpers.getTenantId(req);
      const id = Number(req.params.id);
      if (!Number.isFinite(id) || id <= 0) return res.status(400).json({ ok: false, error: 'BAD_ID' });

      const fields = [];
      const values = [];

      if (Object.prototype.hasOwnProperty.call(req.body, 'title')) {
        const title = helpers.strOrNull(req.body.title);
        if (!title) return res.status(400).json({ ok: false, error: 'TITLE_REQUIRED' });
        fields.push('title=?');
        values.push(title);
      }

      if (Object.prototype.hasOwnProperty.call(req.body, 'description')) {
        fields.push('description=?');
        values.push(helpers.strOrNull(req.body.description));
      }

      if (Object.prototype.hasOwnProperty.call(req.body, 'is_active')) {
        fields.push('is_active=?');
        values.push(helpers.toBool(req.body.is_active, true) ? 1 : 0);
      }

      if (Object.prototype.hasOwnProperty.call(req.body, 'sort_order')) {
        fields.push('sort_order=?');
        values.push(helpers.numOrNull(req.body.sort_order) ?? 0);
      }

      if (Object.prototype.hasOwnProperty.call(req.body, 'min_cart_amount')) {
        fields.push('min_cart_amount=?');
        values.push(helpers.numOrNull(req.body.min_cart_amount));
      }

      if (Object.prototype.hasOwnProperty.call(req.body, 'max_cart_amount')) {
        fields.push('max_cart_amount=?');
        values.push(helpers.numOrNull(req.body.max_cart_amount));
      }

      if (Object.prototype.hasOwnProperty.call(req.body, 'include_auto_in_total')) {
        fields.push('include_auto_in_total=?');
        values.push(helpers.toBool(req.body.include_auto_in_total, false) ? 1 : 0);
      }

      if (Object.prototype.hasOwnProperty.call(req.body, 'max_items_qty')) {
        fields.push('max_items_qty=?');
        values.push(helpers.numOrNull(req.body.max_items_qty));
      }

      if (Object.prototype.hasOwnProperty.call(req.body, 'allow_customer_qty')) {
        fields.push('allow_customer_qty=?');
        values.push(helpers.toBool(req.body.allow_customer_qty, true) ? 1 : 0);
      }

      if (Object.prototype.hasOwnProperty.call(req.body, 'allow_customer_remove')) {
        fields.push('allow_customer_remove=?');
        values.push(helpers.toBool(req.body.allow_customer_remove, true) ? 1 : 0);
      }

      if (!fields.length) return res.json({ ok: true });

      values.push(tenantId, id);
      await db.query(
        `UPDATE prod_auto_add_groups
         SET ${fields.join(', ')}
         WHERE tenant_id=? AND id=?`,
        values
      );

      res.json({ ok: true });
    } catch (e) {
      console.error(e);
      res.status(500).json({ ok: false, error: 'DB_ERROR' });
    }
  });

  router.delete('/admin/auto-add/groups/:id', async (req, res) => {
    const conn = await db.getConnection();
    try {
      const tenantId = helpers.getTenantId(req);
      const id = Number(req.params.id);
      if (!Number.isFinite(id) || id <= 0) return res.status(400).json({ ok: false, error: 'BAD_ID' });

      await conn.beginTransaction();
      await conn.query(
        `DELETE FROM prod_auto_add_items WHERE tenant_id=? AND group_id=?`,
        [tenantId, id]
      );
      await conn.query(
        `DELETE FROM prod_auto_add_groups WHERE tenant_id=? AND id=?`,
        [tenantId, id]
      );
      await conn.commit();

      res.json({ ok: true });
    } catch (e) {
      await conn.rollback();
      console.error(e);
      res.status(500).json({ ok: false, error: 'DB_ERROR' });
    } finally {
      conn.release();
    }
  });

  router.post('/admin/auto-add/groups/:id/items', async (req, res) => {
    try {
      const tenantId = helpers.getTenantId(req);
      const groupId = Number(req.params.id);
      if (!Number.isFinite(groupId) || groupId <= 0) return res.status(400).json({ ok: false, error: 'BAD_ID' });

      const productId = Number(req.body.product_id);
      if (!Number.isFinite(productId) || productId <= 0) {
        return res.status(400).json({ ok: false, error: 'PRODUCT_REQUIRED' });
      }

      const defaultQty = Math.max(0, Number(req.body.default_qty || 0));
      const minQty = Math.max(0, Number(req.body.min_qty || 0));
      const maxQty = helpers.numOrNull(req.body.max_qty);
      const priceOverride = helpers.numOrNull(req.body.price_override);
      const freeFirstQty = Math.max(0, Number(req.body.free_first_qty || 0));
      const freePerAmount = helpers.numOrNull(req.body.free_per_amount);
      const freePerAmountQty = Math.max(1, Number(req.body.free_per_amount_qty || 1));
      const maxFreeQty = helpers.numOrNull(req.body.max_free_qty);
      const isActive = helpers.toBool(req.body.is_active, true) ? 1 : 0;
      const sortOrder = helpers.numOrNull(req.body.sort_order) ?? 0;

      const [r] = await db.query(
        `INSERT INTO prod_auto_add_items
         (tenant_id, group_id, product_id, default_qty, min_qty, max_qty, price_override,
          free_first_qty, free_per_amount, free_per_amount_qty, max_free_qty, is_active, sort_order)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        [
          tenantId,
          groupId,
          productId,
          defaultQty,
          minQty,
          maxQty,
          priceOverride,
          freeFirstQty,
          freePerAmount,
          freePerAmountQty,
          maxFreeQty,
          isActive,
          sortOrder
        ]
      );

      res.json({ ok: true, id: r.insertId });
    } catch (e) {
      console.error(e);
      res.status(500).json({ ok: false, error: 'DB_ERROR' });
    }
  });

  router.patch('/admin/auto-add/items/:id', async (req, res) => {
    try {
      const tenantId = helpers.getTenantId(req);
      const id = Number(req.params.id);
      if (!Number.isFinite(id) || id <= 0) return res.status(400).json({ ok: false, error: 'BAD_ID' });

      const fields = [];
      const values = [];

      if (Object.prototype.hasOwnProperty.call(req.body, 'product_id')) {
        const productId = Number(req.body.product_id);
        if (!Number.isFinite(productId) || productId <= 0) {
          return res.status(400).json({ ok: false, error: 'PRODUCT_REQUIRED' });
        }
        fields.push('product_id=?');
        values.push(productId);
      }

      if (Object.prototype.hasOwnProperty.call(req.body, 'default_qty')) {
        fields.push('default_qty=?');
        values.push(Math.max(0, Number(req.body.default_qty || 0)));
      }

      if (Object.prototype.hasOwnProperty.call(req.body, 'min_qty')) {
        fields.push('min_qty=?');
        values.push(Math.max(0, Number(req.body.min_qty || 0)));
      }

      if (Object.prototype.hasOwnProperty.call(req.body, 'max_qty')) {
        fields.push('max_qty=?');
        values.push(helpers.numOrNull(req.body.max_qty));
      }

      if (Object.prototype.hasOwnProperty.call(req.body, 'price_override')) {
        fields.push('price_override=?');
        values.push(helpers.numOrNull(req.body.price_override));
      }

      if (Object.prototype.hasOwnProperty.call(req.body, 'free_first_qty')) {
        fields.push('free_first_qty=?');
        values.push(Math.max(0, Number(req.body.free_first_qty || 0)));
      }

      if (Object.prototype.hasOwnProperty.call(req.body, 'free_per_amount')) {
        fields.push('free_per_amount=?');
        values.push(helpers.numOrNull(req.body.free_per_amount));
      }

      if (Object.prototype.hasOwnProperty.call(req.body, 'free_per_amount_qty')) {
        fields.push('free_per_amount_qty=?');
        values.push(Math.max(1, Number(req.body.free_per_amount_qty || 1)));
      }

      if (Object.prototype.hasOwnProperty.call(req.body, 'max_free_qty')) {
        fields.push('max_free_qty=?');
        values.push(helpers.numOrNull(req.body.max_free_qty));
      }

      if (Object.prototype.hasOwnProperty.call(req.body, 'is_active')) {
        fields.push('is_active=?');
        values.push(helpers.toBool(req.body.is_active, true) ? 1 : 0);
      }

      if (Object.prototype.hasOwnProperty.call(req.body, 'sort_order')) {
        fields.push('sort_order=?');
        values.push(helpers.numOrNull(req.body.sort_order) ?? 0);
      }

      if (!fields.length) return res.json({ ok: true });

      values.push(tenantId, id);
      await db.query(
        `UPDATE prod_auto_add_items
         SET ${fields.join(', ')}
         WHERE tenant_id=? AND id=?`,
        values
      );

      res.json({ ok: true });
    } catch (e) {
      console.error(e);
      res.status(500).json({ ok: false, error: 'DB_ERROR' });
    }
  });

  router.delete('/admin/auto-add/items/:id', async (req, res) => {
    try {
      const tenantId = helpers.getTenantId(req);
      const id = Number(req.params.id);
      if (!Number.isFinite(id) || id <= 0) return res.status(400).json({ ok: false, error: 'BAD_ID' });

      await db.query(
        `DELETE FROM prod_auto_add_items WHERE tenant_id=? AND id=?`,
        [tenantId, id]
      );

      res.json({ ok: true });
    } catch (e) {
      console.error(e);
      res.status(500).json({ ok: false, error: 'DB_ERROR' });
    }
  });

  router.get('/admin/catalog/categories', async (req, res) => {
    try {
      const tenantId = helpers.getTenantId(req);
      const [rows] = await db.query(
        `SELECT id, title, code, sort_order
         FROM prod_categories
         WHERE tenant_id=? AND is_active=1
         ORDER BY sort_order ASC, id ASC`,
        [tenantId]
      );
      res.json({ ok: true, data: rows });
    } catch (e) {
      console.error(e);
      res.status(500).json({ ok: false, error: 'DB_ERROR' });
    }
  });

  router.get('/admin/catalog/products', async (req, res) => {
    try {
      const tenantId = helpers.getTenantId(req);
      const categoryId = helpers.numOrNull(req.query.category_id);
      const q = helpers.strOrNull(req.query.q);

      const params = [];
      let sql =
        `SELECT p.id, p.name, p.price, p.cost_price, p.unit_id, p.base_unit_id, p.base_qty, p.photos_json, p.is_active,
           (SELECT 1 FROM prod_variant_assignments va
            INNER JOIN prod_variant_groups vg ON vg.id = va.variant_group_id AND vg.tenant_id = va.tenant_id
            WHERE va.tenant_id = p.tenant_id AND va.product_id = p.id AND va.is_active = 1 AND vg.is_active = 1 LIMIT 1) AS has_variants,
           (SELECT 1 FROM prod_product_ingredients pi
            WHERE pi.tenant_id = p.tenant_id AND pi.product_id = p.id AND pi.is_variable = 1 LIMIT 1) AS has_changeable_composition
         FROM prod_products p`;

      if (categoryId) {
        sql += ` JOIN prod_product_categories pc
                 ON pc.tenant_id=p.tenant_id AND pc.product_id=p.id AND pc.category_id=?`;
        params.push(categoryId);
      }

      sql += ` WHERE p.tenant_id=? AND p.is_active=1`;
      params.push(tenantId);

      if (q) {
        sql += ` AND p.name LIKE ?`;
        params.push(`%${q}%`);
      }

      sql += ` ORDER BY p.name ASC, p.id ASC LIMIT 200`;

      const [rows] = await db.query(sql, params);
      
      for (const r of rows) {
        r.photos = helpers.safeJsonArray(r.photos_json);
        r.photos_json = r.photos;
        r.has_variants = r.has_variants != null ? 1 : 0;
        r.has_changeable_composition = r.has_changeable_composition != null ? 1 : 0;
      }
      
      res.json({ ok: true, data: rows });
    } catch (e) {
      console.error(e);
      res.status(500).json({ ok: false, error: 'DB_ERROR' });
    }
  });

  // ------------------------------
  // Combo blocks (блоки комбо)
  // ------------------------------
  router.get('/admin/combo-blocks/product-flags', async (req, res) => {
    try {
      const tenantId = helpers.getTenantId(req);
      const idsParam = req.query.ids;
      if (!idsParam || typeof idsParam !== 'string') {
        return res.json({ ok: true, data: [] });
      }
      const ids = idsParam.split(',').map((id) => parseInt(id, 10)).filter((id) => Number.isFinite(id) && id > 0);
      if (ids.length === 0) return res.json({ ok: true, data: [] });
      const placeholders = ids.map(() => '?').join(',');
      const [rows] = await db.query(
        `SELECT p.id AS product_id,
           (SELECT 1 FROM prod_variant_assignments va
            INNER JOIN prod_variant_groups vg ON vg.id = va.variant_group_id AND vg.tenant_id = va.tenant_id
            WHERE va.tenant_id = p.tenant_id AND va.product_id = p.id AND va.is_active = 1 AND vg.is_active = 1 LIMIT 1) AS has_variants,
           (SELECT 1 FROM prod_product_ingredients pi
            WHERE pi.tenant_id = p.tenant_id AND pi.product_id = p.id AND pi.is_variable = 1 LIMIT 1) AS has_changeable_composition
         FROM prod_products p
         WHERE p.tenant_id=? AND p.id IN (${placeholders})`,
        [tenantId, ...ids]
      );
      const data = rows.map((r) => ({
        product_id: r.product_id,
        has_variants: r.has_variants != null ? 1 : 0,
        has_changeable_composition: r.has_changeable_composition != null ? 1 : 0,
      }));
      res.json({ ok: true, data });
    } catch (e) {
      console.error(e);
      res.status(500).json({ ok: false, error: 'DB_ERROR' });
    }
  });

  router.get('/admin/combo-blocks', async (req, res) => {
    try {
      const tenantId = helpers.getTenantId(req);
      const [rows] = await db.query(
        `SELECT b.id, b.title, b.sort_order, b.min_select, b.max_select, b.created_at, b.updated_at,
                (SELECT COUNT(*) FROM prod_combo_block_products bp WHERE bp.block_id = b.id) AS products_count
         FROM prod_combo_blocks b
         WHERE b.tenant_id=?
         ORDER BY b.sort_order ASC, b.id ASC`,
        [tenantId]
      );
      res.json({ ok: true, data: rows });
    } catch (e) {
      console.error(e);
      res.status(500).json({ ok: false, error: 'DB_ERROR' });
    }
  });

  router.get('/admin/combo-blocks/:id', async (req, res) => {
    try {
      const tenantId = helpers.getTenantId(req);
      const id = Number(req.params.id);
      if (!Number.isFinite(id) || id <= 0) return res.status(400).json({ ok: false, error: 'BAD_ID' });
      const [[block]] = await db.query(
        'SELECT id, title, sort_order, min_select, max_select, created_at, updated_at FROM prod_combo_blocks WHERE tenant_id=? AND id=? LIMIT 1',
        [tenantId, id]
      );
      if (!block) return res.status(404).json({ ok: false, error: 'NOT_FOUND' });
      const [productsRaw] = await db.query(
        `SELECT bp.id, bp.product_id, bp.sort_order, bp.is_default, p.name AS product_name, p.price AS product_price, p.photos_json AS product_photos_json,
           (SELECT 1 FROM prod_variant_assignments va
            INNER JOIN prod_variant_groups vg ON vg.id = va.variant_group_id AND vg.tenant_id = va.tenant_id
            WHERE va.tenant_id = bp.tenant_id AND va.product_id = bp.product_id AND va.is_active = 1 AND vg.is_active = 1 LIMIT 1) AS has_variants,
           (SELECT 1 FROM prod_product_ingredients pi
            WHERE pi.tenant_id = bp.tenant_id AND pi.product_id = bp.product_id AND pi.is_variable = 1 LIMIT 1) AS has_changeable_composition
         FROM prod_combo_block_products bp
         JOIN prod_products p ON p.id = bp.product_id
         WHERE bp.tenant_id=? AND bp.block_id=?
         ORDER BY bp.sort_order ASC, bp.id ASC`,
        [tenantId, id]
      );
      const photos = productsRaw.map((r) => helpers.safeJsonArray(r.product_photos_json));
      const products = productsRaw.map((r, i) => {
        const arr = photos[i];
        const product_photo = Array.isArray(arr) && arr.length > 0 ? arr[0] : null;
        return {
          id: r.id,
          product_id: r.product_id,
          product_name: r.product_name,
          product_price: r.product_price != null ? Number(r.product_price) : 0,
          sort_order: r.sort_order,
          is_default: r.is_default,
          product_photo,
          has_variants: r.has_variants != null ? 1 : 0,
          has_changeable_composition: r.has_changeable_composition != null ? 1 : 0,
        };
      });
      let defaultSet = false;
      for (const p of products) {
        const wasDefault = Number(p.is_default) === 1;
        p.is_default = wasDefault && !defaultSet ? 1 : 0;
        if (wasDefault) defaultSet = true;
      }
      res.json({ ok: true, data: { ...block, products } });
    } catch (e) {
      console.error(e);
      res.status(500).json({ ok: false, error: 'DB_ERROR' });
    }
  });

  router.post('/admin/combo-blocks', async (req, res) => {
    try {
      const tenantId = helpers.getTenantId(req);
      const title = helpers.strOrNull(req.body.title);
      const sortOrder = helpers.numOrNull(req.body.sort_order) ?? 0;
      const minSelect = Math.max(0, parseInt(helpers.numOrNull(req.body.min_select), 10) || 1);
      const maxSelect = Math.max(1, parseInt(helpers.numOrNull(req.body.max_select), 10) || 1);
      if (!title || !title.trim()) return res.status(400).json({ ok: false, error: 'TITLE_REQUIRED' });
      const [result] = await db.query(
        'INSERT INTO prod_combo_blocks (tenant_id, title, sort_order, min_select, max_select) VALUES (?,?,?,?,?)',
        [tenantId, title.trim(), sortOrder, minSelect, Math.max(minSelect, maxSelect)]
      );
      const blockId = result.insertId;
      const products = Array.isArray(req.body.products) ? req.body.products : [];
      if (products.length) {
        let defaultSet = false;
        for (let i = 0; i < products.length; i++) {
          const p = products[i];
          const productId = Number(p.product_id);
          if (!Number.isFinite(productId) || productId <= 0) continue;
          const isDefault = p.is_default ? 1 : (defaultSet ? 0 : (defaultSet = true, 1));
          await db.query(
            'INSERT INTO prod_combo_block_products (tenant_id, block_id, product_id, sort_order, is_default) VALUES (?,?,?,?,?)',
            [tenantId, blockId, productId, Number(p.sort_order) ?? i, isDefault]
          );
        }
      }
      const [[block]] = await db.query(
        'SELECT id, title, sort_order, min_select, max_select, created_at, updated_at FROM prod_combo_blocks WHERE id=? LIMIT 1',
        [blockId]
      );
      res.status(201).json({ ok: true, data: block });
    } catch (e) {
      console.error(e);
      res.status(500).json({ ok: false, error: 'DB_ERROR' });
    }
  });

  router.patch('/admin/combo-blocks/:id', async (req, res) => {
    try {
      const tenantId = helpers.getTenantId(req);
      const id = Number(req.params.id);
      if (!Number.isFinite(id) || id <= 0) return res.status(400).json({ ok: false, error: 'BAD_ID' });
      const [[existing]] = await db.query(
        'SELECT id FROM prod_combo_blocks WHERE tenant_id=? AND id=? LIMIT 1',
        [tenantId, id]
      );
      if (!existing) return res.status(404).json({ ok: false, error: 'NOT_FOUND' });
      const title = helpers.strOrNull(req.body.title);
      const sortOrder = helpers.numOrNull(req.body.sort_order);
      const minSelect = req.body.min_select !== undefined ? Math.max(0, parseInt(req.body.min_select, 10) || 1) : null;
      const maxSelect = req.body.max_select !== undefined ? Math.max(1, parseInt(req.body.max_select, 10) || 1) : null;
      if (title !== null) {
        await db.query('UPDATE prod_combo_blocks SET title=? WHERE tenant_id=? AND id=?', [title.trim(), tenantId, id]);
      }
      if (sortOrder !== undefined && sortOrder !== null) {
        await db.query('UPDATE prod_combo_blocks SET sort_order=? WHERE tenant_id=? AND id=?', [sortOrder, tenantId, id]);
      }
      if (minSelect !== null) {
        await db.query('UPDATE prod_combo_blocks SET min_select=? WHERE tenant_id=? AND id=?', [minSelect, tenantId, id]);
      }
      if (maxSelect !== null) {
        await db.query('UPDATE prod_combo_blocks SET max_select = GREATEST(COALESCE(min_select,1), ?) WHERE tenant_id=? AND id=?', [maxSelect, tenantId, id]);
      }
      if (Array.isArray(req.body.products)) {
        await db.query('DELETE FROM prod_combo_block_products WHERE tenant_id=? AND block_id=?', [tenantId, id]);
        const products = req.body.products;
        let defaultSet = false;
        for (let i = 0; i < products.length; i++) {
          const p = products[i];
          const productId = Number(p.product_id);
          if (!Number.isFinite(productId) || productId <= 0) continue;
          const isDefault = p.is_default ? 1 : (defaultSet ? 0 : (defaultSet = true, 1));
          await db.query(
            'INSERT INTO prod_combo_block_products (tenant_id, block_id, product_id, sort_order, is_default) VALUES (?,?,?,?,?)',
            [tenantId, id, productId, Number(p.sort_order) ?? i, isDefault]
          );
        }
      }
      const [[block]] = await db.query(
        'SELECT id, title, sort_order, min_select, max_select, created_at, updated_at FROM prod_combo_blocks WHERE id=? LIMIT 1',
        [id]
      );
      res.json({ ok: true, data: block });
    } catch (e) {
      console.error(e);
      res.status(500).json({ ok: false, error: 'DB_ERROR' });
    }
  });

  router.delete('/admin/combo-blocks/:id', async (req, res) => {
    try {
      const tenantId = helpers.getTenantId(req);
      const id = Number(req.params.id);
      if (!Number.isFinite(id) || id <= 0) return res.status(400).json({ ok: false, error: 'BAD_ID' });
      const [result] = await db.query('DELETE FROM prod_combo_blocks WHERE tenant_id=? AND id=?', [tenantId, id]);
      if (result.affectedRows === 0) return res.status(404).json({ ok: false, error: 'NOT_FOUND' });
      res.json({ ok: true });
    } catch (e) {
      console.error(e);
      res.status(500).json({ ok: false, error: 'DB_ERROR' });
    }
  });

  // ------------------------------
  // Combo sets (prod_combos) CRUD + blocks
  // ------------------------------
  router.get('/admin/combos', async (req, res) => {
    try {
      const tenantId = helpers.getTenantId(req);
      const [rows] = await db.query(
        `SELECT id, tenant_id, title, description, discount_percent, category_code, image_url, is_active, sort_order, created_at, updated_at
         FROM prod_combos WHERE tenant_id=? ORDER BY sort_order ASC, id ASC`,
        [tenantId]
      );
      res.json({ ok: true, data: rows });
    } catch (e) {
      console.error(e);
      res.status(500).json({ ok: false, error: 'DB_ERROR' });
    }
  });

  router.get('/admin/combos/:id', async (req, res) => {
    try {
      const tenantId = helpers.getTenantId(req);
      const id = Number(req.params.id);
      if (!Number.isFinite(id) || id <= 0) return res.status(400).json({ ok: false, error: 'BAD_ID' });
      const [[row]] = await db.query(
        'SELECT id, tenant_id, title, description, discount_percent, category_code, image_url, is_active, sort_order, created_at, updated_at FROM prod_combos WHERE tenant_id=? AND id=? LIMIT 1',
        [tenantId, id]
      );
      if (!row) return res.status(404).json({ ok: false, error: 'NOT_FOUND' });
      res.json({ ok: true, data: row });
    } catch (e) {
      console.error(e);
      res.status(500).json({ ok: false, error: 'DB_ERROR' });
    }
  });

  router.get('/admin/combos/:id/blocks', async (req, res) => {
    try {
      const tenantId = helpers.getTenantId(req);
      const comboId = Number(req.params.id);
      if (!Number.isFinite(comboId) || comboId <= 0) return res.status(400).json({ ok: false, error: 'BAD_ID' });
      const [[combo]] = await db.query('SELECT id FROM prod_combos WHERE tenant_id=? AND id=? LIMIT 1', [tenantId, comboId]);
      if (!combo) return res.status(404).json({ ok: false, error: 'NOT_FOUND' });
      const [rows] = await db.query(
        `SELECT sb.id, sb.combo_id, sb.block_id, sb.sort_order, b.title AS block_title
         FROM prod_combo_set_blocks sb
         JOIN prod_combo_blocks b ON b.id = sb.block_id AND b.tenant_id = sb.tenant_id
         WHERE sb.tenant_id=? AND sb.combo_id=? ORDER BY sb.sort_order ASC, sb.id ASC`,
        [tenantId, comboId]
      );
      res.json({ ok: true, data: rows });
    } catch (e) {
      console.error(e);
      res.status(500).json({ ok: false, error: 'DB_ERROR' });
    }
  });

  router.post('/admin/combos', async (req, res) => {
    try {
      const tenantId = helpers.getTenantId(req);
      const title = helpers.strOrNull(req.body.title);
      const description = helpers.strOrNull(req.body.description) || null;
      const discountPercent = helpers.numOrNull(req.body.discount_percent) ?? 0;
      const categoryCode = helpers.strOrNull(req.body.category_code) || null;
      const imageUrl = helpers.strOrNull(req.body.image_url) || null;
      const isActive = req.body.is_active === false || req.body.is_active === '0' ? 0 : 1;
      const sortOrder = helpers.numOrNull(req.body.sort_order) ?? 0;
      if (!title || !title.trim()) return res.status(400).json({ ok: false, error: 'TITLE_REQUIRED' });
      const [result] = await db.query(
        'INSERT INTO prod_combos (tenant_id, title, description, discount_percent, category_code, image_url, is_active, sort_order) VALUES (?,?,?,?,?,?,?,?)',
        [tenantId, title.trim(), description, discountPercent, categoryCode, imageUrl, isActive, sortOrder]
      );
      const comboId = result.insertId;
      const blocks = Array.isArray(req.body.blocks) ? req.body.blocks : [];
      for (let i = 0; i < blocks.length; i++) {
        const b = blocks[i];
        const blockId = Number(b.block_id);
        if (!Number.isFinite(blockId) || blockId <= 0) continue;
        await db.query(
          'INSERT INTO prod_combo_set_blocks (tenant_id, combo_id, block_id, sort_order) VALUES (?,?,?,?)',
          [tenantId, comboId, blockId, Number(b.sort_order) ?? i]
        );
      }
      const [[row]] = await db.query(
        'SELECT id, tenant_id, title, description, discount_percent, category_code, image_url, is_active, sort_order, created_at, updated_at FROM prod_combos WHERE id=? LIMIT 1',
        [comboId]
      );
      res.status(201).json({ ok: true, data: row });
    } catch (e) {
      console.error(e);
      res.status(500).json({ ok: false, error: 'DB_ERROR' });
    }
  });

  router.patch('/admin/combos/:id', async (req, res) => {
    try {
      const tenantId = helpers.getTenantId(req);
      const id = Number(req.params.id);
      if (!Number.isFinite(id) || id <= 0) return res.status(400).json({ ok: false, error: 'BAD_ID' });
      const [[existing]] = await db.query('SELECT id FROM prod_combos WHERE tenant_id=? AND id=? LIMIT 1', [tenantId, id]);
      if (!existing) return res.status(404).json({ ok: false, error: 'NOT_FOUND' });
      const title = helpers.strOrNull(req.body.title);
      const description = helpers.strOrNull(req.body.description);
      const discountPercent = req.body.discount_percent !== undefined ? (helpers.numOrNull(req.body.discount_percent) ?? 0) : null;
      const categoryCode = req.body.category_code !== undefined ? (helpers.strOrNull(req.body.category_code) || null) : null;
      const imageUrl = req.body.image_url !== undefined ? (helpers.strOrNull(req.body.image_url) || null) : null;
      const isActive = req.body.is_active !== undefined ? (req.body.is_active === false || req.body.is_active === '0' || req.body.is_active === 0 ? 0 : 1) : null;
      const sortOrder = req.body.sort_order !== undefined ? (helpers.numOrNull(req.body.sort_order) ?? 0) : null;
      const updates = [];
      const params = [];
      if (title !== null) { updates.push('title=?'); params.push(title.trim()); }
      if (description !== undefined) { updates.push('description=?'); params.push(description); }
      if (discountPercent !== null) { updates.push('discount_percent=?'); params.push(discountPercent); }
      if (categoryCode !== undefined) { updates.push('category_code=?'); params.push(categoryCode); }
      if (imageUrl !== undefined) { updates.push('image_url=?'); params.push(imageUrl); }
      if (isActive !== null) { updates.push('is_active=?'); params.push(isActive); }
      if (sortOrder !== null) { updates.push('sort_order=?'); params.push(sortOrder); }
      if (updates.length) {
        params.push(tenantId, id);
        await db.query('UPDATE prod_combos SET ' + updates.join(', ') + ' WHERE tenant_id=? AND id=?', params);
      }
      if (Array.isArray(req.body.blocks)) {
        await db.query('DELETE FROM prod_combo_set_blocks WHERE tenant_id=? AND combo_id=?', [tenantId, id]);
        for (let i = 0; i < req.body.blocks.length; i++) {
          const b = req.body.blocks[i];
          const blockId = Number(b.block_id);
          if (!Number.isFinite(blockId) || blockId <= 0) continue;
          await db.query(
            'INSERT INTO prod_combo_set_blocks (tenant_id, combo_id, block_id, sort_order) VALUES (?,?,?,?)',
            [tenantId, id, blockId, Number(b.sort_order) ?? i]
          );
        }
      }
      const [[row]] = await db.query(
        'SELECT id, tenant_id, title, description, discount_percent, category_code, image_url, is_active, sort_order, created_at, updated_at FROM prod_combos WHERE id=? LIMIT 1',
        [id]
      );
      res.json({ ok: true, data: row });
    } catch (e) {
      console.error(e);
      res.status(500).json({ ok: false, error: 'DB_ERROR' });
    }
  });

  router.put('/admin/combos/:id/blocks', async (req, res) => {
    try {
      const tenantId = helpers.getTenantId(req);
      const comboId = Number(req.params.id);
      if (!Number.isFinite(comboId) || comboId <= 0) return res.status(400).json({ ok: false, error: 'BAD_ID' });
      const [[combo]] = await db.query('SELECT id FROM prod_combos WHERE tenant_id=? AND id=? LIMIT 1', [tenantId, comboId]);
      if (!combo) return res.status(404).json({ ok: false, error: 'NOT_FOUND' });
      await db.query('DELETE FROM prod_combo_set_blocks WHERE tenant_id=? AND combo_id=?', [tenantId, comboId]);
      const blocks = Array.isArray(req.body.blocks) ? req.body.blocks : [];
      for (let i = 0; i < blocks.length; i++) {
        const b = blocks[i];
        const blockId = Number(b.block_id);
        if (!Number.isFinite(blockId) || blockId <= 0) continue;
        await db.query(
          'INSERT INTO prod_combo_set_blocks (tenant_id, combo_id, block_id, sort_order) VALUES (?,?,?,?)',
          [tenantId, comboId, blockId, Number(b.sort_order) ?? i]
        );
      }
      const [rows] = await db.query(
        `SELECT sb.id, sb.combo_id, sb.block_id, sb.sort_order, b.title AS block_title
         FROM prod_combo_set_blocks sb
         JOIN prod_combo_blocks b ON b.id = sb.block_id AND b.tenant_id = sb.tenant_id
         WHERE sb.tenant_id=? AND sb.combo_id=? ORDER BY sb.sort_order ASC, sb.id ASC`,
        [tenantId, comboId]
      );
      res.json({ ok: true, data: rows });
    } catch (e) {
      console.error(e);
      res.status(500).json({ ok: false, error: 'DB_ERROR' });
    }
  });

  router.delete('/admin/combos/:id', async (req, res) => {
    try {
      const tenantId = helpers.getTenantId(req);
      const id = Number(req.params.id);
      if (!Number.isFinite(id) || id <= 0) return res.status(400).json({ ok: false, error: 'BAD_ID' });
      const [result] = await db.query('DELETE FROM prod_combos WHERE tenant_id=? AND id=?', [tenantId, id]);
      if (result.affectedRows === 0) return res.status(404).json({ ok: false, error: 'NOT_FOUND' });
      res.json({ ok: true });
    } catch (e) {
      console.error(e);
      res.status(500).json({ ok: false, error: 'DB_ERROR' });
    }
  });

  router.get('/admin/products/:id/option-assignments', async (req, res) => {
    try {
      const tenantId = helpers.getTenantId(req);
      const productId = Number(req.params.id);
      if (!Number.isFinite(productId) || productId <= 0) return res.status(400).json({ ok: false, error: 'BAD_ID' });

      const [rows] = await db.query(
        `SELECT a.id AS assignment_id, a.group_id, a.priority, a.sort_order, a.is_active, a.out_of_stock_action,
                g.title, g.selection_type, g.min_select, g.max_select
         FROM prod_option_assignments a
         JOIN prod_option_groups g ON g.tenant_id=a.tenant_id AND g.id=a.group_id
         WHERE a.tenant_id=? AND a.assign_type='product' AND a.assign_id=?
         ORDER BY a.sort_order ASC, a.id ASC`,
        [tenantId, productId]
      );

      res.json({ ok: true, data: rows });
    } catch (e) {
      console.error(e);
      res.status(500).json({ ok: false, error: 'DB_ERROR' });
    }
  });

  router.post('/admin/products/:id/option-assignments', async (req, res) => {
    const tenantId = helpers.getTenantId(req);
    const productId = Number(req.params.id);
    if (!Number.isFinite(productId) || productId <= 0) return res.status(400).json({ ok: false, error: 'BAD_ID' });
    const groupIds = Array.isArray(req.body.group_ids) ? req.body.group_ids : [];
    const norm = Array.from(new Set(groupIds.map((x) => Number(x)).filter((x) => Number.isFinite(x) && x > 0)));
    if (!norm.length) return res.status(400).json({ ok: false, error: 'EMPTY' });

    const conn = await db.getConnection();
    try {
      await conn.beginTransaction();
      const [existing] = await conn.query(
        `SELECT id, group_id, is_active
         FROM prod_option_assignments
         WHERE tenant_id=? AND assign_type='product' AND assign_id=?
           AND group_id IN (${norm.map(() => '?').join(',')})`,
        [tenantId, productId, ...norm]
      );
      const map = new Map(existing.map((row) => [Number(row.group_id), row]));
      const added = [];
      const reenabled = [];
      const skipped = [];

      for (const groupId of norm) {
        const row = map.get(groupId);
        if (!row) {
          await conn.query(
            `INSERT INTO prod_option_assignments
             (tenant_id, group_id, assign_type, assign_id, priority, sort_order, out_of_stock_action, is_active)
             VALUES (?,?,?,?,?,?,?,1)`,
            [tenantId, groupId, 'product', productId, 0, 0, 1]
          );
          added.push(groupId);
          continue;
        }
        if (row.is_active) {
          skipped.push(groupId);
          continue;
        }
        await conn.query(
          `UPDATE prod_option_assignments
           SET is_active=1, priority=0, sort_order=0, out_of_stock_action=COALESCE(out_of_stock_action, 1)
           WHERE tenant_id=? AND id=?`,
          [tenantId, row.id]
        );
        reenabled.push(groupId);
      }

      await conn.commit();
      res.json({ ok: true, added, reenabled, skipped });
    } catch (e) {
      await conn.rollback();
      console.error(e);
      res.status(500).json({ ok: false, error: 'DB_ERROR' });
    } finally {
      conn.release();
    }
  });

  async function disableProductAssignment(req, res) {
    try {
      const tenantId = helpers.getTenantId(req);
      const productId = Number(req.params.id);
      const groupId = Number(req.params.groupId);
      if (!Number.isFinite(productId) || productId <= 0) return res.status(400).json({ ok: false, error: 'BAD_ID' });
      if (!Number.isFinite(groupId) || groupId <= 0) return res.status(400).json({ ok: false, error: 'BAD_GROUP_ID' });

      await db.query(
        `UPDATE prod_option_assignments
         SET is_active=0
         WHERE tenant_id=? AND assign_type='product' AND assign_id=? AND group_id=?`,
        [tenantId, productId, groupId]
      );

      res.json({ ok: true });
    } catch (e) {
      console.error(e);
      res.status(500).json({ ok: false, error: 'DB_ERROR' });
    }
  }

  router.patch('/admin/products/:id/option-assignments/:groupId', disableProductAssignment);
  router.delete('/admin/products/:id/option-assignments/:groupId', disableProductAssignment);

  router.put('/admin/products/:id/option-assignments/:groupId/item-exclusions', async (req, res) => {
    const tenantId = helpers.getTenantId(req);
    const productId = Number(req.params.id);
    const groupId = Number(req.params.groupId);
    if (!Number.isFinite(productId) || productId <= 0) {
      return res.status(400).json({ ok: false, error: 'BAD_ID' });
    }
    if (!Number.isFinite(groupId) || groupId <= 0) {
      return res.status(400).json({ ok: false, error: 'BAD_GROUP_ID' });
    }

    const excludedItemIds = Array.from(new Set(
      (Array.isArray(req.body?.excluded_item_ids) ? req.body.excluded_item_ids : [])
        .map((itemId) => Number(itemId))
        .filter((itemId) => Number.isFinite(itemId) && itemId > 0)
    ));

    const conn = await db.getConnection();
    try {
      await conn.beginTransaction();

      const [assignmentRows] = await conn.query(
        `SELECT id
         FROM prod_option_assignments
         WHERE tenant_id=? AND assign_type='product' AND assign_id=? AND group_id=?
         LIMIT 1`,
        [tenantId, productId, groupId]
      );
      if (!assignmentRows.length) {
        await conn.rollback();
        return res.status(404).json({ ok: false, error: 'ASSIGNMENT_NOT_FOUND' });
      }

      const [groupItemRows] = await conn.query(
        `SELECT id
         FROM prod_option_items
         WHERE tenant_id=? AND group_id=? AND target_type='product'`,
        [tenantId, groupId]
      );
      const validItemIds = new Set(
        groupItemRows
          .map((row) => Number(row.id))
          .filter((itemId) => Number.isFinite(itemId) && itemId > 0)
      );
      const invalidItemIds = excludedItemIds.filter((itemId) => !validItemIds.has(itemId));
      if (invalidItemIds.length) {
        await conn.rollback();
        return res.status(400).json({ ok: false, error: 'INVALID_ITEM_IDS', item_ids: invalidItemIds });
      }

      await conn.query(
        `DELETE FROM prod_option_item_exclusions
         WHERE tenant_id=? AND product_id=? AND group_id=?`,
        [tenantId, productId, groupId]
      );

      if (excludedItemIds.length) {
        await conn.query(
          `INSERT INTO prod_option_item_exclusions
           (tenant_id, product_id, group_id, option_item_id)
           VALUES ${excludedItemIds.map(() => '(?,?,?,?)').join(',')}`,
          excludedItemIds.flatMap((itemId) => [tenantId, productId, groupId, itemId])
        );
      }

      await conn.commit();

      const visibleItemIds = Array.from(validItemIds).filter((itemId) => !excludedItemIds.includes(itemId));
      return res.json({
        ok: true,
        data: {
          product_id: productId,
          group_id: groupId,
          excluded_item_ids: excludedItemIds,
          visible_item_ids: visibleItemIds,
        },
      });
    } catch (e) {
      await conn.rollback();
      console.error(e);
      return res.status(500).json({ ok: false, error: 'DB_ERROR' });
    } finally {
      conn.release();
    }
  });

  router.put('/admin/products/:id/variant-assignments/:groupId/value-exclusions', async (req, res) => {
    const tenantId = helpers.getTenantId(req);
    const productId = Number(req.params.id);
    const groupId = Number(req.params.groupId);
    if (!Number.isFinite(productId) || productId <= 0) {
      return res.status(400).json({ ok: false, error: 'BAD_ID' });
    }
    if (!Number.isFinite(groupId) || groupId <= 0) {
      return res.status(400).json({ ok: false, error: 'BAD_GROUP_ID' });
    }

    const excludedValueIndexes = Array.from(new Set(
      (Array.isArray(req.body?.excluded_value_indexes) ? req.body.excluded_value_indexes : [])
        .map((valueIndex) => Number(valueIndex))
        .filter((valueIndex) => Number.isFinite(valueIndex) && valueIndex >= 0)
    ));

    const conn = await db.getConnection();
    try {
      await conn.beginTransaction();

      const [assignmentRows] = await conn.query(
        `SELECT id, default_value_index
         FROM prod_variant_assignments
         WHERE tenant_id=? AND product_id=? AND variant_group_id=? AND is_active=1
         LIMIT 1`,
        [tenantId, productId, groupId]
      );
      if (!assignmentRows.length) {
        await conn.rollback();
        return res.status(404).json({ ok: false, error: 'ASSIGNMENT_NOT_FOUND' });
      }

      const [groupRows] = await conn.query(
        `SELECT \`values\`, default_value_index
         FROM prod_variant_groups
         WHERE tenant_id=? AND id=?
         LIMIT 1`,
        [tenantId, groupId]
      );
      if (!groupRows.length) {
        await conn.rollback();
        return res.status(404).json({ ok: false, error: 'GROUP_NOT_FOUND' });
      }

      const values = helpers.safeJsonArray(groupRows[0].values);
      const invalidValueIndexes = excludedValueIndexes.filter((valueIndex) => valueIndex < 0 || valueIndex >= values.length);
      if (invalidValueIndexes.length) {
        await conn.rollback();
        return res.status(400).json({ ok: false, error: 'INVALID_VALUE_INDEXES', value_indexes: invalidValueIndexes });
      }

      const visibleValueIndexes = values
        .map((_, valueIndex) => valueIndex)
        .filter((valueIndex) => !excludedValueIndexes.includes(valueIndex));
      if (!visibleValueIndexes.length) {
        await conn.rollback();
        return res.status(400).json({ ok: false, error: 'AT_LEAST_ONE_VALUE_REQUIRED' });
      }

      await conn.query(
        `DELETE FROM prod_variant_value_exclusions
         WHERE tenant_id=? AND product_id=? AND variant_group_id=?`,
        [tenantId, productId, groupId]
      );

      if (excludedValueIndexes.length) {
        await conn.query(
          `INSERT INTO prod_variant_value_exclusions
           (tenant_id, product_id, variant_group_id, value_index)
           VALUES ${excludedValueIndexes.map(() => '(?,?,?,?)').join(',')}`,
          excludedValueIndexes.flatMap((valueIndex) => [tenantId, productId, groupId, valueIndex])
        );
      }

      const assignmentDefaultValueIndex = assignmentRows[0].default_value_index != null
        ? Number(assignmentRows[0].default_value_index)
        : null;
      const groupDefaultValueIndex = groupRows[0].default_value_index != null
        ? Number(groupRows[0].default_value_index)
        : null;
      const rawDefaultValueIndex = assignmentDefaultValueIndex != null ? assignmentDefaultValueIndex : groupDefaultValueIndex;
      const resolvedDefaultValueIndex = visibleValueIndexes.includes(rawDefaultValueIndex)
        ? rawDefaultValueIndex
        : visibleValueIndexes[0];

      await conn.commit();

      return res.json({
        ok: true,
        data: {
          product_id: productId,
          group_id: groupId,
          excluded_value_indexes: excludedValueIndexes,
          visible_value_indexes: visibleValueIndexes,
          resolved_default_value_index: resolvedDefaultValueIndex,
          resolved_default_visible_index: visibleValueIndexes.indexOf(resolvedDefaultValueIndex),
        },
      });
    } catch (e) {
      await conn.rollback();
      console.error(e);
      return res.status(500).json({ ok: false, error: 'DB_ERROR' });
    } finally {
      conn.release();
    }
  });

  // ------------------------------
  // Units: /api/admin/units
  // ------------------------------
  router.get('/admin/units', async (req, res) => {
    try {
      const tenantId = helpers.getTenantId(req);
      const showAll = String(req.query.all || "") === "1";
      const whereActive = showAll ? "" : "AND is_active=1";
      const [rows] = await db.query(
        `SELECT id, code, title, short_title, sort_order, is_active
         FROM prod_units
         WHERE tenant_id=? ${whereActive}
         ORDER BY sort_order ASC, id ASC`,
        [tenantId]
      );
      res.json({ ok: true, data: rows });
    } catch (e) {
      console.error(e);
      res.status(500).json({ ok: false, error: 'DB_ERROR' });
    }
  });

  router.post('/admin/units', async (req, res) => {
    try {
      const tenantId = helpers.getTenantId(req);
      const title = helpers.strOrNull(req.body.title);
      if (!title) return res.status(400).json({ ok: false, error: 'TITLE_REQUIRED' });

      const code = helpers.strOrNull(req.body.code) || helpers.makeCodeFromTitle(title);
      const shortTitle = helpers.strOrNull(req.body.short_title);
      const sortOrder = helpers.numOrNull(req.body.sort_order) ?? 0;
      const isActive = helpers.toBool(req.body.is_active, true) ? 1 : 0;

      const [result] = await db.query(
        `INSERT INTO prod_units
         (tenant_id, code, title, short_title, sort_order, is_active)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [tenantId, code, title, shortTitle, sortOrder, isActive]
      );

      res.json({ ok: true, id: result.insertId });
    } catch (e) {
      console.error(e);
      res.status(500).json({ ok: false, error: 'DB_ERROR' });
    }
  });

  router.put('/admin/units/:id', async (req, res) => {
    try {
      const tenantId = helpers.getTenantId(req);
      const id = Number(req.params.id);
      if (!Number.isFinite(id) || id <= 0) return res.status(400).json({ ok: false, error: 'BAD_ID' });

      const title = helpers.strOrNull(req.body.title);
      if (!title) return res.status(400).json({ ok: false, error: 'TITLE_REQUIRED' });

      const code = helpers.strOrNull(req.body.code) || helpers.makeCodeFromTitle(title);
      const shortTitle = helpers.strOrNull(req.body.short_title);
      const sortOrder = helpers.numOrNull(req.body.sort_order) ?? 0;
      const isActive = helpers.toBool(req.body.is_active, true) ? 1 : 0;

      await db.query(
        `UPDATE prod_units
         SET code=?, title=?, short_title=?, sort_order=?, is_active=?
         WHERE tenant_id=? AND id=?`,
        [code, title, shortTitle, sortOrder, isActive, tenantId, id]
      );

      res.json({ ok: true });
    } catch (e) {
      console.error(e);
      res.status(500).json({ ok: false, error: 'DB_ERROR' });
    }
  });

  router.delete('/admin/units/:id', async (req, res) => {
    try {
      const tenantId = helpers.getTenantId(req);
      const id = Number(req.params.id);
      if (!Number.isFinite(id) || id <= 0) return res.status(400).json({ ok: false, error: 'BAD_ID' });

      await db.query(
        `UPDATE prod_units
         SET is_active=0
         WHERE tenant_id=? AND id=?`,
        [tenantId, id]
      );

      res.json({ ok: true });
    } catch (e) {
      console.error(e);
      res.status(500).json({ ok: false, error: 'DB_ERROR' });
    }
  });

  // ------------------------------
  // Unit conversions: /api/admin/unit-conversions
  // ------------------------------
  router.get('/admin/unit-conversions', async (req, res) => {
    try {
      const tenantId = helpers.getTenantId(req);
      const showAll = String(req.query.all || "") === "1";
      const whereActive = showAll ? "" : "AND is_active=1";
      const [rows] = await db.query(
        `SELECT id, from_unit_id, to_unit_id, factor, is_active
         FROM prod_unit_conversions
         WHERE tenant_id=? ${whereActive}
         ORDER BY id ASC`,
        [tenantId]
      );
      res.json({ ok: true, data: rows });
    } catch (e) {
      console.error(e);
      res.status(500).json({ ok: false, error: 'DB_ERROR' });
    }
  });

  router.post('/admin/unit-conversions', async (req, res) => {
    try {
      const tenantId = helpers.getTenantId(req);
      const fromUnitId = helpers.numOrNull(req.body.from_unit_id);
      const toUnitId = helpers.numOrNull(req.body.to_unit_id);
      const factor = helpers.numOrNull(req.body.factor);
      if (!fromUnitId || !toUnitId || !factor) {
        return res.status(400).json({ ok: false, error: 'BAD_PARAMS' });
      }

      const [result] = await db.query(
        `INSERT INTO prod_unit_conversions
         (tenant_id, from_unit_id, to_unit_id, factor, is_active)
         VALUES (?, ?, ?, ?, 1)`,
        [tenantId, fromUnitId, toUnitId, factor]
      );
      res.json({ ok: true, id: result.insertId });
    } catch (e) {
      console.error(e);
      res.status(500).json({ ok: false, error: 'DB_ERROR' });
    }
  });

  router.put('/admin/unit-conversions/:id', async (req, res) => {
    try {
      const tenantId = helpers.getTenantId(req);
      const id = Number(req.params.id);
      if (!Number.isFinite(id) || id <= 0) {
        return res.status(400).json({ ok: false, error: 'BAD_ID' });
      }
      const fromUnitId = helpers.numOrNull(req.body.from_unit_id);
      const toUnitId = helpers.numOrNull(req.body.to_unit_id);
      const factor = helpers.numOrNull(req.body.factor);
      const isActive = helpers.toBool(req.body.is_active, true) ? 1 : 0;
      if (!fromUnitId || !toUnitId || !factor) {
        return res.status(400).json({ ok: false, error: 'BAD_PARAMS' });
      }

      await db.query(
        `UPDATE prod_unit_conversions
         SET from_unit_id=?, to_unit_id=?, factor=?, is_active=?
         WHERE tenant_id=? AND id=?`,
        [fromUnitId, toUnitId, factor, isActive, tenantId, id]
      );

      res.json({ ok: true });
    } catch (e) {
      console.error(e);
      res.status(500).json({ ok: false, error: 'DB_ERROR' });
    }
  });

  router.delete('/admin/unit-conversions/:id', async (req, res) => {
    try {
      const tenantId = helpers.getTenantId(req);
      const id = Number(req.params.id);
      if (!Number.isFinite(id) || id <= 0) {
        return res.status(400).json({ ok: false, error: 'BAD_ID' });
      }
      await db.query(
        `UPDATE prod_unit_conversions
         SET is_active=0
         WHERE tenant_id=? AND id=?`,
        [tenantId, id]
      );
      res.json({ ok: true });
    } catch (e) {
      console.error(e);
      res.status(500).json({ ok: false, error: 'DB_ERROR' });
    }
  });

  // ------------------------------
  // Product unit links: /api/admin/products/:id/unit-links
  // ------------------------------
  router.get('/admin/products/:id/unit-links', async (req, res) => {
    try {
      const tenantId = helpers.getTenantId(req);
      const productId = Number(req.params.id);
      if (!Number.isFinite(productId) || productId <= 0) {
        return res.status(400).json({ ok: false, error: 'BAD_ID' });
      }
      const [rows] = await db.query(
        `SELECT id, unit_id, base_unit_id, factor
         FROM prod_product_unit_links
         WHERE tenant_id=? AND product_id=?
         ORDER BY id ASC`,
        [tenantId, productId]
      );
      res.json({ ok: true, data: rows });
    } catch (e) {
      console.error(e);
      res.status(500).json({ ok: false, error: 'DB_ERROR' });
    }
  });

  router.post('/admin/products/:id/unit-links', async (req, res) => {
    try {
      const tenantId = helpers.getTenantId(req);
      const productId = Number(req.params.id);
      if (!Number.isFinite(productId) || productId <= 0) {
        return res.status(400).json({ ok: false, error: 'BAD_ID' });
      }
      const unitId = helpers.numOrNull(req.body.unit_id);
      const baseUnitId = helpers.numOrNull(req.body.base_unit_id);
      const factor = helpers.numOrNull(req.body.factor);
      if (!unitId || !baseUnitId || !factor) {
        return res.status(400).json({ ok: false, error: 'BAD_PARAMS' });
      }

      const [existing] = await db.query(
        `SELECT id FROM prod_product_unit_links
         WHERE tenant_id=? AND product_id=? AND unit_id=? AND base_unit_id=?`,
        [tenantId, productId, unitId, baseUnitId]
      );

      if (existing.length) {
        await db.query(
          `UPDATE prod_product_unit_links
           SET factor=?
           WHERE tenant_id=? AND id=?`,
          [factor, tenantId, existing[0].id]
        );
        return res.json({ ok: true, id: existing[0].id });
      }

      const [result] = await db.query(
        `INSERT INTO prod_product_unit_links
         (tenant_id, product_id, unit_id, base_unit_id, factor)
         VALUES (?, ?, ?, ?, ?)`,
        [tenantId, productId, unitId, baseUnitId, factor]
      );
      res.json({ ok: true, id: result.insertId });
    } catch (e) {
      console.error(e);
      res.status(500).json({ ok: false, error: 'DB_ERROR' });
    }
  });

  router.delete('/admin/products/:id/unit-links/:unitId', async (req, res) => {
    try {
      const tenantId = helpers.getTenantId(req);
      const productId = Number(req.params.id);
      const unitId = Number(req.params.unitId);
      if (!Number.isFinite(productId) || productId <= 0) {
        return res.status(400).json({ ok: false, error: 'BAD_ID' });
      }
      if (!Number.isFinite(unitId) || unitId <= 0) {
        return res.status(400).json({ ok: false, error: 'BAD_UNIT_ID' });
      }

      await db.query(
        `DELETE FROM prod_product_unit_links
         WHERE tenant_id=? AND product_id=? AND unit_id=?`,
        [tenantId, productId, unitId]
      );
      res.json({ ok: true });
    } catch (e) {
      console.error(e);
      res.status(500).json({ ok: false, error: 'DB_ERROR' });
    }
  });

  // ------------------------------
  // Product Ingredients: /api/admin/products/:id/ingredients
  // ------------------------------
  router.get('/admin/products/:id/ingredients', async (req, res) => {
    try {
      const tenantId = helpers.getTenantId(req);
      const productId = Number(req.params.id);
      if (!Number.isFinite(productId) || productId <= 0) {
        return res.status(400).json({ ok: false, error: 'BAD_ID' });
      }

      const [pcsRows] = await db.query(
        `SELECT id FROM prod_units WHERE tenant_id=? AND code='pcs' LIMIT 1`,
        [tenantId]
      );
      const pcsUnitId = pcsRows.length ? Number(pcsRows[0].id) : null;

      let recipeBaseUnitId = null;
      if (pcsUnitId) {
        const [recipeRows] = await db.query(
          `SELECT base_unit_id FROM prod_products WHERE tenant_id=? AND id=? LIMIT 1`,
          [tenantId, productId]
        );
        if (recipeRows.length && recipeRows[0].base_unit_id) {
          recipeBaseUnitId = Number(recipeRows[0].base_unit_id);
        }
      }

      const [rows] = await db.query(
        `SELECT 
           i.id,
           i.ingredient_id,
           i.quantity,
           i.unit_id,
           i.quantity_min,
           i.quantity_max,
           i.quantity_step,
           i.price_override,
           i.is_variable,
           i.sort_order,
           p.name AS ingredient_name,
           p.price AS ingredient_price,
           p.cost_price AS ingredient_cost_price,
           p.base_unit_id AS ingredient_base_unit_id,
           p.base_qty AS ingredient_base_qty,
           p.photos_json AS ingredient_photos,
           p.unit_id AS ingredient_unit_id,
           u.code AS unit_code,
           u.title AS unit_title,
           u.short_title AS unit_short_title,
           pul.factor AS ingredient_pcs_factor
         FROM prod_product_ingredients i
         JOIN prod_products p ON p.tenant_id=i.tenant_id AND p.id=i.ingredient_id
         JOIN prod_units u ON u.id=i.unit_id
         LEFT JOIN prod_product_unit_links pul
           ON pul.tenant_id=i.tenant_id
          AND pul.product_id=i.ingredient_id
          AND pul.unit_id=?
          AND (
            (p.base_unit_id = ? AND pul.base_unit_id = ?)
            OR
            (p.base_unit_id <> ? AND pul.base_unit_id = p.base_unit_id)
          )
         WHERE i.tenant_id=? AND i.product_id=?
         ORDER BY i.sort_order ASC, i.id ASC`,
        [pcsUnitId || 0, pcsUnitId || 0, recipeBaseUnitId || 0, pcsUnitId || 0, tenantId, productId]
      );

      for (const r of rows) {
        r.ingredient_photos = helpers.safeJsonArray(r.ingredient_photos);
      }

      res.json({ ok: true, data: rows });
    } catch (e) {
      console.error(e);
      res.status(500).json({ ok: false, error: 'DB_ERROR' });
    }
  });

  router.post('/admin/products/:id/ingredients', async (req, res) => {
    try {
      const tenantId = helpers.getTenantId(req);
      const productId = Number(req.params.id);
      if (!Number.isFinite(productId) || productId <= 0) {
        return res.status(400).json({ ok: false, error: 'BAD_ID' });
      }

      const ingredientId = Number(req.body.ingredient_id);
      if (!Number.isFinite(ingredientId) || ingredientId <= 0) {
        return res.status(400).json({ ok: false, error: 'BAD_INGREDIENT_ID' });
      }

      // Get unit_id from ingredient product if not provided
      let unitId = Number(req.body.unit_id);
      if (!Number.isFinite(unitId) || unitId <= 0) {
        const [ingredientRows] = await db.query(
          `SELECT unit_id FROM prod_products WHERE tenant_id=? AND id=?`,
          [tenantId, ingredientId]
        );
        if (ingredientRows.length && ingredientRows[0].unit_id) {
          unitId = Number(ingredientRows[0].unit_id);
        } else {
          return res.status(400).json({ ok: false, error: 'BAD_UNIT_ID' });
        }
      }

      const quantity = helpers.numOrNull(req.body.quantity) ?? 1;
      const quantityMin = helpers.numOrNull(req.body.quantity_min);
      const quantityMax = helpers.numOrNull(req.body.quantity_max);
      const quantityStep = helpers.numOrNull(req.body.quantity_step);
      const priceOverride = helpers.numOrNull(req.body.price_override);
      const isVariable = Number(req.body.is_variable) === 1 ? 1 : 0;
      const sortOrder = Number(req.body.sort_order) || 0;

      // Check if already exists
      const [existing] = await db.query(
        `SELECT id FROM prod_product_ingredients
         WHERE tenant_id=? AND product_id=? AND ingredient_id=?`,
        [tenantId, productId, ingredientId]
      );

      if (existing.length) {
        return res.status(400).json({ ok: false, error: 'ALREADY_EXISTS' });
      }

      const [result] = await db.query(
        `INSERT INTO prod_product_ingredients
         (tenant_id, product_id, ingredient_id, quantity, unit_id, quantity_min, quantity_max, quantity_step, price_override, is_variable, sort_order)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [tenantId, productId, ingredientId, quantity, unitId, quantityMin, quantityMax, quantityStep, priceOverride, isVariable, sortOrder]
      );

      res.json({ ok: true, id: result.insertId });
    } catch (e) {
      console.error(e);
      res.status(500).json({ ok: false, error: 'DB_ERROR' });
    }
  });

  router.put('/admin/products/:id/ingredients/:ingredientId', async (req, res) => {
    try {
      const tenantId = helpers.getTenantId(req);
      const productId = Number(req.params.id);
      const ingredientId = Number(req.params.ingredientId);
      if (!Number.isFinite(productId) || productId <= 0) {
        return res.status(400).json({ ok: false, error: 'BAD_ID' });
      }
      if (!Number.isFinite(ingredientId) || ingredientId <= 0) {
        return res.status(400).json({ ok: false, error: 'BAD_INGREDIENT_ID' });
      }

      const unitId = Number(req.body.unit_id);
      if (!Number.isFinite(unitId) || unitId <= 0) {
        return res.status(400).json({ ok: false, error: 'BAD_UNIT_ID' });
      }

      const quantity = helpers.numOrNull(req.body.quantity) ?? 1;
      const quantityMin = helpers.numOrNull(req.body.quantity_min);
      const quantityMax = helpers.numOrNull(req.body.quantity_max);
      const quantityStep = helpers.numOrNull(req.body.quantity_step);
      const priceOverride = helpers.numOrNull(req.body.price_override);
      const isVariable = Number(req.body.is_variable) === 1 ? 1 : 0;
      const sortOrder = Number(req.body.sort_order) || 0;

      await db.query(
        `UPDATE prod_product_ingredients
         SET quantity=?, unit_id=?, quantity_min=?, quantity_max=?, quantity_step=?, price_override=?, is_variable=?, sort_order=?
         WHERE tenant_id=? AND product_id=? AND ingredient_id=?`,
        [quantity, unitId, quantityMin, quantityMax, quantityStep, priceOverride, isVariable, sortOrder, tenantId, productId, ingredientId]
      );

      res.json({ ok: true });
    } catch (e) {
      console.error(e);
      res.status(500).json({ ok: false, error: 'DB_ERROR' });
    }
  });

  router.delete('/admin/products/:id/ingredients/:ingredientId', async (req, res) => {
    try {
      const tenantId = helpers.getTenantId(req);
      const productId = Number(req.params.id);
      const ingredientId = Number(req.params.ingredientId);
      if (!Number.isFinite(productId) || productId <= 0) {
        return res.status(400).json({ ok: false, error: 'BAD_ID' });
      }
      if (!Number.isFinite(ingredientId) || ingredientId <= 0) {
        return res.status(400).json({ ok: false, error: 'BAD_INGREDIENT_ID' });
      }

      await db.query(
        `DELETE FROM prod_product_ingredients
         WHERE tenant_id=? AND product_id=? AND ingredient_id=?`,
        [tenantId, productId, ingredientId]
      );

      res.json({ ok: true });
    } catch (e) {
      console.error(e);
      res.status(500).json({ ok: false, error: 'DB_ERROR' });
    }
  });

  return router;
};
