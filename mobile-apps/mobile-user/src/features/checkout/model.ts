import AsyncStorage from '@react-native-async-storage/async-storage';

export type CheckoutPayload = {
  cartId: string;
};

export type FulfillmentMode = 'delivery' | 'pickup';

export type FulfillmentSelection = {
  mode: FulfillmentMode;
  addressId: number | null;
  pickupCity: string | null;
  pickupStoreId: number | null;
};

export type CheckoutCartSummary = {
  bonusAccrualAmount: number;
  bonusAccrualBlockedByRedeem: boolean;
  bonusRedeemAmount: number;
  deliveryCost: number;
  discountDetailItems?: Array<Record<string, unknown>>;
  discountAmount: number;
  itemDiscountAmount: number;
  itemsTotal: number;
  lineStates?: Array<Record<string, unknown>>;
  subtotalBeforeDiscount: number;
  total: number;
};

export type CheckoutDiscountSelection = {
  discountId: number | null;
  source: 'discount' | 'reward_discount' | null;
};

export type CheckoutBenefitsSelection = {
  discountId: number | null;
  discountSource: 'discount' | 'reward_discount' | null;
  promoCode: string;
  promoRewardId: number | null;
  promoSource: 'promo_code' | 'reward_promo' | null;
};

const FULFILLMENT_SELECTION_KEY = 'mobile_fulfillment_selection_v1';
const CHECKOUT_CART_SUMMARY_KEY = 'mobile_checkout_cart_summary_v1';
const CHECKOUT_PROMO_CODE_KEY = 'mobile_checkout_promo_code_v1';
const CHECKOUT_DISCOUNT_SELECTION_KEY = 'mobile_checkout_discount_selection_v1';
const CHECKOUT_BENEFITS_SELECTION_KEY = 'mobile_checkout_benefits_selection_v1';

const defaultFulfillmentSelection: FulfillmentSelection = {
  addressId: null,
  mode: 'delivery',
  pickupCity: null,
  pickupStoreId: null,
};

function normalizeFulfillmentSelection(value: unknown): FulfillmentSelection {
  const source = value && typeof value === 'object' ? value as Partial<FulfillmentSelection> : {};
  const mode = source.mode === 'pickup' ? 'pickup' : 'delivery';
  const addressId = Number(source.addressId || 0);
  const pickupCity = String(source.pickupCity || '').trim();
  const pickupStoreId = Number(source.pickupStoreId || 0);
  return {
    addressId: addressId > 0 ? addressId : null,
    mode,
    pickupCity: pickupCity || null,
    pickupStoreId: pickupStoreId > 0 ? pickupStoreId : null,
  };
}

function toMoney(value: unknown) {
  const numberValue = Number(value || 0);
  return Number.isFinite(numberValue) && numberValue > 0 ? numberValue : 0;
}

function normalizeCheckoutCartSummary(value: unknown): CheckoutCartSummary | null {
  if (!value || typeof value !== 'object') return null;
  const source = value as Partial<CheckoutCartSummary>;
  return {
    bonusAccrualAmount: toMoney(source.bonusAccrualAmount),
    bonusAccrualBlockedByRedeem: source.bonusAccrualBlockedByRedeem === true,
    bonusRedeemAmount: toMoney(source.bonusRedeemAmount),
    deliveryCost: toMoney(source.deliveryCost),
    discountDetailItems: Array.isArray(source.discountDetailItems) ? source.discountDetailItems : [],
    discountAmount: toMoney(source.discountAmount),
    itemDiscountAmount: toMoney(source.itemDiscountAmount),
    itemsTotal: toMoney(source.itemsTotal),
    lineStates: Array.isArray(source.lineStates) ? source.lineStates : [],
    subtotalBeforeDiscount: toMoney(source.subtotalBeforeDiscount),
    total: toMoney(source.total),
  };
}

function normalizeCheckoutDiscountSelection(value: unknown): CheckoutDiscountSelection {
  const source = value && typeof value === 'object' ? value as Partial<CheckoutDiscountSelection> : {};
  const discountId = Number(source.discountId || 0);
  const normalizedSource = source.source === 'reward_discount' ? 'reward_discount' : source.source === 'discount' ? 'discount' : null;
  return {
    discountId: discountId > 0 ? discountId : null,
    source: discountId > 0 ? normalizedSource || 'discount' : null,
  };
}

function normalizeCheckoutBenefitsSelection(value: unknown): CheckoutBenefitsSelection {
  const source = value && typeof value === 'object' ? value as Partial<CheckoutBenefitsSelection> : {};
  const discountId = Number(source.discountId || 0);
  const discountSource = source.discountSource === 'reward_discount'
    ? 'reward_discount'
    : source.discountSource === 'discount'
      ? 'discount'
      : null;
  const promoCode = String(source.promoCode || '').trim().toUpperCase();
  const promoRewardId = Number(source.promoRewardId || 0);
  const promoSource = source.promoSource === 'reward_promo'
    ? 'reward_promo'
    : source.promoSource === 'promo_code'
      ? 'promo_code'
      : null;

  return {
    discountId: discountId > 0 ? discountId : null,
    discountSource: discountId > 0 ? discountSource || 'discount' : null,
    promoCode,
    promoRewardId: promoRewardId > 0 ? promoRewardId : null,
    promoSource: promoCode || promoRewardId > 0 ? promoSource || 'promo_code' : null,
  };
}

