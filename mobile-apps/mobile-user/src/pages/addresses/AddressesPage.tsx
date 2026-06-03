import { useCallback, useEffect, useMemo, useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import type { RootStackParamList } from '../../app/navigation/routes';
import { routes } from '../../app/navigation/routes';
import {
  deleteCustomerAddress,
  fetchCustomerAddresses,
  fetchTenantStores,
  readCachedCustomerPassport,
  saveCustomerPassport,
  setDefaultCustomerAddress,
  type CustomerAddress,
  type CustomerPassport,
  type TenantStore,
} from '../../shared/api';
import { theme } from '../../shared/config/theme';
import { Screen } from '../../shared/ui/Screen';
import {
  readFulfillmentSelection,
  saveFulfillmentSelection,
  type FulfillmentMode,
  type FulfillmentSelection,
} from '../../features/checkout';

type AddressesNavigation = NativeStackNavigationProp<RootStackParamList>;

function toPositiveId(value: unknown) {
  const id = Number(value || 0);
  return Number.isFinite(id) && id > 0 ? id : null;
}

function isDefaultAddress(address: CustomerAddress) {
  return address.is_default === true || address.is_default === 1 || address.is_default === '1';
}

function formatAddressLine(address: CustomerAddress) {
  const normalized = String(address.address_normalized_display || '').trim();
  if (normalized) return normalized;
  return [address.city, address.street, address.house]
    .map((item) => String(item || '').trim())
    .filter(Boolean)
    .join(', ');
}

function formatStorePhone(value: unknown) {
  const raw = String(value || '').trim();
  const digits = raw.replace(/\D/g, '');
  if (digits.length === 11 && digits.startsWith('7')) {
    return `+7 ${digits.slice(1, 4)} ${digits.slice(4, 7)}-${digits.slice(7, 9)}-${digits.slice(9, 11)}`;
  }
  return raw;
}

function formatStoreHours(store: TenantStore) {
  const hours = Array.isArray(store.storeHours) ? store.storeHours : [];
  if (!hours.length) return '';
  const today = new Date().getDay();
  const dayOfWeek = today === 0 ? 7 : today;
  const row = hours.find((item) => Number(item.day_of_week || 0) === dayOfWeek);
  if (!row || row.is_closed === true || row.is_closed === 1) return '';
  const opens = String(row.opens_at || '').slice(0, 5);
  const closes = String(row.closes_at || '').slice(0, 5);
  return opens && closes ? `${opens} - ${closes}` : '';
}

function getInitialSelection(selection: FulfillmentSelection, addresses: CustomerAddress[], stores: TenantStore[]) {
  const addressId = selection.addressId
    || toPositiveId(addresses.find(isDefaultAddress)?.id)
    || toPositiveId(addresses[0]?.id);
  const pickupStoreId = selection.pickupStoreId || toPositiveId(stores[0]?.id);
  return {
    addressId,
    mode: selection.mode,
    pickupStoreId,
  };
}

export function AddressesPage() {
  const navigation = useNavigation<AddressesNavigation>();
  const [passport, setPassport] = useState<CustomerPassport | null>(null);
  const [addresses, setAddresses] = useState<CustomerAddress[]>([]);
  const [stores, setStores] = useState<TenantStore[]>([]);
  const [selection, setSelection] = useState<FulfillmentSelection>({
    addressId: null,
    mode: 'delivery',
    pickupStoreId: null,
  });
  const [isLoading, setLoading] = useState(true);
  const [isSaving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [errorText, setErrorText] = useState('');

  const loadData = useCallback(async () => {
    setLoading(true);
    setErrorText('');
    try {
      const cached = await readCachedCustomerPassport();
      setPassport(cached);
      const [storedSelection, nextStores, nextAddresses] = await Promise.all([
        readFulfillmentSelection(),
        fetchTenantStores(),
        cached?.token ? fetchCustomerAddresses(cached.token) : Promise.resolve([]),
      ]);
      setStores(nextStores);
      setAddresses(nextAddresses);
      setSelection(getInitialSelection(storedSelection, nextAddresses, nextStores));
    } catch (error) {
      setErrorText(error instanceof Error ? error.message : 'Не удалось загрузить адреса.');
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void loadData();
    }, [loadData]),
  );

  useEffect(() => {
    if (!message) return undefined;
    const timer = setTimeout(() => setMessage(''), 2500);
    return () => clearTimeout(timer);
  }, [message]);

  const cities = useMemo(
    () => Array.from(new Set(stores.map((store) => String(store.city || '').trim()).filter(Boolean))).sort(),
    [stores],
  );

  const confirmSelection = useCallback(async () => {
    setSaving(true);
    setErrorText('');
    try {
      if (selection.mode === 'delivery') {
        if (!selection.addressId) {
          setErrorText('Выберите адрес доставки.');
          return;
        }
        if (!passport?.token) {
          setErrorText('Войдите в профиль, чтобы выбрать адрес.');
          return;
        }
        await setDefaultCustomerAddress(passport.token, selection.addressId);
        const nextAddresses = await fetchCustomerAddresses(passport.token);
        setAddresses(nextAddresses);
        const nextPassport = { ...passport, addresses: nextAddresses, updatedAt: new Date().toISOString() };
        setPassport(nextPassport);
        await saveCustomerPassport(nextPassport);
        await saveFulfillmentSelection({ addressId: selection.addressId, mode: 'delivery', pickupStoreId: null });
        setMessage('Адрес выбран.');
        return;
      }

      if (!selection.pickupStoreId) {
        setErrorText('Выберите филиал самовывоза.');
        return;
      }
      await saveFulfillmentSelection({ addressId: null, mode: 'pickup', pickupStoreId: selection.pickupStoreId });
      setMessage('Филиал выбран.');
    } catch (error) {
      setErrorText(error instanceof Error ? error.message : 'Не удалось сохранить выбор.');
    } finally {
      setSaving(false);
    }
  }, [passport, selection]);

  const openAddressForm = useCallback((addressId?: number) => {
    navigation.navigate(routes.addressForm, addressId ? { addressId } : undefined);
  }, [navigation]);

  const removeAddress = useCallback(async (address: CustomerAddress) => {
    const addressId = toPositiveId(address.id);
    if (!addressId || !passport?.token) return;
    setSaving(true);
    setErrorText('');
    try {
      await deleteCustomerAddress(passport.token, addressId);
      const nextAddresses = await fetchCustomerAddresses(passport.token);
      setAddresses(nextAddresses);
      const nextSelection = getInitialSelection(selection, nextAddresses, stores);
      setSelection(nextSelection);
      const nextPassport = { ...passport, addresses: nextAddresses, updatedAt: new Date().toISOString() };
      setPassport(nextPassport);
      await saveCustomerPassport(nextPassport);
      setMessage('Адрес удалён.');
    } catch (error) {
      setErrorText(error instanceof Error ? error.message : 'Не удалось удалить адрес.');
    } finally {
      setSaving(false);
    }
  }, [passport, selection, stores]);

  const renderDelivery = () => {
    if (!passport?.token) {
      return <Text style={styles.emptyText}>Войдите в профиль, чтобы видеть сохранённые адреса.</Text>;
    }
    if (!addresses.length) {
      return <Text style={styles.emptyText}>Адресов пока нет.</Text>;
    }
    return addresses.map((address) => {
      const id = toPositiveId(address.id);
      const selected = id != null && id === selection.addressId;
      return (
        <Pressable
          key={String(address.id)}
          onPress={() => id && setSelection((current) => ({ ...current, addressId: id, mode: 'delivery' }))}
          style={styles.row}
        >
          <View style={[styles.radio, selected && styles.radioActive]}>
            {selected ? <View style={styles.radioDot} /> : null}
          </View>
          <View style={styles.rowBody}>
            <Text style={styles.rowTitle}>{formatAddressLine(address) || 'Адрес'}</Text>
            {address.comment ? <Text style={styles.rowSubtitle}>{String(address.comment)}</Text> : null}
          </View>
          <View style={styles.rowActions}>
            <Pressable
              hitSlop={8}
              onPress={(event) => {
                event.stopPropagation();
                if (id) openAddressForm(id);
              }}
              style={styles.actionButton}
            >
              <Ionicons name="pencil" color={theme.colors.text} size={19} />
            </Pressable>
            <Pressable
              hitSlop={8}
              onPress={(event) => {
                event.stopPropagation();
                void removeAddress(address);
              }}
              style={styles.actionButton}
            >
              <Ionicons name="trash-outline" color={theme.colors.danger} size={20} />
            </Pressable>
          </View>
        </Pressable>
      );
    });
  };

  const renderPickup = () => {
    if (!stores.length) {
      return <Text style={styles.emptyText}>Нет доступных филиалов.</Text>;
    }
    return stores.map((store) => {
      const id = toPositiveId(store.id);
      const selected = id != null && id === selection.pickupStoreId;
      const hours = formatStoreHours(store);
      const isOpen = store.isOpen === true;
      return (
        <Pressable
          key={String(store.id)}
          onPress={() => id && setSelection((current) => ({ ...current, mode: 'pickup', pickupStoreId: id }))}
          style={styles.row}
        >
          <View style={[styles.radio, selected && styles.radioActive]}>
            {selected ? <View style={styles.radioDot} /> : null}
          </View>
          <View style={styles.rowBody}>
            {store.city ? <Text style={styles.storeCity}>{String(store.city)}</Text> : null}
            <Text style={styles.rowTitle}>{String(store.address || store.name || `Филиал #${store.id}`)}</Text>
            <Text style={[styles.pickupStatus, isOpen ? styles.pickupStatusOpen : styles.pickupStatusClosed]}>
              {isOpen ? 'Открыто' : 'Закрыто'}
            </Text>
            {hours ? (
              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>Время работы</Text>
                <Text style={styles.infoValue}>{hours}</Text>
              </View>
            ) : null}
            {store.phone ? (
              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>Телефон</Text>
                <Text style={[styles.infoValue, styles.phoneValue]}>{formatStorePhone(store.phone)}</Text>
              </View>
            ) : null}
          </View>
        </Pressable>
      );
    });
  };

  return (
    <Screen>
      <View style={styles.root}>
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          <View style={styles.toggle}>
            {(['delivery', 'pickup'] as FulfillmentMode[]).map((mode) => {
              const active = selection.mode === mode;
              return (
                <Pressable
                  key={mode}
                  onPress={() => setSelection((current) => ({ ...current, mode }))}
                  style={[styles.toggleButton, active && styles.toggleButtonActive]}
                >
                  <Text style={[styles.toggleText, active && styles.toggleTextActive]}>
                    {mode === 'delivery' ? 'Доставка' : 'Самовывоз'}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          {selection.mode === 'delivery' ? (
            <View style={styles.sectionHeader}>
              <Text style={styles.title}>Мои адреса</Text>
              <Pressable onPress={() => openAddressForm()} style={styles.smallButton}>
                <Text style={styles.smallButtonText}>+ Новый адрес</Text>
              </Pressable>
            </View>
          ) : (
            <View style={styles.sectionHeader}>
              <Text style={styles.title}>Филиалы</Text>
              <Pressable onPress={() => setMessage('Выбор города сделаем отдельной страницей.')} style={styles.smallButton}>
                <Text style={styles.smallButtonText}>{cities.length ? 'Все города' : 'Города'}</Text>
                <Ionicons name="chevron-down" color={theme.colors.muted} size={16} />
              </Pressable>
            </View>
          )}

          {message ? <Text style={styles.messageText}>{message}</Text> : null}
          {errorText ? <Text style={styles.errorText}>{errorText}</Text> : null}

          {isLoading ? (
            <View style={styles.loading}>
              <ActivityIndicator color={theme.colors.accent} />
              <Text style={styles.loadingText}>Загружаем адреса</Text>
            </View>
          ) : (
            <View style={styles.list}>
              {selection.mode === 'delivery' ? renderDelivery() : renderPickup()}
            </View>
          )}
        </ScrollView>

        <View style={styles.footer}>
          <Pressable
            disabled={isSaving || isLoading}
            onPress={confirmSelection}
            style={[styles.confirmButton, (isSaving || isLoading) && styles.confirmButtonDisabled]}
          >
            <Text style={styles.confirmButtonText}>
              {isSaving ? 'Сохраняем...' : selection.mode === 'delivery' ? 'Доставить сюда' : 'Заказать здесь'}
            </Text>
          </Pressable>
        </View>
      </View>
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
    paddingBottom: 118,
  },
  toggle: {
    alignSelf: 'center',
    backgroundColor: theme.colors.border,
    borderRadius: theme.radius.pill,
    flexDirection: 'row',
    marginBottom: theme.spacing.lg,
    padding: 4,
    width: '78%',
  },
  toggleButton: {
    alignItems: 'center',
    borderRadius: theme.radius.pill,
    flex: 1,
    height: 42,
    justifyContent: 'center',
  },
  toggleButtonActive: {
    backgroundColor: theme.colors.accent,
    shadowColor: theme.colors.accent,
    shadowOffset: { height: 5, width: 0 },
    shadowOpacity: 0.24,
    shadowRadius: 10,
  },
  toggleText: {
    color: theme.colors.muted,
    fontSize: 14,
    fontWeight: '800',
  },
  toggleTextActive: {
    color: theme.colors.primaryText,
  },
  sectionHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: theme.spacing.md,
  },
  title: {
    color: theme.colors.text,
    fontSize: 22,
    fontWeight: '900',
  },
  smallButton: {
    alignItems: 'center',
    backgroundColor: theme.colors.surface,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.pill,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 4,
    minHeight: 36,
    paddingHorizontal: theme.spacing.md,
  },
  smallButtonText: {
    color: theme.colors.text,
    fontSize: 13,
    fontWeight: '800',
  },
  list: {
    backgroundColor: theme.colors.surface,
    borderRadius: 18,
    overflow: 'hidden',
  },
  row: {
    alignItems: 'center',
    borderBottomColor: theme.colors.border,
    borderBottomWidth: 1,
    flexDirection: 'row',
    gap: theme.spacing.md,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.lg,
  },
  radio: {
    alignItems: 'center',
    borderColor: theme.colors.border,
    borderRadius: 999,
    borderWidth: 2,
    height: 22,
    justifyContent: 'center',
    width: 22,
  },
  radioActive: {
    borderColor: theme.colors.accent,
  },
  radioDot: {
    backgroundColor: theme.colors.accent,
    borderRadius: 999,
    height: 12,
    width: 12,
  },
  rowBody: {
    flex: 1,
  },
  rowActions: {
    flexDirection: 'row',
    gap: theme.spacing.sm,
  },
  actionButton: {
    alignItems: 'center',
    backgroundColor: theme.colors.mutedBackground,
    borderRadius: theme.radius.pill,
    height: 38,
    justifyContent: 'center',
    width: 38,
  },
  rowTitle: {
    color: theme.colors.text,
    fontSize: 15,
    fontWeight: '900',
    lineHeight: 20,
  },
  rowSubtitle: {
    color: theme.colors.muted,
    fontSize: 13,
    fontWeight: '600',
    lineHeight: 18,
    marginTop: 4,
  },
  storeCity: {
    color: theme.colors.muted,
    fontSize: 13,
    marginBottom: 4,
  },
  pickupStatus: {
    fontSize: 13,
    fontWeight: '900',
    marginTop: 6,
  },
  pickupStatusOpen: {
    color: theme.colors.accent,
  },
  pickupStatusClosed: {
    color: theme.colors.muted,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: theme.spacing.sm,
  },
  infoLabel: {
    color: theme.colors.muted,
    fontSize: 13,
  },
  infoValue: {
    color: theme.colors.text,
    fontSize: 13,
    fontWeight: '700',
  },
  phoneValue: {
    color: theme.colors.accent,
  },
  emptyText: {
    color: theme.colors.muted,
    fontSize: 15,
    fontWeight: '700',
    lineHeight: 22,
    padding: theme.spacing.lg,
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
  messageText: {
    color: theme.colors.accent,
    fontSize: 13,
    fontWeight: '800',
    marginBottom: theme.spacing.sm,
  },
  errorText: {
    color: theme.colors.danger,
    fontSize: 13,
    fontWeight: '800',
    marginBottom: theme.spacing.sm,
  },
  footer: {
    backgroundColor: theme.colors.surface,
    borderTopColor: theme.colors.border,
    borderTopWidth: 1,
    bottom: 0,
    left: 0,
    paddingBottom: theme.spacing.lg,
    paddingHorizontal: theme.spacing.lg,
    paddingTop: theme.spacing.md,
    position: 'absolute',
    right: 0,
  },
  confirmButton: {
    alignItems: 'center',
    backgroundColor: theme.colors.accent,
    borderRadius: theme.radius.pill,
    height: 52,
    justifyContent: 'center',
  },
  confirmButtonDisabled: {
    opacity: 0.62,
  },
  confirmButtonText: {
    color: theme.colors.primaryText,
    fontSize: 16,
    fontWeight: '900',
  },
});
