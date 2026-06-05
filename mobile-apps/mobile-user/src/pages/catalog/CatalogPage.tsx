import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import {
  ActivityIndicator,
  Animated,
  Easing,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import type { GestureResponderEvent } from 'react-native';
import type { RouteProp } from '@react-navigation/native';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

import type { MainTabParamList, RootStackParamList } from '../../app/navigation/routes';
import { routes } from '../../app/navigation/routes';
import type { CatalogCategory, CatalogCombo, CatalogProduct, MobileCatalogSnapshot } from '../../entities/product';
import {
  apiConfig,
  fetchMobileCatalogSnapshot,
  readCachedMobileCatalogSnapshot,
  resolveAssetUrl,
  warmCatalogComboDetails,
  warmMobileCatalogPassports,
} from '../../shared/api';
import { theme } from '../../shared/config/theme';
import { formatPrice } from '../../shared/lib/formatPrice';
import { Screen } from '../../shared/ui/Screen';

type CatalogNavigation = NativeStackNavigationProp<RootStackParamList>;
type CatalogRoute = RouteProp<MainTabParamList, 'home'>;

type CatalogState = {
  categories: CatalogCategory[];
  productsByCategory: Map<number, CatalogProduct[]>;
  combosByCategory: Map<number, CatalogCombo[]>;
};

const emptyCatalogState: CatalogState = {
  categories: [],
  combosByCategory: new Map(),
  productsByCategory: new Map(),
};

const comboGridOrder = [0, 2, 3, 1];
const comboSlideDirections = ['up', 'right', 'left', 'down'] as const;
const comboRotationIntervalMs = 6800;
const comboRotationStepDurationMs = 760;

type ComboSlideDirection = typeof comboSlideDirections[number];
type ComboSlidePhase = 'idle' | 'ready' | 'leaving' | 'entering';
type ComboImageLayer = 'front' | 'back';
type ComboLayerState = {
  index: number;
  url: string;
};
type ComboRotationCommand = {
  key: number;
  nextIndexes: number[];
  nextUrls: string[];
};

function mapSnapshotRecordToCategoryMap<T>(record: Record<string, T[]> | undefined, categories: CatalogCategory[]) {
  const result = new Map<number, T[]>();
  categories.forEach((category) => {
    const id = Number(category.id);
    if (Number.isFinite(id) && id > 0) result.set(id, Array.isArray(record?.[String(id)]) ? record[String(id)] : []);
  });
  return result;
}

function getCatalogStateFromSnapshot(snapshot: MobileCatalogSnapshot): CatalogState {
  const categories = Array.isArray(snapshot.categories) ? snapshot.categories : [];
  return {
    categories,
    combosByCategory: mapSnapshotRecordToCategoryMap<CatalogCombo>(snapshot.combosByCategory, categories),
    productsByCategory: mapSnapshotRecordToCategoryMap<CatalogProduct>(snapshot.productsByCategory, categories),
  };
}

function collectCatalogComboIds(snapshot: MobileCatalogSnapshot) {
  const ids = new Set<number>();
  Object.values(snapshot.combosByCategory || {}).forEach((list) => {
    (Array.isArray(list) ? list : []).forEach((combo) => {
      const id = Number(combo?.id || 0);
      if (Number.isFinite(id) && id > 0) ids.add(id);
    });
  });
  return Array.from(ids);
}

function isAvailable(value: CatalogProduct['is_available'] | CatalogCombo['is_available']) {
  return value === true || value === 1 || value == null;
}

function getProductPrice(product: CatalogProduct) {
  const display = Number(product.display_price ?? product.discounted_price ?? product.price ?? 0);
  return Number.isFinite(display) ? display : 0;
}

function getOldPrice(product: CatalogProduct) {
  const old = Number(product.old_price ?? product.original_price ?? 0);
  return Number.isFinite(old) ? old : 0;
}

function getDiscountText(product: CatalogProduct) {
  const discount = product.discount;
  const value = Number(discount?.discount_value || 0);
  if (discount?.discount_type === 'percent' && value > 0) return `-${Math.round(value)}%`;

  const price = getProductPrice(product);
  const old = getOldPrice(product);
  if (old > price && price >= 0) return `-${Math.round(((old - price) / old) * 100)}%`;

  return '';
}

function getProductImage(product: CatalogProduct) {
  const photo = product.photo_thumb || product.photo_lqip || product.photos?.[0] || '';
  return resolveAssetUrl(photo);
}

function getComboImages(combo: CatalogCombo) {
  const single = resolveAssetUrl(combo.image_thumb || combo.image_url || '');
  if (single) return [single];

  const thumbs = Array.isArray(combo.grid_photos_thumb) ? combo.grid_photos_thumb : [];
  const photos = Array.isArray(combo.grid_photos) ? combo.grid_photos : [];

  return comboGridOrder.map((index) => resolveAssetUrl(thumbs[index] || photos[index] || '')).filter(Boolean);
}

function normalizeComboCellPhotos(combo: CatalogCombo, visualIndex: number) {
  const sourceIndex = comboGridOrder[visualIndex] ?? visualIndex;
  const thumbs = Array.isArray(combo.grid_photos_thumb) ? combo.grid_photos_thumb : [];
  const photos = Array.isArray(combo.grid_photos) ? combo.grid_photos : [];
  const photoSets = Array.isArray(combo.grid_photo_sets) ? combo.grid_photo_sets : [];
  const base = thumbs[sourceIndex] || photos[sourceIndex] || '';
  const alternatives = Array.isArray(photoSets[sourceIndex]) ? photoSets[sourceIndex] : [];
  const urls = [base, ...alternatives]
    .map((url) => resolveAssetUrl(url))
    .filter(Boolean);

  return Array.from(new Set(urls));
}

function getComboImageSets(combo: CatalogCombo) {
  return [0, 1, 2, 3].map((index) => normalizeComboCellPhotos(combo, index));
}

function getComboSlideOffset(direction: ComboSlideDirection, width: number, height: number) {
  const safeWidth = width || 120;
  const safeHeight = height || 120;
  if (direction === 'right') return { x: safeWidth, y: 0 };
  if (direction === 'down') return { x: 0, y: safeHeight };
  if (direction === 'left') return { x: -safeWidth, y: 0 };
  return { x: 0, y: -safeHeight };
}

function waitForComboImage(url: string, timeoutMs = 1400) {
  return Promise.race([
    Image.prefetch(url),
    new Promise<boolean>((resolve) => {
      setTimeout(() => resolve(false), timeoutMs);
    }),
  ]).then(Boolean).catch(() => false);
}

function isProductConfigurable(product: CatalogProduct) {
  const blocksConfig = product.blocks_config && typeof product.blocks_config === 'object' ? product.blocks_config : null;
  return Boolean(
    blocksConfig?.variants ||
      blocksConfig?.options ||
      blocksConfig?.ingredients ||
      (Array.isArray(product.variants) && product.variants.length > 0) ||
      (Array.isArray(product.options) && product.options.length > 0) ||
      (Array.isArray(product.ingredients) && product.ingredients.length > 0),
  );
}

function getProductTitle(product: CatalogProduct) {
  const variantLabel = String(product.default_variant?.variant_label || '').trim();
  return [variantLabel, product.name].filter(Boolean).join(' ');
}

function getProductDefaultLines(product: CatalogProduct) {
  const defaultLines = Array.isArray(product.catalog_default_lines) ? product.catalog_default_lines : [];
  if (defaultLines.length > 0) {
    return defaultLines.map((line) => String(line || '').trim()).filter(Boolean).slice(0, 2);
  }

  return String(product.description_short || '')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, 2);
}

