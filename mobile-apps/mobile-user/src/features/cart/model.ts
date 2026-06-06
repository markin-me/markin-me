import AsyncStorage from '@react-native-async-storage/async-storage';

export type CartLineType = 'product' | 'combo';

export type CartVariant = {
  groupId?: number | null;
  groupTitle?: string;
  label?: string;
  unit?: string;
  valueIndex?: number | null;
};

export type CartIngredient = {
  id?: number | null;
  name: string;
  quantity: number;
  unit?: string;
};

export type CartOptionItem = {
  id?: number | null;
  name: string;
  quantity: number;
  unitPrice?: number;
  variant?: CartVariant | null;
};

export type CartComboSelection = {
  productId?: number | null;
  productName: string;
  productPhoto?: string | null;
  ingredients?: CartIngredient[];
  unitPrice?: number;
  oldUnitPrice?: number;
  variant?: CartVariant | null;
};

export type CartLine = {
  comboDraft?: unknown;
  comboSelections?: CartComboSelection[];
  id: string;
  type: CartLineType;
  sourceId: number;
  title: string;
  photoUrl?: string | null;
  quantity: number;
  unitPrice: number;
  oldUnitPrice?: number;
  detailLines?: string[];
  isUnavailable?: boolean;
  ingredients?: CartIngredient[];
  options?: CartOptionItem[];
  variant?: CartVariant | null;
  photoUrls?: string[];
};

export type CartLineDraft = Omit<CartLine, 'id'> & { id?: string };

const CART_STORAGE_KEY = 'mobile_cart_v1';

function normalizeNumber(value: unknown, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function normalizeOptionalId(value: unknown) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : null;
}

function normalizeText(value: unknown) {
  return String(value || '').trim();
}

function normalizeVariant(value: unknown): CartVariant | null {
  const source = value && typeof value === 'object' ? value as Partial<CartVariant> : null;
  if (!source) return null;
  const label = normalizeText(source.label);
  const unit = normalizeText(source.unit);
  const groupTitle = normalizeText(source.groupTitle);
  const groupId = normalizeOptionalId(source.groupId);
  const valueIndex = source.valueIndex == null ? null : normalizeNumber(source.valueIndex, NaN);
  if (!label && !unit && !groupTitle && !groupId) return null;
  return {
    groupId,
    groupTitle,
    label,
    unit,
    valueIndex: Number.isFinite(Number(valueIndex)) ? Number(valueIndex) : null,
  };
}

function normalizeIngredients(value: unknown): CartIngredient[] {
  return Array.isArray(value)
    ? value.map((item): CartIngredient | null => {
      const source = item && typeof item === 'object' ? item as Partial<CartIngredient> : null;
      if (!source) return null;
      const name = normalizeText(source.name);
      const quantity = normalizeNumber(source.quantity, NaN);
      if (!name || !Number.isFinite(quantity) || quantity <= 0) return null;
      return {
        id: normalizeOptionalId(source.id),
        name,
        quantity,
        unit: normalizeText(source.unit),
      };
    }).filter((item): item is CartIngredient => !!item)
    : [];
}

function normalizeOptions(value: unknown): CartOptionItem[] {
  return Array.isArray(value)
    ? value.map((item): CartOptionItem | null => {
      const source = item && typeof item === 'object' ? item as Partial<CartOptionItem> : null;
      if (!source) return null;
      const name = normalizeText(source.name);
      const quantity = Math.max(1, normalizeNumber(source.quantity, 1));
      if (!name) return null;
      return {
        id: normalizeOptionalId(source.id),
        name,
        quantity,
        unitPrice: Math.max(0, normalizeNumber(source.unitPrice)),
        variant: normalizeVariant(source.variant),
      };
    }).filter((item): item is CartOptionItem => !!item)
    : [];
}

function normalizeComboSelections(value: unknown): CartComboSelection[] {
  return Array.isArray(value)
    ? value.map((item): CartComboSelection | null => {
      const source = item && typeof item === 'object' ? item as Partial<CartComboSelection> : null;
      if (!source) return null;
      const productName = normalizeText(source.productName);
      if (!productName) return null;
      return {
        ingredients: normalizeIngredients(source.ingredients),
        oldUnitPrice: Math.max(0, normalizeNumber(source.oldUnitPrice)),
        productId: normalizeOptionalId(source.productId),
        productName,
        productPhoto: source.productPhoto ? String(source.productPhoto) : null,
        unitPrice: Math.max(0, normalizeNumber(source.unitPrice)),
        variant: normalizeVariant(source.variant),
      };
    }).filter((item): item is CartComboSelection => !!item)
    : [];
}

