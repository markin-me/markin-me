import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect, useNavigation, useRoute } from '@react-navigation/native';
import type { RouteProp } from '@react-navigation/native';
import type { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';

import type { ChatTabParamList, MainTabParamList, RootStackParamList } from '../../app/navigation/routes';
import { routes } from '../../app/navigation/routes';
import { useChatUnread } from '../../features/chat';
import { claimImportantMessagePromo, fetchImportantMessages, resolveChatAssetUrl } from '../../features/chat/api';
import { getImportantMessageActionType } from '../../features/chat/helpers';
import type { ImportantMessage } from '../../features/chat/types';
import { refreshCheckoutBenefitsState } from '../../features/checkout';
import type { CatalogProduct } from '../../entities/product';
import {
  getCatalogSnapshotProduct,
  getMemoryCustomerPassport,
  readCachedCustomerPassport,
  readCachedMobileCatalogSnapshot,
  resolveAssetUrl,
  subscribeCustomerPassport,
} from '../../shared/api';
import { theme } from '../../shared/config/theme';
import { getBuyXGetYBadgeText as getBuyXGetYBadgeTextFromRule } from '../../shared/lib/buyXGetY';
import { Screen } from '../../shared/ui/Screen';
import { ProductCatalogCard } from '../../shared/ui';
import { AppHeader } from '../../widgets/app-header';

type DetailsRoute = RouteProp<ChatTabParamList, typeof routes.importantMessageDetails>;
type MainNavigationProp = BottomTabNavigationProp<MainTabParamList>;
type RootNavigationProp = NativeStackNavigationProp<RootStackParamList>;
type PromoProductCard = CatalogProduct | NonNullable<ImportantMessage['products']>[number];

function getPromoProductIds(item: ImportantMessage | null) {
  return Array.from(new Set((Array.isArray(item?.product_ids) ? item.product_ids : [])
    .map((value) => Number(value || 0))
    .filter((value) => Number.isFinite(value) && value > 0)));
}

function findSnapshotProduct(snapshot: Awaited<ReturnType<typeof readCachedMobileCatalogSnapshot>> | null, productId: number) {
  if (!(productId > 0)) return null;
  const lists = Object.values(snapshot?.productsByCategory || {});
  for (const list of lists) {
    const product = (Array.isArray(list) ? list : []).find((entry) => Number(entry?.id || 0) === productId);
    if (product) return product;
  }
  return null;
}

function getProductPrice(product: PromoProductCard) {
  const source = product as PromoProductCard & { display_price?: number | null; discounted_price?: number | null };
  const value = Number(source.display_price ?? source.discounted_price ?? source.price ?? 0);
  return Number.isFinite(value) ? value : 0;
}

function getProductImage(product: PromoProductCard) {
  const source = product as PromoProductCard & { photos?: string[]; photo_thumb?: string | null };
  return resolveAssetUrl(source.photos?.[0] || source.photo_thumb || '');
}

function getProductTitle(product: PromoProductCard, productId: number) {
  const source = product as PromoProductCard & { name?: string; title?: string };
  return String(source.name || source.title || `Товар #${productId}`);
}

function getProductOldPrice(product: PromoProductCard) {
  const source = product as PromoProductCard & { old_price?: number | null; original_price?: number | null };
  const value = Number(source.old_price ?? source.original_price ?? 0);
  return Number.isFinite(value) ? value : 0;
}

function getProductDiscountText(product: PromoProductCard, price = getProductPrice(product), oldPrice = getProductOldPrice(product)) {
  const source = product as PromoProductCard & {
    discount?: { discount_type?: string; discount_value?: number | string | null } | null;
  };
  const discountValue = Number(source.discount?.discount_value || 0);
  if (source.discount?.discount_type === 'percent' && discountValue > 0) return `-${Math.round(discountValue)}%`;
  if (oldPrice > price && price >= 0) return `-${Math.round(((oldPrice - price) / oldPrice) * 100)}%`;
  return '';
}

function getProductDefaultLines(product: PromoProductCard) {
  const source = product as PromoProductCard & {
    catalog_default_lines?: string[];
    description_short?: string | null;
    description?: string | null;
  };
  const lines = Array.isArray(source.catalog_default_lines)
    ? source.catalog_default_lines.map((line) => String(line || '').trim()).filter(Boolean)
    : [];
  if (lines.length) return lines.slice(0, 2);
  return String(source.description_short || source.description || '').trim()
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, 2);
}

function getProductPromoBadgeText(product: PromoProductCard) {
  const source = product as PromoProductCard & { buy_x_get_y_badge?: CatalogProduct['buy_x_get_y_badge'] };
  return getBuyXGetYBadgeTextFromRule(source.buy_x_get_y_badge);
}