function getProductMediaPillText(product: CatalogProduct, available: boolean, quantity: number) {
  if (!available) return quantity > 0 ? 'Больше нет' : 'Раскупили';
  return isProductConfigurable(product) ? 'Настроить ›' : '';
}

function QuantityOverlayText({ quantity }: { quantity: number }) {
  const previousQuantity = useRef(quantity);
  const animatedValue = useRef(new Animated.Value(1)).current;
  const direction = quantity >= previousQuantity.current ? 1 : -1;

  useEffect(() => {
    previousQuantity.current = quantity;
    animatedValue.setValue(0);
    Animated.timing(animatedValue, {
      duration: 190,
      easing: Easing.out(Easing.cubic),
      toValue: 1,
      useNativeDriver: true,
    }).start();
  }, [animatedValue, quantity]);

  return (
    <Animated.Text
      style={[
        styles.quantityOverlayText,
        {
          opacity: animatedValue,
          transform: [
            {
              translateX: animatedValue.interpolate({
                inputRange: [0, 1],
                outputRange: [18 * direction, 0],
              }),
            },
          ],
        },
      ]}
    >
      {quantity}
    </Animated.Text>
  );
}

function ProductCard({
  product,
  quantity,
  onDecrease,
  onIncrease,
  onPress,
}: {
  product: CatalogProduct;
  quantity: number;
  onDecrease: () => void;
  onIncrease: () => void;
  onPress: () => void;
}) {
  const image = getProductImage(product);
  const price = getProductPrice(product);
  const oldPrice = getOldPrice(product);
  const available = isAvailable(product.is_available);
  const discountText = getDiscountText(product);
  const hasQuantity = quantity > 0;
  const title = getProductTitle(product);
  const defaultLines = getProductDefaultLines(product);
  const mediaPillText = getProductMediaPillText(product, available, quantity);
  const totalPrice = price * Math.max(quantity, 1);

  const handleDecrease = (event: GestureResponderEvent) => {
    event.stopPropagation();
    onDecrease();
  };

  const handleIncrease = (event: GestureResponderEvent) => {
    event.stopPropagation();
    if (available) onIncrease();
  };

  return (
    <Pressable style={[styles.card, !available && styles.cardDisabled]} onPress={onPress}>
      <View style={styles.media}>
        {image ? <Image resizeMode="contain" source={{ uri: image }} style={styles.image} /> : <View style={styles.imagePlaceholder} />}
        {hasQuantity ? (
          <View style={styles.quantityOverlay}>
            <QuantityOverlayText quantity={quantity} />
          </View>
        ) : null}
        {discountText ? <Text style={styles.discountBadge}>{discountText}</Text> : null}
        {mediaPillText ? (
          <Text style={[styles.mediaPill, !available && styles.mediaPillDisabled]}>{mediaPillText}</Text>
        ) : null}
      </View>
      <View style={styles.cardBody}>
        <Text numberOfLines={2} style={styles.cardTitle}>
          {title}
        </Text>
        <View style={styles.cardDescription}>
          {defaultLines.map((line, index) => (
            <Text key={`${line}-${index}`} numberOfLines={1} style={styles.cardDescriptionLine}>
              • {line}
            </Text>
          ))}
        </View>
        <View style={styles.cardFooter}>
          {hasQuantity ? (
            <View key="qty" style={styles.qtyPill}>
              <View style={styles.unitPriceWrap}>
                <Text style={styles.unitPriceText}>{formatPrice(price)}</Text>
              </View>
              <Pressable style={styles.qtyPillButton} onPress={handleDecrease}>
                <Ionicons name={quantity > 1 ? 'remove' : 'trash'} color={theme.colors.primaryText} size={14} />
              </Pressable>
              <View style={styles.qtyPillCenter}>
                {oldPrice > price ? <Text style={styles.oldPrice}>{formatPrice(oldPrice * quantity)}</Text> : null}
                <Text numberOfLines={1} style={styles.price}>
                  {formatPrice(totalPrice)}
                </Text>
              </View>
              <Pressable style={styles.qtyPillButton} onPress={handleIncrease}>
                <Ionicons name="add" color={theme.colors.primaryText} size={16} />
              </Pressable>
            </View>
          ) : (
            <View key="idle" style={styles.idleFooter}>
              <View style={styles.priceStack}>
                {oldPrice > price ? <Text style={styles.oldPrice}>{formatPrice(oldPrice)}</Text> : null}
                <Text numberOfLines={1} style={styles.price}>{formatPrice(price)}</Text>
              </View>
              <Pressable style={[styles.plusButton, !available && styles.plusButtonDisabled]} onPress={handleIncrease}>
                <Ionicons name="add" color={theme.colors.primaryText} size={18} />
              </Pressable>
            </View>
          )}
        </View>
      </View>
    </Pressable>
  );
}