function normalizeCartLine(value: unknown): CartLine | null {
  const source = value && typeof value === 'object' ? value as Partial<CartLine> : null;
  if (!source) return null;
  const id = String(source.id || '').trim();
  const title = String(source.title || '').trim();
  const sourceId = normalizeNumber(source.sourceId);
  const quantity = Math.max(1, Math.round(normalizeNumber(source.quantity, 1)));
  const unitPrice = Math.max(0, normalizeNumber(source.unitPrice));
  if (!id || !title || !(sourceId > 0)) return null;

  return {
    comboDraft: source.comboDraft && typeof source.comboDraft === 'object' ? source.comboDraft : null,
    comboSelections: normalizeComboSelections(source.comboSelections),
    detailLines: Array.isArray(source.detailLines)
      ? source.detailLines.map((line) => String(line || '').trim()).filter(Boolean)
      : [],
    id,
    isUnavailable: source.isUnavailable === true,
    ingredients: normalizeIngredients(source.ingredients),
    oldUnitPrice: Math.max(0, normalizeNumber(source.oldUnitPrice)),
    options: normalizeOptions(source.options),
    photoUrl: source.photoUrl ? String(source.photoUrl) : null,
    photoUrls: Array.isArray(source.photoUrls)
      ? source.photoUrls.map((url) => String(url || '').trim()).filter(Boolean).slice(0, 4)
      : [],
    quantity,
    sourceId,
    title,
    type: source.type === 'combo' ? 'combo' : 'product',
    unitPrice,
    variant: normalizeVariant(source.variant),
  };
}

