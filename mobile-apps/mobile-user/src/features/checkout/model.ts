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

const FULFILLMENT_SELECTION_KEY = 'mobile_fulfillment_selection_v1';

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
