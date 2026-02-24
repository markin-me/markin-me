const fs = require("fs");
const path = require("path");
const sharp = require("sharp");

const SOURCE_JS = path.resolve(__dirname, "..", "static", "js", "shop-company-chat.js");
const OUT_DIR = path.resolve(__dirname, "..", "static", "assets", "emoji");
const OUT_WEBP = path.join(OUT_DIR, "apple-people-atlas.webp");
const OUT_MANIFEST = path.join(OUT_DIR, "apple-people-atlas.manifest.json");

const CDN_BASE = "https://cdn.jsdelivr.net/npm/emoji-datasource-apple@15.1.2/img/apple/64";
const CELL_SIZE = 64;
const COLUMNS = 16;
const WEBP_QUALITY = 100;

function readEmojiListFromSource(filePath) {
  const text = fs.readFileSync(filePath, "utf8");
  const peopleMatch = text.match(/const EMOJI_FALLBACK_CATEGORIES = \{[\s\S]*?people:\s*\[([\s\S]*?)\],\s*nature:/);
  if (!peopleMatch) {
    throw new Error("Cannot parse EMOJI_FALLBACK_CATEGORIES.people from source file.");
  }

  const raw = peopleMatch[1];
  const strRe = /"((?:\\.|[^"\\])*)"/g;
  const list = [];
  const decodeJsString = (token) => {
    const normalized = String(token || "").replace(/\\u\{([0-9a-fA-F]+)\}/g, (_, hex) => {
      const cp = Number.parseInt(hex, 16);
      return Number.isFinite(cp) ? String.fromCodePoint(cp) : "";
    });
    return JSON.parse(`"${normalized}"`);
  };
  let m;
  while ((m = strRe.exec(raw)) !== null) {
    const decoded = decodeJsString(m[1]);
    if (decoded) list.push(decoded);
  }
  if (!list.length) {
    throw new Error("Parsed emoji list is empty.");
  }
  return list;
}

function emojiToAssetCode(emoji) {
  return Array.from(String(emoji || ""))
    .map((char) => char.codePointAt(0))
    .filter((cp) => Number.isFinite(cp) && cp > 0)
    .map((cp) => cp.toString(16).toLowerCase())
    .join("-");
}

async function fetchBuffer(url) {
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) {
    throw new Error(`HTTP_${res.status}: ${url}`);
  }
  return Buffer.from(await res.arrayBuffer());
}

async function fetchEmojiPng(emoji) {
  const code = emojiToAssetCode(emoji);
  if (!code) throw new Error(`Empty code for emoji: ${emoji}`);

  const primaryUrl = `${CDN_BASE}/${code}.png`;
  try {
    return await fetchBuffer(primaryUrl);
  } catch (errPrimary) {
    const simplifiedCode = code.replace(/-fe0f/gi, "");
    if (!simplifiedCode || simplifiedCode === code) throw errPrimary;
    const fallbackUrl = `${CDN_BASE}/${simplifiedCode}.png`;
    return fetchBuffer(fallbackUrl);
  }
}

async function buildAtlas() {
  const list = readEmojiListFromSource(SOURCE_JS);
  const rows = Math.max(1, Math.ceil(list.length / COLUMNS));
  const width = COLUMNS * CELL_SIZE;
  const height = rows * CELL_SIZE;

  if (!fs.existsSync(OUT_DIR)) {
    fs.mkdirSync(OUT_DIR, { recursive: true });
  }

  const composites = [];
  for (let i = 0; i < list.length; i += 1) {
    const emoji = list[i];
    const png = await fetchEmojiPng(emoji);
    const icon = await sharp(png)
      .resize(CELL_SIZE, CELL_SIZE, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .png()
      .toBuffer();

    composites.push({
      input: icon,
      left: (i % COLUMNS) * CELL_SIZE,
      top: Math.floor(i / COLUMNS) * CELL_SIZE,
    });
  }

  await sharp({
    create: {
      width,
      height,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  })
    .composite(composites)
    .webp({ quality: WEBP_QUALITY, effort: 6, lossless: true, alphaQuality: 100 })
    .toFile(OUT_WEBP);

  const manifest = {
    generated_at: new Date().toISOString(),
    source: path.relative(path.resolve(__dirname, ".."), SOURCE_JS).replace(/\\/g, "/"),
    atlas: path.relative(path.resolve(__dirname, ".."), OUT_WEBP).replace(/\\/g, "/"),
    cell_size: CELL_SIZE,
    columns: COLUMNS,
    rows,
    total: list.length,
    emojis: list,
  };
  fs.writeFileSync(OUT_MANIFEST, JSON.stringify(manifest, null, 2), { encoding: "utf8" });

  console.log(`Emoji atlas generated: ${OUT_WEBP}`);
  console.log(`Manifest generated: ${OUT_MANIFEST}`);
  console.log(`Total emojis: ${list.length}, size: ${width}x${height}`);
}

buildAtlas().catch((err) => {
  console.error(err);
  process.exit(1);
});