function normalizeCartLines(value: unknown): CartLine[] {
  return Array.isArray(value)
    ? value.map(normalizeCartLine).filter((line): line is CartLine => !!line)
    : [];
}

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.entries(value as Record<string, unknown>)
      .filter(([, entry]) => entry !== undefined && entry !== null && entry !== '')
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => `${JSON.stringify(key)}:${stableStringify(entry)}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}

export function makeCartLineId(line: Pick<CartLineDraft, 'comboDraft' | 'comboSelections' | 'ingredients' | 'options' | 'sourceId' | 'type' | 'variant'>) {
  const sourceId = normalizeNumber(line.sourceId);
  const ingredients = normalizeIngredients(line.ingredients)
    .map((item) => ({ id: item.id || null, name: item.name, quantity: item.quantity, unit: item.unit || '' }))
    .sort((left, right) => (left.id || 0) - (right.id || 0) || left.name.localeCompare(right.name));
  const options = normalizeOptions(line.options)
    .map((item) => ({
      id: item.id || null,
      name: item.name,
      quantity: item.quantity,
      variant: normalizeVariant(item.variant),
    }))
    .sort((left, right) => (left.id || 0) - (right.id || 0) || left.name.localeCompare(right.name));
  return [
    line.type === 'combo' ? 'combo' : 'product',
    sourceId,
    stableStringify(normalizeVariant(line.variant) || {}),
    stableStringify(ingredients),
    stableStringify(options),
    line.type === 'combo' ? stableStringify(normalizeComboSelections(line.comboSelections)) : '',
    line.type === 'combo' ? stableStringify(line.comboDraft || {}) : '',
  ].join(':');
}

export async function readCartLines() {
  try {
    const raw = await AsyncStorage.getItem(CART_STORAGE_KEY);
    return normalizeCartLines(raw ? JSON.parse(raw) : []);
  } catch {
    return [];
  }
}

export async function saveCartLines(lines: CartLine[]) {
  const normalized = normalizeCartLines(lines);
  await AsyncStorage.setItem(CART_STORAGE_KEY, JSON.stringify(normalized));
  return normalized;
}

export async function addCartLine(line: CartLineDraft) {
  const normalizedLine = normalizeCartLine({
    ...line,
    id: line.id || makeCartLineId(line),
  });
  if (!normalizedLine) return readCartLines();

  const lines = await readCartLines();
  const index = lines.findIndex((item) => item.id === normalizedLine.id);
  if (index >= 0) {
    lines[index] = {
      ...lines[index],
      ...normalizedLine,
      quantity: lines[index].quantity + normalizedLine.quantity,
    };
  } else {
    lines.push(normalizedLine);
  }
  return saveCartLines(lines);
}

export async function saveCartLine(line: CartLineDraft, replaceLineId?: string | null) {
  const nextId = line.id || makeCartLineId(line);
  const normalizedLine = normalizeCartLine({ ...line, id: nextId });
  if (!normalizedLine) return readCartLines();

  const lines = await readCartLines();
  const replaceId = String(replaceLineId || '').trim();
  const sameIndex = lines.findIndex((item) => item.id === normalizedLine.id);

  if (sameIndex >= 0) {
    lines[sameIndex] = {
      ...lines[sameIndex],
      ...normalizedLine,
      quantity: replaceId && replaceId !== normalizedLine.id
        ? lines[sameIndex].quantity + normalizedLine.quantity
        : normalizedLine.quantity,
    };
    return saveCartLines(replaceId && replaceId !== normalizedLine.id
      ? lines.filter((item) => item.id !== replaceId)
      : lines);
  }

  const replaceIndex = replaceId ? lines.findIndex((item) => item.id === replaceId) : -1;
  if (replaceIndex >= 0) {
    lines[replaceIndex] = normalizedLine;
  } else {
    lines.push(normalizedLine);
  }
  return saveCartLines(lines);
}

export async function updateCartLineQuantity(lineId: string, quantity: number) {
  const lines = await readCartLines();
  const nextQuantity = Math.max(0, Math.round(normalizeNumber(quantity)));
  const nextLines = nextQuantity > 0
    ? lines.map((line) => line.id === lineId ? { ...line, quantity: nextQuantity } : line)
    : lines.filter((line) => line.id !== lineId);
  return saveCartLines(nextLines);
}

export async function removeCartLine(lineId: string) {
  const lines = await readCartLines();
  return saveCartLines(lines.filter((line) => line.id !== lineId));
}

export async function clearCartLines() {
  await AsyncStorage.removeItem(CART_STORAGE_KEY);
  return [];
}

function formatQuantity(value: number) {
  if (Number.isInteger(value)) return String(value);
  return String(Number(value.toFixed(3))).replace('.', ',');
}

function mergeVariantUnit(labelRaw: unknown, unitRaw: unknown) {
  const label = normalizeText(labelRaw);
  const unit = normalizeText(unitRaw);
  if (!label) return unit;
  if (!unit) return label;
  if (label.toLowerCase().endsWith(` ${unit.toLowerCase()}`) || label.toLowerCase() === unit.toLowerCase()) return label;
  return `${label} ${unit}`.trim();
}

function extractVariantValue(labelRaw: unknown, groupTitleRaw: unknown) {
  const label = normalizeText(labelRaw);
  const groupTitle = normalizeText(groupTitleRaw);
  if (!label) return '';
  let value = label;
  if (groupTitle) value = value.replace(new RegExp(`^${groupTitle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*:\\s*`, 'i'), '').trim();
  if (value.includes(':')) {
    const right = value.split(':').slice(1).join(':').trim();
    if (right) value = right;
  }
  return value;
}

export function formatCartVariantLine(variant?: CartVariant | null) {
  if (!variant) return '';
  const value = extractVariantValue(variant.label, variant.groupTitle);
  const line = mergeVariantUnit(value, variant.unit);
  const normalized = normalizeText(line);
  const lower = normalized.toLowerCase();
  if (!normalized || lower === 'не указано' || lower === 'не указано:') return '';
  return normalized;
}

export function formatCartIngredientLine(ingredient: CartIngredient) {
  const quantity = Number(ingredient.quantity);
  if (!Number.isFinite(quantity) || quantity <= 0) return '';
  return [formatQuantity(quantity), normalizeText(ingredient.unit), normalizeText(ingredient.name)].filter(Boolean).join(' ').trim();
}

export function formatCartOptionLine(option: CartOptionItem) {
  const name = normalizeText(option.name);
  if (!name) return '';
  const variantLine = formatCartVariantLine(option.variant);
  if (variantLine) return `${variantLine} ${name}`.trim();
  return `${formatQuantity(Math.max(1, Number(option.quantity || 1)))} ${name}`.trim();
}
