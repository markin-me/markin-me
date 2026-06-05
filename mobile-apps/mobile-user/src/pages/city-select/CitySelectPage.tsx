import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { Ionicons } from '@expo/vector-icons';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';

import type { RootStackParamList } from '../../app/navigation/routes';
import { routes } from '../../app/navigation/routes';
import { fetchTenantStores } from '../../shared/api';
import { theme } from '../../shared/config/theme';
import { Screen } from '../../shared/ui/Screen';
import { AppText as Text } from '../../shared/ui';

type CitySelectPageProps = NativeStackScreenProps<RootStackParamList, 'citySelect'>;

function normalizeCity(value: unknown) {
  return String(value || '').trim();
}

function buildCities(stores: Array<{ city?: string | null }>) {
  return Array.from(new Set(stores.map((store) => normalizeCity(store.city)).filter(Boolean))).sort((left, right) => (
    left.localeCompare(right, 'ru')
  ));
}

export function CitySelectPage({ navigation, route }: CitySelectPageProps) {
  const { addressId, returnTo, selectedCity } = route.params;
  const [cities, setCities] = useState<string[]>([]);
  const [isLoading, setLoading] = useState(true);
  const [errorText, setErrorText] = useState('');
  const activeCity = normalizeCity(selectedCity);

  const loadCities = useCallback(async () => {
    setLoading(true);
    setErrorText('');
    try {
      const stores = await fetchTenantStores();
      setCities(buildCities(stores));
    } catch (error) {
      setErrorText(error instanceof Error ? error.message : 'Не удалось загрузить города.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadCities();
  }, [loadCities]);

  const title = useMemo(() => (
    returnTo === 'addresses' ? 'Город самовывоза' : 'Город доставки'
  ), [returnTo]);

  const selectCity = useCallback((city: string) => {
    if (returnTo === 'addresses') {
      navigation.navigate(routes.addresses, { selectedCity: city });
      return;
    }
    navigation.navigate(routes.addressForm, {
      addressId,
      selectedCity: city,
    });
  }, [addressId, navigation, returnTo]);

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Text style={styles.title}>{title}</Text>

        {isLoading ? (
          <View style={styles.loading}>
            <ActivityIndicator color={theme.colors.accent} />
            <Text style={styles.loadingText}>Загружаем города</Text>
          </View>
        ) : null}

        {errorText ? <Text style={styles.errorText}>{errorText}</Text> : null}

        {!isLoading && !errorText && !cities.length ? (
          <Text style={styles.emptyText}>Города пока не настроены.</Text>
        ) : null}

        <View style={styles.list}>
          {cities.map((city) => {
            const selected = city === activeCity;
            return (
              <Pressable
                key={city}
                onPress={() => selectCity(city)}
                style={[styles.row, selected && styles.rowActive]}
              >
                <View style={[styles.icon, selected && styles.iconActive]}>
                  <Ionicons name="location-outline" color={selected ? theme.colors.primaryText : theme.colors.muted} size={18} />
                </View>
                <Text style={[styles.rowTitle, selected && styles.rowTitleActive]}>{city}</Text>
                {selected ? <Ionicons name="checkmark" color={theme.colors.accent} size={22} /> : null}
              </Pressable>
            );
          })}
        </View>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: {
    padding: theme.spacing.lg,
  },
  emptyText: {
    color: theme.colors.muted,
    fontSize: 15,
    fontWeight: '700',
    lineHeight: 22,
  },
  errorText: {
    color: theme.colors.danger,
    fontSize: 13,
    fontWeight: '800',
    lineHeight: 18,
    marginBottom: theme.spacing.md,
  },
  icon: {
    alignItems: 'center',
    backgroundColor: theme.colors.mutedBackground,
    borderRadius: theme.radius.pill,
    height: 36,
    justifyContent: 'center',
    width: 36,
  },
  iconActive: {
    backgroundColor: theme.colors.accent,
  },
  list: {
    gap: theme.spacing.sm,
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
  row: {
    alignItems: 'center',
    backgroundColor: theme.colors.surface,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    flexDirection: 'row',
    gap: theme.spacing.md,
    padding: theme.spacing.md,
  },
  rowActive: {
    borderColor: theme.colors.accent,
  },
  rowTitle: {
    color: theme.colors.text,
    flex: 1,
    fontSize: 16,
    fontWeight: '800',
  },
  rowTitleActive: {
    color: theme.colors.accent,
  },
  title: {
    color: theme.colors.text,
    fontSize: 24,
    fontWeight: '900',
    marginBottom: theme.spacing.lg,
  },
});
