import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation,
  useRoute,
  type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { TextInput as NativeTextInput } from 'react-native';
import {
  ActivityIndicator,
  Keyboard,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';

import type { RootStackParamList } from '../../app/navigation/routes';
import { routes } from '../../app/navigation/routes';
import {
  createCustomerAddress,
  fetchCustomerAddresses,
  fetchPublicOrderConfig,
  readCachedCustomerPassport,
  readCachedPublicOrderConfig,
  resolvePublicAddress,
  saveCustomerPassport,
  suggestPublicAddresses,
  updateCustomerAddress,
  type AddressSuggestion,
  type CustomerAddress,
  type CustomerAddressPayload,
  type CustomerPassport,
  type ResolvedAddress,
} from '../../shared/api';
import { theme } from '../../shared/config/theme';
import { Screen } from '../../shared/ui/Screen';
import { saveFulfillmentSelection } from '../../features/checkout';

import { AppText as Text, AppTextInput as TextInput } from '../../shared/ui';
type AddressFormRoute = RouteProp<RootStackParamList, 'addressForm'>;
type AddressFormNavigation = NativeStackNavigationProp<RootStackParamList>;

function asString(value: unknown) {
  return String(value || '').trim();
}

function asNumberOrNull(value: unknown) {
  if (value == null || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function isMapEnabled(value: unknown) {
  if (value === true) return true;
  if (typeof value === 'number') return Number.isFinite(value) && value !== 0;
  const text = asString(value).toLowerCase();
  return text === '1' || text === 'true' || text === 'yes' || text === 'on';
}

function buildAddressLookupDisplay(address: Partial<CustomerAddressPayload>) {
  const normalized = asString(address.address_normalized_display);
  if (normalized) return normalized;
  const base = [address.street, address.house].map(asString).filter(Boolean).join(', ');
  const city = asString(address.city);
  const locality = asString(address.address_context_locality);
  if (!base) return '';
  if (!locality || locality.toLowerCase() === city.toLowerCase()) return base;
  if (base.toLowerCase().startsWith(locality.toLowerCase())) return base;
  return `${locality}, ${base}`;
}

function parseLookupStreetHouse(value: string) {
  const text = value.replace(/\s+/g, ' ').replace(/\s*,\s*/g, ', ').replace(/,+$/g, '').trim();
  if (!text) return { house: '', street: '' };
  const commaIndex = text.lastIndexOf(',');
  if (commaIndex >= 0) {
    const street = text.slice(0, commaIndex).trim();
    const house = text.slice(commaIndex + 1).trim();
    if (street && house) return { house, street };
  }
  const match = text.match(/^(.*?)[\s,]+(\d[\dA-Za-zА-Яа-яЁё/-]*)$/);
  if (!match) return { house: '', street: '' };
  return { house: match[2].trim(), street: match[1].trim() };
}

function getSuggestionTitle(item: AddressSuggestion) {
  return buildAddressLookupDisplay({
    address_context_locality: asString(item.context_locality || item.city_name),
    address_normalized_display: asString(item.full_address || item.value || item.label),
    city: asString(item.city_name),
    house: asString(item.house_number),
    street: asString(item.street_name || item.value || item.label),
  }) || asString(item.full_address || item.value || item.label);
}

function getSuggestionType(item: AddressSuggestion) {
  return asString(item.object_type || item.selected_object_type || item.stage).toLowerCase();
}

function getSuggestionStreet(item: AddressSuggestion) {
  return asString(item.street_name || item.value || item.label);
}

function getSuggestionHouse(item: AddressSuggestion) {
  return asString(item.house_number);
}

function normalizeAddressKey(value: string) {
  return value.replace(/\s+/g, ' ').replace(/[,\s]+$/g, '').trim().toLowerCase();
}

function getLookupHousePart(value: string, selectedStreet: AddressSuggestion | null) {
  if (!selectedStreet) return '';
  const streetValue = getSuggestionStreet(selectedStreet);
  if (!streetValue) return '';
  const lookupKey = normalizeAddressKey(value);
  const streetKey = normalizeAddressKey(streetValue);
  const streetIndex = lookupKey.lastIndexOf(streetKey);
  if (streetIndex < 0) return '';
  return value.slice(streetIndex + streetValue.length).replace(/^[,\s]+/, '').trim();
}

function makePayloadFromResolved(
  base: CustomerAddressPayload,
  resolved: ResolvedAddress | null,
): CustomerAddressPayload {
  const source = resolved || base;
  return {
    address_context_locality: asString(source.address_context_locality || source.context_locality) || null,
    address_normalized_display: asString(source.address_normalized_display) || buildAddressLookupDisplay(source) || null,
    address_ref: asString(source.address_ref) || null,
    apartment: asString(base.apartment) || null,
    city: asString(source.city || base.city) || null,
    comment: asString(base.comment) || null,
    delivery_store_id: asNumberOrNull(source.delivery_store_id),
    delivery_zone_id: asNumberOrNull(source.delivery_zone_id),
    entrance: asString(base.entrance) || null,
    floor: asString(base.floor) || null,
    house: asString(source.house || base.house) || null,
    lat: asNumberOrNull(source.lat),
    lng: asNumberOrNull(source.lng),
    resolved_city_source_key: asString(source.resolved_city_source_key) || null,
    selected_object_type: asString(source.selected_object_type) || null,
    street: asString(source.street || base.street) || null,
  };
}

function findAddress(addresses: CustomerAddress[], addressId?: number) {
  const id = Number(addressId || 0);
  if (!(id > 0)) return null;
  return addresses.find((item) => Number(item.id || 0) === id) || null;
}

function isDefaultAddress(address: CustomerAddress) {
  return address.is_default === true || address.is_default === 1 || address.is_default === '1';
}

function toPositiveId(value: unknown) {
  const id = Number(value || 0);
  return Number.isFinite(id) && id > 0 ? id : null;
}

export function AddressFormPage() {
  const navigation = useNavigation<AddressFormNavigation>();
  const route = useRoute<AddressFormRoute>();
  const editingAddressId = Number(route.params?.addressId || 0) || null;
  const lookupInputRef = useRef<NativeTextInput | null>(null);

  const [passport, setPassport] = useState<CustomerPassport | null>(null);
  const [isLoading, setLoading] = useState(true);
  const [isSaving, setSaving] = useState(false);
  const [mapModeEnabled, setMapModeEnabled] = useState(false);
  const [suggestions, setSuggestions] = useState<AddressSuggestion[]>([]);
  const [isSuggesting, setSuggesting] = useState(false);
  const [isLookupFocused, setLookupFocused] = useState(false);
  const [selectedStreet, setSelectedStreet] = useState<AddressSuggestion | null>(null);
  const [errorText, setErrorText] = useState('');

  const [city, setCity] = useState('');
  const [lookup, setLookup] = useState('');
  const [street, setStreet] = useState('');
  const [house, setHouse] = useState('');
  const [entrance, setEntrance] = useState('');
  const [floor, setFloor] = useState('');
  const [apartment, setApartment] = useState('');
  const [comment, setComment] = useState('');
  const [resolvedPayload, setResolvedPayload] = useState<CustomerAddressPayload | null>(null);

  const title = editingAddressId ? 'Редактировать адрес' : 'Новый адрес';

  const hydrateForm = useCallback((address: CustomerAddress | null) => {
    setCity(asString(address?.city));
    setStreet(asString(address?.street));
    setHouse(asString(address?.house));
    setEntrance(asString(address?.entrance));
    setFloor(asString(address?.floor));
    setApartment(asString(address?.apartment));
    setComment(asString(address?.comment));
    setLookup(address ? buildAddressLookupDisplay(address) : '');
    setResolvedPayload(address ? makePayloadFromResolved(address, address as ResolvedAddress) : null);
    setSelectedStreet(address?.street ? {
      city_name: asString(address.city),
      context_locality: asString(address.address_context_locality),
      object_type: 'street',
      source_key: asString(address.address_ref),
      street_name: asString(address.street),
    } : null);
  }, []);

  const loadData = useCallback(async () => {
    setErrorText('');
    try {
      const [cached, orderConfig] = await Promise.all([
        readCachedCustomerPassport(),
        readCachedPublicOrderConfig(),
      ]);
      setPassport(cached);
      setMapModeEnabled(isMapEnabled(orderConfig?.storeAddressMapEnabled));
      const address = findAddress(cached?.addresses || [], editingAddressId || undefined);
      hydrateForm(address);
      setLoading(false);
      const freshOrderConfig = await fetchPublicOrderConfig().catch(() => orderConfig);
      setMapModeEnabled(isMapEnabled(freshOrderConfig?.storeAddressMapEnabled));
    } catch (error) {
      setErrorText(error instanceof Error ? error.message : 'Не удалось загрузить адрес.');
    } finally {
      setLoading(false);
    }
  }, [editingAddressId, hydrateForm]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  useEffect(() => {
    const selectedCity = asString(route.params?.selectedCity);
    if (!selectedCity || selectedCity === city) return;
    setCity(selectedCity);
    setLookup('');
    setStreet('');
    setHouse('');
    setResolvedPayload(null);
    setSelectedStreet(null);
    setSuggestions([]);
  }, [city, route.params?.selectedCity]);

  useEffect(() => {
    if (!mapModeEnabled || isLoading || !isLookupFocused) {
      setSuggestions([]);
      return undefined;
    }
    const query = lookup.trim();
    const housePart = getLookupHousePart(query, selectedStreet);
    const useHouseStage = !!(selectedStreet?.source_key && housePart);
    const apiQuery = useHouseStage ? housePart : query;
    if (!city.trim() || apiQuery.length < 1 || (!useHouseStage && apiQuery.length < 2)) {
      setSuggestions([]);
      return undefined;
    }

    const timer = setTimeout(async () => {
      setSuggesting(true);
      try {
        const items = await suggestPublicAddresses({
          city,
          query: apiQuery,
          selectedSourceKey: useHouseStage ? selectedStreet.source_key : null,
          stage: useHouseStage ? 'house' : 'address',
        });
        setSuggestions(items);
      } catch {
        setSuggestions([]);
      } finally {
        setSuggesting(false);
      }
    }, 220);

    return () => clearTimeout(timer);
  }, [city, isLoading, isLookupFocused, lookup, mapModeEnabled, selectedStreet]);

  const canSave = useMemo(() => {
    if (isSaving || isLoading) return false;
    if (!city.trim()) return false;
    if (mapModeEnabled) {
      const parsed = parseLookupStreetHouse(lookup);
      return !!(resolvedPayload?.street || parsed.street) && !!(resolvedPayload?.house || parsed.house);
    }
    return !!street.trim() && !!house.trim();
  }, [city, house, isLoading, isSaving, lookup, mapModeEnabled, resolvedPayload, street]);
  const canApplyManualLookup = useMemo(() => {
    const parsed = parseLookupStreetHouse(lookup);
    return !!parsed.street && !!parsed.house;
  }, [lookup]);

  const applySuggestion = useCallback(async (item: AddressSuggestion) => {
    const itemType = getSuggestionType(item);
    if (itemType === 'street' || (!getSuggestionHouse(item) && asString(item.source_key))) {
      const streetValue = getSuggestionStreet(item);
      if (!streetValue) return;
      const display = `${streetValue}, `;
      setSelectedStreet(item);
      setStreet(streetValue);
      setHouse('');
      setLookup(display);
      setResolvedPayload({
        address_context_locality: asString(item.context_locality || item.city_name) || null,
        address_normalized_display: display.trim(),
        address_ref: asString(item.source_key) || null,
        city,
        house: null,
        selected_object_type: 'street',
        street: streetValue,
      });
      setSuggestions([]);
      setLookupFocused(true);
      setTimeout(() => lookupInputRef.current?.focus(), 0);
      return;
    }

    const suggestedStreet = getSuggestionStreet(item) || (selectedStreet ? getSuggestionStreet(selectedStreet) : '');
    const suggestedHouse = getSuggestionHouse(item);
    const display = suggestedStreet && suggestedHouse
      ? [suggestedStreet, suggestedHouse].join(', ')
      : getSuggestionTitle(item);
    setLookup(display);
    setSuggestions([]);
    setLookupFocused(false);
    Keyboard.dismiss();
    try {
      const resolved = await resolvePublicAddress({
        address_context_locality: asString(item.context_locality || item.city_name) || null,
        address_normalized_display: asString(item.full_address || item.value || item.label || display) || null,
        address_ref: asString(item.source_key) || null,
        city,
        house: suggestedHouse,
        lat: asNumberOrNull(item.lat),
        lng: asNumberOrNull(item.lng),
        selected_object_type: asString(item.object_type || item.selected_object_type || 'address') || null,
        street: suggestedStreet,
      });
      const payload = makePayloadFromResolved({
        apartment,
        comment,
        entrance,
        floor,
      }, resolved);
      setResolvedPayload(payload);
      setCity(asString(payload.city) || city);
      setStreet(asString(payload.street));
      setHouse(asString(payload.house));
      setSelectedStreet(payload.street ? {
        city_name: asString(payload.city),
        context_locality: asString(payload.address_context_locality),
        object_type: 'street',
        source_key: asString(payload.address_ref),
        street_name: asString(payload.street),
      } : null);
      setLookup(buildAddressLookupDisplay(payload));
    } catch (error) {
      setErrorText(error instanceof Error ? error.message : 'Не удалось получить адрес.');
    }
  }, [apartment, city, comment, entrance, floor, selectedStreet]);

  const applyManualLookup = useCallback(() => {
    const parsed = parseLookupStreetHouse(lookup);
    if (!parsed.street || !parsed.house) {
      setErrorText('Укажите улицу и номер дома.');
      return;
    }
    setStreet(parsed.street);
    setHouse(parsed.house);
    setResolvedPayload(null);
    setSelectedStreet(null);
    setSuggestions([]);
    setLookupFocused(false);
    Keyboard.dismiss();
  }, [lookup]);

  const openCitySelect = useCallback(() => {
    navigation.navigate('citySelect', {
      addressId: editingAddressId || undefined,
      returnTo: 'addressForm',
      selectedCity: city || undefined,
    });
  }, [city, editingAddressId, navigation]);

  const buildSavePayload = useCallback(async () => {
    const base: CustomerAddressPayload = {
      apartment,
      city,
      comment,
      entrance,
      floor,
      house,
      street,
    };

    if (!mapModeEnabled) return makePayloadFromResolved(base, null);

    const parsed = parseLookupStreetHouse(lookup);
    const nextBase: CustomerAddressPayload = {
      ...base,
      ...resolvedPayload,
      address_normalized_display: lookup,
      house: resolvedPayload?.house || parsed.house,
      street: resolvedPayload?.street || parsed.street,
    };

    if (!asString(nextBase.street) || !asString(nextBase.house)) {
      throw new Error('Укажите улицу и номер дома.');
    }

    const hasResolvedAddress = !!(
      nextBase.address_ref ||
      nextBase.lat != null ||
      nextBase.lng != null ||
      nextBase.delivery_zone_id
    );
    if (hasResolvedAddress) return makePayloadFromResolved(base, nextBase as ResolvedAddress);

    const resolved = await resolvePublicAddress(nextBase);
    return makePayloadFromResolved(base, resolved);
  }, [apartment, city, comment, entrance, floor, house, lookup, mapModeEnabled, resolvedPayload, street]);

  const saveAddress = useCallback(async () => {
    if (!passport?.token) {
      setErrorText('Войдите в профиль, чтобы сохранить адрес.');
      return;
    }
    setSaving(true);
    setErrorText('');
    try {
      const payload = await buildSavePayload();
      if (!payload.city) throw new Error('Укажите город.');
      if (!payload.street) throw new Error('Укажите улицу.');
      if (!payload.house) throw new Error('Укажите дом.');

      if (editingAddressId) {
        await updateCustomerAddress(passport.token, editingAddressId, payload);
      } else {
        await createCustomerAddress(passport.token, { ...payload, is_default: 1 });
      }

      const nextAddresses = await fetchCustomerAddresses(passport.token);
      const nextPassport = { ...passport, addresses: nextAddresses, updatedAt: new Date().toISOString() };
      await saveCustomerPassport(nextPassport);
      if (!editingAddressId) {
        const createdAddress = nextAddresses.find(isDefaultAddress) || nextAddresses[nextAddresses.length - 1] || null;
        const createdAddressId = toPositiveId(createdAddress?.id);
        if (createdAddressId) {
          await saveFulfillmentSelection({
            addressId: createdAddressId,
            mode: 'delivery',
            pickupCity: null,
            pickupStoreId: null,
          });
        }
        navigation.pop(2);
        return;
      }
      navigation.goBack();
    } catch (error) {
      setErrorText(error instanceof Error ? error.message : 'Не удалось сохранить адрес.');
    } finally {
      setSaving(false);
    }
  }, [buildSavePayload, editingAddressId, navigation, passport]);

  return (
    <Screen>
      <Pressable
        style={styles.root}
        onPress={() => {
          setLookupFocused(false);
          Keyboard.dismiss();
        }}
      >
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <Text style={styles.title}>{title}</Text>

          {isLoading ? (
            <View style={styles.loading}>
              <ActivityIndicator color={theme.colors.accent} />
              <Text style={styles.loadingText}>Загружаем адрес</Text>
            </View>
          ) : (
            <>
              <Pressable onPress={openCitySelect} style={[styles.cityButton, styles.field]}>
                <Text style={[styles.cityButtonText, !city && styles.cityButtonPlaceholder]}>
                  {city || '\u0413\u043e\u0440\u043e\u0434'}
                </Text>
                <Ionicons name="chevron-forward" color={theme.colors.muted} size={18} />
              </Pressable>

              {mapModeEnabled ? (
                <View style={styles.lookupBlock}>
                  <TextInput
                    onChangeText={(value) => {
                      setLookup(value);
                      const selectedStreetValue = selectedStreet ? getSuggestionStreet(selectedStreet) : '';
                      if (selectedStreetValue && !normalizeAddressKey(value).includes(normalizeAddressKey(selectedStreetValue))) {
                        setSelectedStreet(null);
                        setStreet('');
                      }
                      if (house) {
                        setHouse('');
                      }
                      setResolvedPayload(null);
                    }}
                    onBlur={() => {
                      setTimeout(() => setLookupFocused(false), 120);
                    }}
                    onFocus={() => setLookupFocused(true)}
                    placeholder="Адрес"
                    placeholderTextColor={theme.colors.muted}
                    ref={lookupInputRef}
                    style={styles.input}
                    value={lookup}
                  />
                  {isLookupFocused && isSuggesting ? <Text style={styles.hintText}>{"\u0418\u0449\u0435\u043c \u0430\u0434\u0440\u0435\u0441..."}</Text> : null}
                  {isLookupFocused && suggestions.length ? (
                    <View style={styles.suggestions}>
                      {suggestions.slice(0, 8).map((item, index) => (
                        <Pressable
                          key={`${asString(item.source_key || item.full_address || item.value)}-${index}`}
                          onPress={() => applySuggestion(item)}
                          style={styles.suggestionRow}
                        >
                          <Ionicons name="location-outline" color={theme.colors.accent} size={18} />
                          <Text style={styles.suggestionText}>{getSuggestionTitle(item)}</Text>
                        </Pressable>
                      ))}
                    </View>
                  ) : null}
                  {isLookupFocused && !isSuggesting && canApplyManualLookup && !suggestions.length ? (
                    <Pressable onPress={applyManualLookup} style={styles.manualSuggestion}>
                      <Ionicons name="create-outline" color={theme.colors.accent} size={18} />
                      <Text style={styles.suggestionText}>{"\u0421\u043e\u0445\u0440\u0430\u043d\u0438\u0442\u044c \u043a\u0430\u043a \u0440\u0443\u0447\u043d\u043e\u0439 \u0432\u0432\u043e\u0434"}</Text>
                    </Pressable>
                  ) : null}
                </View>
              ) : (
                <View style={styles.rowInputs}>
                  <TextInput
                    onChangeText={setStreet}
                    placeholder="Улица"
                    placeholderTextColor={theme.colors.muted}
                    style={[styles.input, styles.rowInputWide]}
                    value={street}
                  />
                  <TextInput
                    onChangeText={setHouse}
                    placeholder="Дом"
                    placeholderTextColor={theme.colors.muted}
                    style={[styles.input, styles.rowInput]}
                    value={house}
                  />
                </View>
              )}

              <View style={styles.rowInputs}>
                <TextInput
                  onChangeText={setEntrance}
                  placeholder="Подъезд"
                  placeholderTextColor={theme.colors.muted}
                  style={[styles.input, styles.rowInput]}
                  value={entrance}
                />
                <TextInput
                  onChangeText={setFloor}
                  placeholder="Этаж"
                  placeholderTextColor={theme.colors.muted}
                  style={[styles.input, styles.rowInput]}
                  value={floor}
                />
                <TextInput
                  onChangeText={setApartment}
                  placeholder="Квартира"
                  placeholderTextColor={theme.colors.muted}
                  style={[styles.input, styles.rowInput]}
                  value={apartment}
                />
              </View>

              <TextInput
                onChangeText={setComment}
                placeholder="Комментарий курьеру"
                placeholderTextColor={theme.colors.muted}
                style={styles.input}
                value={comment}
              />

              {errorText ? <Text style={styles.errorText}>{errorText}</Text> : null}
            </>
          )}
        </ScrollView>

        <View style={styles.footer}>
          <Pressable
            disabled={!canSave}
            onPress={saveAddress}
            style={[styles.saveButton, !canSave && styles.saveButtonDisabled]}
          >
            <Text style={styles.saveButtonText}>{isSaving ? 'Сохраняем...' : 'Сохранить'}</Text>
          </Pressable>
          <Pressable disabled={isSaving} onPress={() => navigation.goBack()} style={styles.cancelButton}>
            <Text style={styles.cancelButtonText}>Отмена</Text>
          </Pressable>
        </View>
      </Pressable>
    </Screen>
  );
}

const styles = StyleSheet.create({
  root: {
    backgroundColor: theme.colors.mutedBackground,
    flex: 1,
  },
  content: {
    padding: theme.spacing.lg,
    paddingBottom: 116,
  },
  title: {
    color: theme.colors.text,
    fontSize: 24,
    fontWeight: '900',
    marginBottom: theme.spacing.lg,
  },
  loading: {
    alignItems: 'center',
    gap: theme.spacing.sm,
    padding: theme.spacing.xl,
  },
  loadingText: {
    color: theme.colors.muted,
    fontSize: 14,
    fontWeight: '700',
  },
  input: {
    backgroundColor: theme.colors.surface,
    borderColor: theme.colors.border,
    borderRadius: 18,
    borderWidth: 1,
    color: theme.colors.text,
    fontSize: 16,
    fontWeight: '700',
    minHeight: 56,
    paddingHorizontal: theme.spacing.lg,
  },
  cityButton: {
    alignItems: 'center',
    backgroundColor: theme.colors.surface,
    borderColor: theme.colors.border,
    borderRadius: 18,
    borderWidth: 1,
    flexDirection: 'row',
    gap: theme.spacing.sm,
    minHeight: 56,
    paddingHorizontal: theme.spacing.lg,
  },
  cityButtonPlaceholder: {
    color: theme.colors.muted,
  },
  cityButtonText: {
    color: theme.colors.text,
    flex: 1,
    fontSize: 16,
    fontWeight: '700',
  },
  field: {
    marginBottom: theme.spacing.md,
  },
  lookupBlock: {
    marginBottom: theme.spacing.md,
    position: 'relative',
    zIndex: 20,
  },
  rowInputs: {
    flexDirection: 'row',
    gap: theme.spacing.sm,
    marginBottom: theme.spacing.md,
  },
  rowInput: {
    flex: 1,
  },
  rowInputWide: {
    flex: 2,
  },
  suggestions: {
    backgroundColor: theme.colors.surface,
    borderColor: theme.colors.border,
    borderRadius: 18,
    borderWidth: 1,
    elevation: 12,
    left: 0,
    maxHeight: 320,
    overflow: 'hidden',
    position: 'absolute',
    right: 0,
    top: 64,
    zIndex: 30,
  },
  manualSuggestion: {
    alignItems: 'center',
    backgroundColor: theme.colors.surface,
    borderColor: theme.colors.border,
    borderRadius: 18,
    borderWidth: 1,
    elevation: 12,
    flexDirection: 'row',
    gap: theme.spacing.sm,
    left: 0,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.md,
    position: 'absolute',
    right: 0,
    top: 64,
    zIndex: 30,
  },
  suggestionRow: {
    alignItems: 'center',
    borderBottomColor: theme.colors.border,
    borderBottomWidth: 1,
    flexDirection: 'row',
    gap: theme.spacing.sm,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.md,
  },
  suggestionText: {
    color: theme.colors.text,
    flex: 1,
    fontSize: 14,
    fontWeight: '700',
    lineHeight: 19,
  },
  hintText: {
    color: theme.colors.muted,
    fontSize: 13,
    fontWeight: '700',
    left: theme.spacing.lg,
    position: 'absolute',
    top: 64,
    zIndex: 31,
  },
  errorText: {
    color: theme.colors.danger,
    fontSize: 13,
    fontWeight: '800',
    lineHeight: 18,
    marginTop: theme.spacing.sm,
  },
  footer: {
    backgroundColor: theme.colors.surface,
    borderTopColor: theme.colors.border,
    borderTopWidth: 1,
    bottom: 0,
    flexDirection: 'row',
    gap: theme.spacing.sm,
    left: 0,
    paddingBottom: theme.spacing.lg,
    paddingHorizontal: theme.spacing.lg,
    paddingTop: theme.spacing.md,
    position: 'absolute',
    right: 0,
  },
  saveButton: {
    alignItems: 'center',
    backgroundColor: theme.colors.accent,
    borderRadius: theme.radius.pill,
    flex: 1.25,
    height: 52,
    justifyContent: 'center',
  },
  saveButtonDisabled: {
    opacity: 0.58,
  },
  saveButtonText: {
    color: theme.colors.primaryText,
    fontSize: 16,
    fontWeight: '900',
  },
  cancelButton: {
    alignItems: 'center',
    backgroundColor: theme.colors.surface,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.pill,
    borderWidth: 1,
    flex: 0.85,
    height: 52,
    justifyContent: 'center',
  },
  cancelButtonText: {
    color: theme.colors.text,
    fontSize: 16,
    fontWeight: '900',
  },
});