function AnimatedComboGridCell({
  direction,
  nextIndex,
  nextUrl,
  photos,
  rotationKey,
}: {
  direction: ComboSlideDirection;
  nextIndex: number | null;
  nextUrl: string;
  photos: string[];
  rotationKey: number;
}) {
  const leaveAnimation = useRef(new Animated.Value(0)).current;
  const enterAnimation = useRef(new Animated.Value(1)).current;
  const mountedRef = useRef(true);
  const [slideState, setSlideState] = useState<{
    activeLayer: ComboImageLayer;
    back: ComboLayerState | null;
    front: ComboLayerState | null;
    incomingLayer: ComboImageLayer | null;
    phase: ComboSlidePhase;
  }>({
    activeLayer: 'front',
    back: null,
    front: { index: 0, url: photos[0] || '' },
    incomingLayer: null,
    phase: 'idle',
  });
  const [size, setSize] = useState({ height: 0, width: 0 });
  const activeLayerState = slideState[slideState.activeLayer];
  const activeIndex = activeLayerState?.index || 0;
  const currentUrl = activeLayerState?.url || photos[0] || '';
  const offset = getComboSlideOffset(direction, size.width, size.height);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      leaveAnimation.stopAnimation();
      enterAnimation.stopAnimation();
    };
  }, [enterAnimation, leaveAnimation]);

  useEffect(() => {
    setSlideState({
      activeLayer: 'front',
      back: null,
      front: { index: 0, url: photos[0] || '' },
      incomingLayer: null,
      phase: 'idle',
    });
    leaveAnimation.setValue(0);
    enterAnimation.setValue(1);
  }, [enterAnimation, leaveAnimation, photos]);

  useEffect(() => {
    if (!rotationKey || !nextUrl || nextIndex == null || photos.length < 2) return;
    if (nextIndex === activeIndex) return;

    leaveAnimation.setValue(0);
    enterAnimation.setValue(0);
    const incomingLayer: ComboImageLayer = slideState.activeLayer === 'front' ? 'back' : 'front';
    setSlideState((current) => ({
      ...current,
      [incomingLayer]: { index: nextIndex, url: nextUrl },
      incomingLayer,
      phase: 'ready',
    }));

    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        if (!mountedRef.current) return;

        setSlideState((current) => ({ ...current, phase: 'leaving' }));

        Animated.timing(leaveAnimation, {
          duration: comboRotationStepDurationMs,
          easing: Easing.bezier(0.22, 0.61, 0.36, 1),
          toValue: 1,
          useNativeDriver: true,
        }).start(({ finished }) => {
          if (!mountedRef.current || !finished) return;

          setSlideState((current) => ({ ...current, phase: 'entering' }));

          Animated.timing(enterAnimation, {
            duration: comboRotationStepDurationMs,
            easing: Easing.bezier(0.22, 0.61, 0.36, 1),
            toValue: 1,
            useNativeDriver: true,
          }).start(() => {
            if (!mountedRef.current) return;
            leaveAnimation.setValue(0);
            enterAnimation.setValue(1);
            setSlideState((current) => ({
              ...current,
              activeLayer: incomingLayer,
              incomingLayer: null,
              phase: 'idle',
            }));
          });
        });
      });
    });
  }, [activeIndex, enterAnimation, leaveAnimation, nextIndex, nextUrl, photos.length, rotationKey, slideState.activeLayer]);

  if (!currentUrl) return null;

  const getLayerStyle = (layer: ComboImageLayer) => {
    const isActive = layer === slideState.activeLayer;
    const isIncoming = layer === slideState.incomingLayer;
    const isLeaving = isActive && slideState.phase === 'leaving';
    const isEntering = isIncoming && slideState.phase === 'entering';
    const opacity = isLeaving
      ? leaveAnimation.interpolate({
        inputRange: [0, 1],
        outputRange: [1, 0],
      })
      : isEntering
        ? enterAnimation
        : isActive && slideState.phase === 'idle'
          ? 1
          : 0;
    const translateX = isLeaving
      ? leaveAnimation.interpolate({
        inputRange: [0, 1],
        outputRange: [0, offset.x],
      })
      : isEntering
        ? enterAnimation.interpolate({
          inputRange: [0, 1],
          outputRange: [offset.x, 0],
        })
        : isActive && slideState.phase === 'idle'
          ? 0
          : offset.x;
    const translateY = isLeaving
      ? leaveAnimation.interpolate({
        inputRange: [0, 1],
        outputRange: [0, offset.y],
      })
      : isEntering
        ? enterAnimation.interpolate({
          inputRange: [0, 1],
          outputRange: [offset.y, 0],
        })
        : isActive && slideState.phase === 'idle'
          ? 0
          : offset.y;

    return {
      opacity,
      transform: [
        { translateX },
        { translateY },
      ],
    };
  };

  return (
    <View
      style={styles.comboCellInner}
      onLayout={(event) => {
        const { height, width } = event.nativeEvent.layout;
        if (height !== size.height || width !== size.width) setSize({ height, width });
      }}
    >
      {slideState.front?.url ? (
        <Animated.Image resizeMode="cover" source={{ uri: slideState.front.url }} style={[styles.comboImage, getLayerStyle('front')]} />
      ) : null}
      {slideState.back?.url ? (
        <Animated.Image resizeMode="cover" source={{ uri: slideState.back.url }} style={[styles.comboImage, getLayerStyle('back')]} />
      ) : null}
    </View>
  );
}