async function writeCheckoutPromoCode(code: string) {
  const normalized = String(code || '').trim().toUpperCase();
  if (!normalized) {
    await AsyncStorage.removeItem(CHECKOUT_PROMO_CODE_KEY);
    return '';
  }
  await AsyncStorage.setItem(CHECKOUT_PROMO_CODE_KEY, normalized);
  return normalized;
}

async function writeCheckoutDiscountSelection(selection: CheckoutDiscountSelection) {
  const normalized = normalizeCheckoutDiscountSelection(selection);
  if (!normalized.discountId) {
    await AsyncStorage.removeItem(CHECKOUT_DISCOUNT_SELECTION_KEY);
    return normalized;
  }
  await AsyncStorage.setItem(CHECKOUT_DISCOUNT_SELECTION_KEY, JSON.stringify(normalized));
  return normalized;
}

async function writeCheckoutBenefitsSelection(selection: CheckoutBenefitsSelection) {
  const normalized = normalizeCheckoutBenefitsSelection(selection);
  const hasSelection = normalized.discountId || normalized.promoCode || normalized.promoRewardId;
  if (!hasSelection) {
    await AsyncStorage.removeItem(CHECKOUT_BENEFITS_SELECTION_KEY);
  } else {
    await AsyncStorage.setItem(CHECKOUT_BENEFITS_SELECTION_KEY, JSON.stringify(normalized));
  }
  await writeCheckoutPromoCode(normalized.promoCode);
  await writeCheckoutDiscountSelection({
    discountId: normalized.discountId,
    source: normalized.discountSource,
  });
  return normalized;
}

export async function readFulfillmentSelection() {
  try {
    const raw = await AsyncStorage.getItem(FULFILLMENT_SELECTION_KEY);
    return normalizeFulfillmentSelection(raw ? JSON.parse(raw) : defaultFulfillmentSelection);
  } catch {
    return defaultFulfillmentSelection;
  }
}

export async function saveFulfillmentSelection(selection: FulfillmentSelection) {
  const normalized = normalizeFulfillmentSelection(selection);
  await AsyncStorage.setItem(FULFILLMENT_SELECTION_KEY, JSON.stringify(normalized));
  return normalized;
}

export async function readCheckoutCartSummary() {
  try {
    const raw = await AsyncStorage.getItem(CHECKOUT_CART_SUMMARY_KEY);
    return normalizeCheckoutCartSummary(raw ? JSON.parse(raw) : null);
  } catch {
    return null;
  }
}

export async function saveCheckoutCartSummary(summary: CheckoutCartSummary) {
  const normalized = normalizeCheckoutCartSummary(summary);
  if (!normalized) return null;
  await AsyncStorage.setItem(CHECKOUT_CART_SUMMARY_KEY, JSON.stringify(normalized));
  return normalized;
}

export async function readCheckoutPromoCode() {
  try {
    const raw = await AsyncStorage.getItem(CHECKOUT_PROMO_CODE_KEY);
    return String(raw || '').trim().toUpperCase();
  } catch {
    return '';
  }
}

export async function saveCheckoutPromoCode(code: string) {
  const current = await readCheckoutBenefitsSelection();
  const normalized = normalizeCheckoutBenefitsSelection({
    ...current,
    promoCode: code,
    promoRewardId: null,
    promoSource: code ? 'promo_code' : null,
  });
  await writeCheckoutBenefitsSelection(normalized);
  return normalized.promoCode;
}

export async function readCheckoutDiscountSelection() {
  try {
    const raw = await AsyncStorage.getItem(CHECKOUT_DISCOUNT_SELECTION_KEY);
    return normalizeCheckoutDiscountSelection(raw ? JSON.parse(raw) : null);
  } catch {
    return normalizeCheckoutDiscountSelection(null);
  }
}

export async function saveCheckoutDiscountSelection(selection: CheckoutDiscountSelection) {
  const current = await readCheckoutBenefitsSelection();
  const normalizedDiscount = normalizeCheckoutDiscountSelection(selection);
  const normalized = normalizeCheckoutBenefitsSelection({
    ...current,
    discountId: normalizedDiscount.discountId,
    discountSource: normalizedDiscount.source,
  });
  await writeCheckoutBenefitsSelection(normalized);
  return {
    discountId: normalized.discountId,
    source: normalized.discountSource,
  };
}

export async function readCheckoutBenefitsSelection() {
  try {
    const raw = await AsyncStorage.getItem(CHECKOUT_BENEFITS_SELECTION_KEY);
    const fullSelection = normalizeCheckoutBenefitsSelection(raw ? JSON.parse(raw) : null);
    if (fullSelection.discountId || fullSelection.promoCode || fullSelection.promoRewardId) {
      return fullSelection;
    }
  } catch {
    // Legacy keys below keep the checkout state recoverable.
  }

  const [promoCode, discountSelection] = await Promise.all([
    readCheckoutPromoCode().catch(() => ''),
    readCheckoutDiscountSelection().catch(() => ({ discountId: null, source: null })),
  ]);
  return normalizeCheckoutBenefitsSelection({
    discountId: discountSelection.discountId,
    discountSource: discountSelection.source,
    promoCode,
    promoRewardId: null,
    promoSource: promoCode ? 'promo_code' : null,
  });
}

export async function saveCheckoutBenefitsSelection(selection: CheckoutBenefitsSelection) {
  return writeCheckoutBenefitsSelection(selection);
}