function isPromoProductConfigurable(product: PromoProductCard) {
  const source = product as CatalogProduct & {
    hasConfigurable?: boolean;
    preview?: { hasConfigurable?: boolean } | null;
  };
  const blocksConfig = source.blocks_config && typeof source.blocks_config === 'object' ? source.blocks_config : null;
  return Boolean(
    source.hasConfigurable ||
      source.preview?.hasConfigurable ||
      blocksConfig?.variants ||
      blocksConfig?.options ||
      blocksConfig?.ingredients ||
      (Array.isArray(source.variants) && source.variants.length > 0) ||
      (Array.isArray(source.options) && source.options.length > 0) ||
      (Array.isArray(source.ingredients) && source.ingredients.length > 0),
  );
}

export function ImportantMessageDetailsPage() {
  const navigation = useNavigation<NativeStackNavigationProp<ChatTabParamList>>();
  const route = useRoute<DetailsRoute>();
  const { markPromoRead } = useChatUnread();
  const pendingClaimRef = useRef(false);
  const claimingRef = useRef(false);
  const routeItem = route.params?.item || null;
  const routeItemId = Number(route.params?.itemId || routeItem?.id || 0);
  const [loadedItem, setLoadedItem] = useState<ImportantMessage | null>(routeItem);
  const [loading, setLoading] = useState(!routeItem && routeItemId > 0);
  const [error, setError] = useState('');
  const [claiming, setClaiming] = useState(false);
  const [customerToken, setCustomerToken] = useState(() => String(getMemoryCustomerPassport()?.token || '').trim());
  const item = loadedItem;
  const imageUrl = item ? resolveChatAssetUrl(item.image_url || '') : '';
  const actionType = getImportantMessageActionType(item);
  const productId = actionType === 'product' ? Number(item?.product_id || 0) : 0;
  const collectionProductIds = actionType === 'product_collection' ? getPromoProductIds(item) : [];
  const [collectionProducts, setCollectionProducts] = useState<PromoProductCard[]>([]);
  const hasPromo = actionType === 'promo_code' && item
    ? (item.promo_claimable === true || !!String(item.promo_code || '').trim() || item.promo_code_masked === true)
    : false;
  const promoCode = item ? (item.promo_code_masked ? '*****' : String(item.promo_code || '').trim()) : '';
  const claimText = item?.promo_claimed ? 'Забрано' : claiming ? '...' : item?.promo_claimable === false ? 'Закончились' : 'Забрать';
  const linkUrl = item ? String(item.link_url || '').trim() : '';
  const scrollY = useRef(new Animated.Value(0)).current;
  const imageTranslateY = useMemo(() => Animated.multiply(scrollY, 4 / 5), [scrollY]);
  const mainNavigation = navigation.getParent<MainNavigationProp>();
  const rootNavigation = mainNavigation?.getParent<RootNavigationProp>();

  const refreshCustomerToken = useCallback(async () => {
    const passport = await readCachedCustomerPassport().catch(() => null);
    const nextToken = String(passport?.token || '').trim();
    setCustomerToken(nextToken);
    return nextToken;
  }, []);

  useEffect(() => {
    if (item) void markPromoRead(item);
  }, [item, markPromoRead]);

  useEffect(() => {
    let cancelled = false;
    if (routeItem) {
      setLoadedItem(routeItem);
      setLoading(false);
      setError('');
      return () => {
        cancelled = true;
      };
    }
    if (!(routeItemId > 0)) {
      setLoadedItem(null);
      setLoading(false);
      setError('NOT_FOUND');
      return () => {
        cancelled = true;
      };
    }
    setLoadedItem(null);
    setLoading(true);
    setError('');
    void fetchImportantMessages()
      .then((items) => {
        if (cancelled) return;
        const nextItem = Array.isArray(items)
          ? items.find((entry) => Number(entry?.id || 0) === routeItemId) || null
          : null;
        setLoadedItem(nextItem);
        setError(nextItem ? '' : 'NOT_FOUND');
      })
      .catch(() => {
        if (!cancelled) setError('LOAD_FAILED');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [routeItem, routeItemId]);

  const openLink = useCallback(() => {
    if (!linkUrl) return;
    void Linking.openURL(linkUrl).catch(() => null);
  }, [linkUrl]);

  const openProduct = useCallback(() => {
    if (!(productId > 0)) return;
    rootNavigation?.navigate(routes.product, { productId });
  }, [productId, rootNavigation]);

  const openCollectionProduct = useCallback((nextProductId: number) => {
    if (!(nextProductId > 0)) return;
    rootNavigation?.navigate(routes.product, { productId: nextProductId });
  }, [rootNavigation]);

  useEffect(() => {
    if (!collectionProductIds.length) {
      setCollectionProducts([]);
      return;
    }
    let cancelled = false;
    const applyProducts = (snapshot: Awaited<ReturnType<typeof readCachedMobileCatalogSnapshot>> | null = null) => {
      const products = collectionProductIds
        .map((nextProductId) => {
          const cachedProduct = getCatalogSnapshotProduct(nextProductId) || findSnapshotProduct(snapshot, nextProductId);
          if (cachedProduct) return cachedProduct;
          return item?.products?.find((product) => Number(product?.id || 0) === nextProductId) || null;
        })
        .filter((product): product is PromoProductCard => Boolean(product));
      if (!cancelled) setCollectionProducts(products);
    };
    applyProducts();
    void readCachedMobileCatalogSnapshot()
      .then((snapshot) => applyProducts(snapshot))
      .catch(() => {
        if (!cancelled) applyProducts();
      });
    return () => {
      cancelled = true;
    };
  }, [collectionProductIds.join(',')]);

  const claimPromo = useCallback(async () => {
    const itemId = Number(item?.id || 0);
    if (!(itemId > 0) || item?.promo_claimable === false || item?.promo_claimed === true || claimingRef.current) return;
    claimingRef.current = true;
    setClaiming(true);
    try {
      const token = await refreshCustomerToken();
      if (!token) {
        pendingClaimRef.current = true;
        mainNavigation?.navigate(routes.profile);
        return;
      }
      const result = await claimImportantMessagePromo(itemId);
      const nextCode = String(result?.promo_code || '').trim();
      void refreshCheckoutBenefitsState().catch(() => null);
      setLoadedItem((current) => current ? {
        ...current,
        promo_code: nextCode || current.promo_code,
        promo_code_id: result?.promo_code_id ?? current.promo_code_id,
        promo_code_masked: false,
        promo_claimed: true,
      } : current);
    } catch (claimError) {
      if (claimError instanceof Error && claimError.message === 'UNAUTHORIZED') {
        pendingClaimRef.current = true;
        setCustomerToken('');
        mainNavigation?.navigate(routes.profile);
      } else {
        setLoadedItem((current) => current ? { ...current, promo_claimable: false } : current);
      }
    } finally {
      claimingRef.current = false;
      setClaiming(false);
    }
  }, [item, mainNavigation, refreshCustomerToken]);

  useEffect(() => {
    void refreshCustomerToken();
    return subscribeCustomerPassport(() => {
      void refreshCustomerToken().then((token) => {
        if (!token || !pendingClaimRef.current) return;
        pendingClaimRef.current = false;
        void claimPromo();
      });
    });
  }, [claimPromo, refreshCustomerToken]);

  useFocusEffect(useCallback(() => {
    void refreshCustomerToken();
  }, [refreshCustomerToken]));

  if (!item) {
    return (
      <Screen edges={['top']}>
        <AppHeader backgroundColor="#ffffff" onBack={() => navigation.goBack()} showBack title="" />
        <View style={styles.stateScreen}>
          <Ionicons color={theme.colors.muted} name={loading ? 'hourglass-outline' : 'alert-circle-outline'} size={34} />
          <Text style={styles.stateTitle}>
            {loading ? 'Загружаем сообщение' : error === 'LOAD_FAILED' ? 'Не удалось загрузить сообщение' : 'Сообщение не найдено'}
          </Text>
        </View>
      </Screen>
    );
  }

  return (
    <Screen edges={['top']}>
      <AppHeader backgroundColor="#ffffff" onBack={() => navigation.goBack()} showBack title="" />
      <Animated.ScrollView
        contentContainerStyle={styles.content}
        onScroll={Animated.event(
          [{ nativeEvent: { contentOffset: { y: scrollY } } }],
          { useNativeDriver: true },
        )}
        scrollEventThrottle={16}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.heroFrame}>
          {imageUrl ? (
            <Animated.Image
              resizeMode="cover"
              source={{ uri: imageUrl }}
              style={[styles.heroImage, { transform: [{ translateY: imageTranslateY }] }]}
            />
          ) : (
            <View style={styles.heroFallback}>
              <Ionicons color={theme.colors.muted} name="image-outline" size={44} />
            </View>
          )}
        </View>

        <View style={styles.sheet}>
          <Text style={styles.title}>{item.title}</Text>

          {hasPromo ? (
            <View style={styles.promoBlock}>
              <View style={styles.promoPill}>
                <Text style={styles.promoLabel}>Промокод</Text>
                <Text style={styles.promoCode}>{promoCode}</Text>
              </View>
              <Pressable
                accessibilityRole="button"
                disabled={claiming || item.promo_claimed === true || item.promo_claimable === false}
                onPress={claimPromo}
                style={({ pressed }) => [
                  styles.claimButton,
                  pressed && !claiming ? styles.claimButtonPressed : null,
                  (item.promo_claimed === true || item.promo_claimable === false) ? styles.claimButtonDisabled : null,
                ]}
              >
                <Text style={styles.claimText}>{claimText}</Text>
              </Pressable>
            </View>
          ) : null}

          {productId > 0 ? (
            <View style={styles.promoBlock}>
              <Pressable
                accessibilityRole="button"
                onPress={openProduct}
                style={({ pressed }) => [
                  styles.claimButton,
                  pressed ? styles.claimButtonPressed : null,
                ]}
              >
                <Text style={styles.claimText}>Заказать</Text>
              </Pressable>
            </View>
          ) : null}

          <Text style={styles.body}>{item.body}</Text>

          {collectionProducts.length ? (
            <View style={styles.productGrid}>
              {collectionProducts.map((product) => {
                const nextProductId = Number(product.id || 0);
                const price = getProductPrice(product);
                const oldPrice = getProductOldPrice(product);
                return (
                  <ProductCatalogCard
                    key={String(nextProductId)}
                    descriptionLines={getProductDefaultLines(product)}
                    discountBadgeText={getProductDiscountText(product, price, oldPrice)}
                    imageUrl={getProductImage(product)}
                    mediaPillText={isPromoProductConfigurable(product) ? 'Настроить ›' : ''}
                    oldPrice={oldPrice}
                    onPress={() => openCollectionProduct(nextProductId)}
                    onPressAction={() => openCollectionProduct(nextProductId)}
                    price={price}
                    promoBadgeText={getProductPromoBadgeText(product)}
                    title={getProductTitle(product, nextProductId)}
                  />
                );
              })}
            </View>
          ) : null}

          {linkUrl ? (
            <Pressable accessibilityRole="button" onPress={openLink} style={styles.linkButton}>
              <Text style={styles.linkText}>Открыть</Text>
              <Ionicons color="#ffffff" name="arrow-forward" size={18} />
            </Pressable>
          ) : null}
        </View>
      </Animated.ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  body: {
    color: '#3f3f46',
    fontSize: 16,
    lineHeight: 24,
    marginTop: 24,
  },
  content: {
    backgroundColor: '#f3f4f6',
    flexGrow: 1,
    paddingBottom: 28,
  },
  heroFallback: {
    alignItems: 'center',
    backgroundColor: '#eef2f7',
    height: '100%',
    justifyContent: 'center',
    width: '100%',
  },
  heroFrame: {
    aspectRatio: 2 / 3,
    backgroundColor: '#eef2f7',
    overflow: 'hidden',
    width: '100%',
  },
  heroImage: {
    height: '100%',
    width: '100%',
  },
  linkButton: {
    alignItems: 'center',
    alignSelf: 'flex-start',
    backgroundColor: theme.colors.accent,
    borderRadius: 999,
    flexDirection: 'row',
    gap: 8,
    marginTop: 28,
    paddingHorizontal: 18,
    paddingVertical: 12,
  },
  linkText: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '800',
  },
  promoCode: {
    color: '#3f3f46',
    flex: 1,
    fontSize: 16,
    fontWeight: '900',
    letterSpacing: 0.3,
    minWidth: 0,
  },
  promoLabel: {
    color: '#71717a',
    fontSize: 14,
  },
  promoPill: {
    alignItems: 'center',
    borderColor: '#e5e7eb',
    borderRadius: 24,
    borderStyle: 'dashed',
    borderWidth: 1.5,
    flex: 1,
    flexDirection: 'row',
    gap: 10,
    minHeight: 58,
    minWidth: 0,
    paddingHorizontal: 22,
    paddingVertical: 12,
  },
  promoBlock: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 10,
    marginTop: 20,
  },
  productGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    marginTop: 22,
  },
  claimButton: {
    alignItems: 'center',
    backgroundColor: theme.colors.accent,
    borderRadius: 999,
    flexShrink: 0,
    minHeight: 42,
    justifyContent: 'center',
    paddingHorizontal: 20,
    paddingVertical: 11,
  },
  claimButtonDisabled: {
    backgroundColor: '#e5e7eb',
  },
  claimButtonPressed: {
    opacity: 0.82,
  },
  claimText: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '900',
  },
  sheet: {
    backgroundColor: '#ffffff',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    marginTop: -28,
    minHeight: 280,
    paddingBottom: 32,
    paddingHorizontal: 20,
    paddingTop: 26,
  },
  stateScreen: {
    alignItems: 'center',
    backgroundColor: '#ffffff',
    flex: 1,
    gap: 12,
    justifyContent: 'center',
    padding: 24,
  },
  stateTitle: {
    color: theme.colors.text,
    fontSize: 17,
    fontWeight: '800',
    textAlign: 'center',
  },
  title: {
    color: '#27272a',
    fontSize: 25,
    fontWeight: '900',
    lineHeight: 31,
  },
});