function ComboCard({ combo, onPress }: { combo: CatalogCombo; onPress: () => void }) {
  const images = getComboImages(combo);
  const imageSets = useMemo(() => getComboImageSets(combo), [combo]);
  const [comboImageIndexes, setComboImageIndexes] = useState([0, 0, 0, 0]);
  const [rotationCommand, setRotationCommand] = useState<ComboRotationCommand | null>(null);
  const discountPercent = Number(combo.discount_percent || 0);
  const minPrice = Number(combo.min_price || 0);
  const available = isAvailable(combo.is_available);

  useEffect(() => {
    setComboImageIndexes([0, 0, 0, 0]);
    setRotationCommand(null);
  }, [imageSets]);

  useEffect(() => {
    if (!imageSets.some((photos) => photos.length > 1)) return;

    let isMounted = true;
    let isSwitching = false;
    let currentIndexes = [0, 0, 0, 0];

    const timer = setInterval(async () => {
      if (isSwitching) return;
      isSwitching = true;

      const nextIndexes = imageSets.map((photos, index) => {
        if (photos.length < 2) return currentIndexes[index] || 0;
        let nextIndex = Math.floor(Math.random() * photos.length);
        if (nextIndex === currentIndexes[index]) nextIndex = (nextIndex + 1) % photos.length;
        return nextIndex;
      });
      const nextUrls = imageSets.map((photos, index) => photos[nextIndexes[index]] || '');
      const readiness = await Promise.all(nextUrls.map((url, index) => (
        imageSets[index].length > 1 && url ? waitForComboImage(url) : Promise.resolve(true)
      )));

      if (!isMounted) return;
      if (!readiness.every(Boolean)) {
        isSwitching = false;
        return;
      }

      currentIndexes = nextIndexes;
      setComboImageIndexes(nextIndexes);
      setRotationCommand({
        key: Date.now(),
        nextIndexes,
        nextUrls,
      });
      setTimeout(() => {
        isSwitching = false;
      }, comboRotationStepDurationMs * 2 + 120);
    }, comboRotationIntervalMs);

    return () => {
      isMounted = false;
      clearInterval(timer);
    };
  }, [imageSets]);

  return (
    <Pressable style={[styles.card, !available && styles.cardDisabled]} onPress={onPress}>
      <View style={styles.media}>
        {images.length === 1 ? (
          <Image resizeMode="contain" source={{ uri: images[0] }} style={styles.image} />
        ) : (
          <View style={styles.comboGrid}>
            {[0, 1, 2, 3].map((index) => (
              <View key={index} style={styles.comboCell}>
                <AnimatedComboGridCell
                  direction={comboSlideDirections[index]}
                  nextIndex={rotationCommand?.nextIndexes[index] ?? comboImageIndexes[index] ?? null}
                  nextUrl={rotationCommand?.nextUrls[index] || ''}
                  photos={imageSets[index]}
                  rotationKey={rotationCommand?.key || 0}
                />
              </View>
            ))}
          </View>
        )}
        {discountPercent > 0 ? <Text style={styles.discountBadge}>-{Math.round(discountPercent)}%</Text> : null}
        <Text style={styles.mediaPill}>Собрать комбо ›</Text>
      </View>
      <View style={styles.cardBody}>
        <Text numberOfLines={2} style={styles.cardTitle}>
          {combo.title}
        </Text>
        <View style={styles.cardDescription}>
          {combo.description ? (
            <Text numberOfLines={1} style={styles.cardDescriptionLine}>
              {combo.description}
            </Text>
          ) : null}
        </View>
        <View style={styles.cardFooter}>
          <Text numberOfLines={1} style={styles.price}>от {formatPrice(minPrice)}</Text>
          <View style={styles.plusButton}>
            <Ionicons name="chevron-forward" color={theme.colors.primaryText} size={16} />
          </View>
        </View>
      </View>
    </Pressable>
  );
}

