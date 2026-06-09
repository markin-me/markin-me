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

const FULFILLMENT_SELECTION_KEY = 'mobile_fulfillment_selection_v1';
const CHECKOUT_CART_SUMMARY_KEY = 'mobile_checkout_cart_summary_v1';
const CHECKOUT_PROMO_CODE_KEY = 'mobile_checkout_promo_code_v1';

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
  const normalized = String(code || '').trim().toUpperCase();
  if (!normalized) {
    await AsyncStorage.removeItem(CHECKOUT_PROMO_CODE_KEY);
    return '';
  }
  await AsyncStorage.setItem(CHECKOUT_PROMO_CODE_KEY, normalized);
  return normalized;
}