export function CatalogPage() {
  const navigation = useNavigation<CatalogNavigation>();
  const route = useRoute<CatalogRoute>();
  const scrollRef = useRef<ScrollView>(null);
  const chipsScrollRef = useRef<ScrollView>(null);
  const sectionOffsets = useRef(new Map<number, number>());
  const chipOffsets = useRef(new Map<number, number>());
  const [activeCategoryId, setActiveCategoryId] = useState<number | null>(null);
  const [catalog, setCatalog] = useState<CatalogState>(emptyCatalogState);
  const [productQuantities, setProductQuantities] = useState<Record<number, number>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [errorText, setErrorText] = useState('');

  const visibleCategories = useMemo(
    () => catalog.categories.filter((category) => Number(category.id) > 0),
    [catalog.categories],
  );

  const loadCatalog = useCallback(async () => {
    setErrorText('');
    setIsLoading(true);

    const applySnapshot = (snapshot: MobileCatalogSnapshot) => {
      const nextCatalog = getCatalogStateFromSnapshot(snapshot);
      const firstCategoryId = Number(nextCatalog.categories[0]?.id || 0);
      setCatalog(nextCatalog);
      setActiveCategoryId((current) => current || (Number.isFinite(firstCategoryId) && firstCategoryId > 0 ? firstCategoryId : null));
    };

    let hasRenderedSnapshot = false;

    try {
      const cachedSnapshot = await readCachedMobileCatalogSnapshot();
      if (cachedSnapshot) {
        applySnapshot(cachedSnapshot);
        hasRenderedSnapshot = true;
        setIsLoading(false);
      }

      const freshSnapshot = await fetchMobileCatalogSnapshot();
      if (!cachedSnapshot || freshSnapshot.version !== cachedSnapshot.version) {
        applySnapshot(freshSnapshot);
        hasRenderedSnapshot = true;
      }
      void warmMobileCatalogPassports(freshSnapshot);
      void warmCatalogComboDetails(collectCatalogComboIds(freshSnapshot));
    } catch (error) {
      if (!hasRenderedSnapshot) {
        setCatalog(emptyCatalogState);
        setErrorText(error instanceof Error ? error.message : 'Не удалось загрузить каталог');
      }
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadCatalog();
  }, [loadCatalog]);

  const scrollChipToCategory = useCallback((categoryId: number) => {
    const offset = chipOffsets.current.get(categoryId);
    if (offset != null) {
      chipsScrollRef.current?.scrollTo({ animated: true, x: Math.max(0, offset - theme.spacing.sm) });
    }
  }, []);

  useEffect(() => {
    if (activeCategoryId != null) scrollChipToCategory(activeCategoryId);
  }, [activeCategoryId, scrollChipToCategory]);

  const scrollToCategoryId = useCallback((categoryId: number) => {
    setActiveCategoryId(categoryId);
    const offset = sectionOffsets.current.get(categoryId);
    if (offset != null) {
      scrollRef.current?.scrollTo({ animated: true, y: Math.max(0, offset - 8) });
    }
  }, []);

  useEffect(() => {
    const selectedCategoryId = Number(route.params?.selectedCategoryId || 0);
    if (!Number.isFinite(selectedCategoryId) || selectedCategoryId <= 0) return;
    if (!visibleCategories.some((category) => Number(category.id) === selectedCategoryId)) return;

    const timer = setTimeout(() => scrollToCategoryId(selectedCategoryId), 80);
    return () => clearTimeout(timer);
  }, [route.params?.selectedCategoryId, scrollToCategoryId, visibleCategories]);

  const handleCatalogScroll = useCallback((event: { nativeEvent: { contentOffset: { y: number } } }) => {
    const y = event.nativeEvent.contentOffset.y;
    let nextActiveId = activeCategoryId;

    visibleCategories.forEach((category) => {
      const categoryId = Number(category.id);
      const offset = sectionOffsets.current.get(categoryId);
      if (offset != null && offset <= y + 48) {
        nextActiveId = categoryId;
      }
    });

    if (nextActiveId != null && nextActiveId !== activeCategoryId) {
      setActiveCategoryId(nextActiveId);
    }
  }, [activeCategoryId, visibleCategories]);

  const increaseProductQuantity = useCallback((productId: number) => {
    setProductQuantities((current) => ({
      ...current,
      [productId]: (current[productId] || 0) + 1,
    }));
  }, []);

  const decreaseProductQuantity = useCallback((productId: number) => {
    setProductQuantities((current) => {
      const nextQuantity = (current[productId] || 0) - 1;
      const next = { ...current };

      if (nextQuantity > 0) {
        next[productId] = nextQuantity;
      } else {
        delete next[productId];
      }

      return next;
    });
  }, []);

  return (
    <Screen>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Каталог</Text>
        <Text style={styles.headerCaption}>Товары и комбо из текущей базы</Text>
      </View>

      <View style={styles.chipsWrap}>
        <Pressable
          style={styles.categoriesButton}
          onPress={() => {
            navigation.navigate(routes.categories, {
              activeCategoryId,
              categories: visibleCategories,
            });
          }}
        >
          <Ionicons name="list-outline" color={theme.colors.text} size={20} />
        </Pressable>
        <ScrollView
          ref={chipsScrollRef}
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.chipsScroller}
        >
          {visibleCategories.map((category) => {
            const categoryId = Number(category.id);
            const isActive = categoryId === activeCategoryId;
            return (
              <Pressable
                key={category.id}
                style={[styles.chip, isActive && styles.chipActive]}
                onPress={() => scrollToCategoryId(categoryId)}
                onLayout={(event) => {
                  chipOffsets.current.set(categoryId, event.nativeEvent.layout.x);
                }}
              >
                <Text style={[styles.chipText, isActive && styles.chipTextActive]}>{category.title}</Text>
              </Pressable>
            );
          })}
        </ScrollView>
      </View>

      {isLoading ? (
        <View style={styles.centerState}>
          <ActivityIndicator color={theme.colors.primary} />
          <Text style={styles.stateText}>Загружаем каталог</Text>
        </View>
      ) : errorText ? (
        <View style={styles.centerState}>
          <Text style={styles.errorTitle}>Каталог не загрузился</Text>
          <Text style={styles.stateText}>{errorText}</Text>
          <Text style={styles.debugText}>API: {apiConfig.baseUrl}</Text>
          <Pressable style={styles.retryButton} onPress={loadCatalog}>
            <Text style={styles.retryButtonText}>Повторить</Text>
          </Pressable>
        </View>
      ) : (
        <ScrollView
          ref={scrollRef}
          style={styles.content}
          contentContainerStyle={styles.contentInner}
          onScroll={handleCatalogScroll}
          scrollEventThrottle={80}
        >
          {visibleCategories.map((category) => {
            const categoryId = Number(category.id);
            const products = catalog.productsByCategory.get(categoryId) || [];
            const combos = catalog.combosByCategory.get(categoryId) || [];
            const hasItems = products.length > 0 || combos.length > 0;

            return (
              <View
                key={category.id}
                onLayout={(event) => {
                  sectionOffsets.current.set(categoryId, event.nativeEvent.layout.y);
                }}
              >
                <Text style={styles.sectionTitle}>{category.title}</Text>
                {hasItems ? (
                  <View style={styles.grid}>
                    {products.map((product) => (
                      <ProductCard
                        key={`product-${category.id}-${product.id}`}
                        product={product}
                        quantity={productQuantities[Number(product.id)] || 0}
                        onDecrease={() => decreaseProductQuantity(Number(product.id))}
                        onIncrease={() => increaseProductQuantity(Number(product.id))}
                        onPress={() => navigation.navigate('product', { productId: Number(product.id) })}
                      />
                    ))}
                    {combos.map((combo) => (
                      <ComboCard
                        key={`combo-${category.id}-${combo.id}`}
                        combo={combo}
                        onPress={() => navigation.navigate('combo', { comboId: Number(combo.id), openNonce: Date.now() })}
                      />
                    ))}
                  </View>
                ) : (
                  <Text style={styles.emptySection}>В этой категории пока нет товаров</Text>
                )}
              </View>
            );
          })}
        </ScrollView>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  card: {
    aspectRatio: 0.56,
    backgroundColor: theme.colors.card,
    borderRadius: 18,
    elevation: 1,
    marginBottom: theme.spacing.md,
    overflow: 'hidden',
    shadowColor: '#111827',
    shadowOffset: { height: 4, width: 0 },
    shadowOpacity: 0.05,
    shadowRadius: 10,
    width: '48%',
  },
  cardBody: {
    flex: 1,
    paddingBottom: theme.spacing.sm,
    paddingHorizontal: theme.spacing.sm,
    paddingTop: 6,
  },
  cardDescription: {
    height: 31,
    marginTop: theme.spacing.xs,
  },
  cardDescriptionLine: {
    color: theme.colors.muted,
    fontSize: 10,
    lineHeight: 14,
  },
  cardDisabled: {
    opacity: 0.68,
  },
  cardFooter: {
    alignItems: 'flex-end',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 'auto',
    minHeight: 40,
    width: '100%',
  },
  cardTitle: {
    color: theme.colors.text,
    fontSize: 12,
    fontWeight: '700',
    lineHeight: 16,
    height: 32,
  },
  categoriesButton: {
    alignItems: 'center',
    backgroundColor: theme.colors.mutedBackground,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.pill,
    borderWidth: 1,
    height: theme.sizes.categoryChipHeight,
    justifyContent: 'center',
    marginRight: theme.spacing.sm,
    width: theme.sizes.categoryChipHeight,
  },
  centerState: {
    alignItems: 'center',
    flex: 1,
    justifyContent: 'center',
    padding: theme.spacing.xl,
  },
  chip: {
    alignItems: 'center',
    backgroundColor: theme.colors.mutedBackground,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.pill,
    borderWidth: 1,
    height: theme.sizes.categoryChipHeight,
    justifyContent: 'center',
    marginRight: theme.spacing.sm,
    paddingHorizontal: 14,
  },
  chipActive: {
    backgroundColor: theme.colors.accent,
    borderColor: theme.colors.accent,
  },
  chipText: {
    color: theme.colors.text,
    fontSize: 14,
    fontWeight: '700',
  },
  chipTextActive: {
    color: theme.colors.primaryText,
  },
  chipsScroller: {
    flex: 1,
  },
  chipsWrap: {
    alignItems: 'center',
    borderBottomColor: theme.colors.border,
    borderBottomWidth: 1,
    flexDirection: 'row',
    paddingHorizontal: theme.spacing.lg,
    paddingVertical: theme.spacing.sm,
  },
  comboCell: {
    backgroundColor: theme.colors.card,
    height: '50%',
    overflow: 'hidden',
    width: '50%',
  },
  comboCellInner: {
    flex: 1,
    overflow: 'hidden',
  },
  comboGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    height: '100%',
    width: '100%',
  },
  comboImage: {
    bottom: 0,
    height: '100%',
    left: 0,
    position: 'absolute',
    right: 0,
    top: 0,
    width: '100%',
  },
  content: {
    backgroundColor: theme.colors.mutedBackground,
    flex: 1,
  },
  contentInner: {
    padding: theme.spacing.lg,
    paddingBottom: theme.spacing.xl,
  },
  debugText: {
    color: theme.colors.muted,
    fontSize: 12,
    marginTop: theme.spacing.sm,
    textAlign: 'center',
  },
  discountBadge: {
    backgroundColor: theme.colors.accent,
    borderRadius: theme.radius.pill,
    color: theme.colors.primaryText,
    fontSize: 11,
    fontWeight: '800',
    overflow: 'hidden',
    paddingHorizontal: 7,
    paddingVertical: 4,
    position: 'absolute',
    right: 7,
    top: 7,
  },
  quantityOverlay: {
    alignItems: 'center',
    backgroundColor: 'rgba(17, 24, 39, 0.34)',
    bottom: 0,
    justifyContent: 'center',
    left: 0,
    position: 'absolute',
    right: 0,
    top: 0,
  },
  quantityOverlayText: {
    color: theme.colors.primaryText,
    fontSize: 36,
    fontWeight: '900',
  },
  emptySection: {
    color: theme.colors.muted,
    fontSize: 14,
    marginBottom: theme.spacing.xl,
  },
  errorTitle: {
    color: theme.colors.text,
    fontSize: 18,
    fontWeight: '700',
    marginBottom: theme.spacing.sm,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },
  header: {
    paddingHorizontal: theme.spacing.lg,
    paddingTop: theme.spacing.md,
    paddingBottom: theme.spacing.sm,
  },
  headerCaption: {
    color: theme.colors.muted,
    fontSize: 13,
    marginTop: theme.spacing.xs,
  },
  headerTitle: {
    color: theme.colors.text,
    fontSize: 24,
    fontWeight: '800',
  },
  image: {
    height: '100%',
    width: '100%',
  },
  imagePlaceholder: {
    backgroundColor: theme.colors.mutedBackground,
    height: '100%',
    width: '100%',
  },
  idleFooter: {
    alignItems: 'flex-end',
    flexDirection: 'row',
    justifyContent: 'space-between',
    width: '100%',
  },
  media: {
    aspectRatio: 1,
    backgroundColor: theme.colors.card,
    borderRadius: 14,
    overflow: 'hidden',
    position: 'relative',
  },
  mediaPill: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.pill,
    bottom: 10,
    color: theme.colors.text,
    elevation: 3,
    fontSize: 10,
    fontWeight: '800',
    overflow: 'hidden',
    paddingHorizontal: 8,
    paddingVertical: 4,
    position: 'absolute',
    right: 10,
    shadowColor: '#111827',
    shadowOffset: { height: 3, width: 0 },
    shadowOpacity: 0.16,
    shadowRadius: 6,
  },
  mediaPillDisabled: {
    color: theme.colors.muted,
  },
  oldPrice: {
    color: theme.colors.muted,
    fontSize: 10,
    fontWeight: '800',
    textDecorationLine: 'line-through',
  },
  plusButton: {
    alignItems: 'center',
    backgroundColor: theme.colors.accent,
    borderRadius: theme.radius.sm,
    flexShrink: 0,
    height: 32,
    justifyContent: 'center',
    width: 32,
  },
  plusButtonDisabled: {
    backgroundColor: theme.colors.muted,
  },
  price: {
    color: theme.colors.text,
    fontSize: 17,
    fontWeight: '900',
  },
  priceStack: {
    flex: 1,
    minWidth: 0,
    paddingRight: theme.spacing.sm,
  },
  qtyPill: {
    alignItems: 'flex-end',
    flexDirection: 'row',
    justifyContent: 'space-between',
    position: 'relative',
    width: '100%',
  },
  qtyPillButton: {
    alignItems: 'center',
    backgroundColor: theme.colors.accent,
    borderRadius: theme.radius.sm,
    height: 32,
    justifyContent: 'center',
    width: 32,
  },
  qtyPillCenter: {
    alignItems: 'center',
    flex: 1,
    justifyContent: 'center',
    minWidth: 0,
    paddingHorizontal: 4,
  },
  unitPriceText: {
    color: theme.colors.muted,
    fontSize: 10,
    fontWeight: '800',
  },
  unitPriceWrap: {
    left: 0,
    position: 'absolute',
    top: -13,
    width: 32,
  },
  retryButton: {
    backgroundColor: theme.colors.primary,
    borderRadius: theme.radius.sm,
    marginTop: theme.spacing.lg,
    paddingHorizontal: theme.spacing.lg,
    paddingVertical: theme.spacing.md,
  },
  retryButtonText: {
    color: theme.colors.primaryText,
    fontSize: 14,
    fontWeight: '700',
  },
  sectionTitle: {
    color: theme.colors.text,
    fontSize: 20,
    fontWeight: '800',
    marginBottom: theme.spacing.md,
    marginTop: theme.spacing.sm,
  },
  stateText: {
    color: theme.colors.muted,
    fontSize: 14,
    marginTop: theme.spacing.sm,
    textAlign: 'center',
  },
});
