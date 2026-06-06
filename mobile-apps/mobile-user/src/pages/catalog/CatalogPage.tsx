import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import {
  ActivityIndicator,
  Animated,
  Easing,
  FlatList,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  useWindowDimensions,
  View,
} from 'react-native';
import type { GestureResponderEvent, ViewToken } from 'react-native';
import type { RouteProp } from '@react-navigation/native';
import { useFocusEffect, useNavigation, useRoute } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

import type { MainTabParamList, RootStackParamList } from '../../app/navigation/routes';
import { routes } from '../../app/navigation/routes';
import type { CatalogCategory, CatalogCombo, CatalogProduct, CatalogProductPassport, MobileCatalogSnapshot } from '../../entities/product';
import { addCartLine, makeCartLineId, readCartLines, updateCartLineQuantity, type CartIngredient, type CartLine, type CartLineDraft, type CartOptionItem, type CartVariant } from '../../features/cart';
import {
  apiConfig,
  ensureMobileCatalogProductPassport,
  fetchMobileCatalogSnapshot,
  readCachedMobileCatalogSnapshot,
  resolveAssetUrl,
  warmCatalogComboDetails,
  warmMobileCatalogPassports,
} from '../../shared/api';
import { theme } from '../../shared/config/theme';
import { formatPrice } from '../../shared/lib/formatPrice';
import { Screen } from '../../shared/ui/Screen';

import { AppText as Text } from '../../shared/ui';
type CatalogNavigation = NativeStackNavigationProp<RootStackParamList>;
type CatalogRoute = RouteProp<MainTabParamList, 'home'>;

type CatalogState = {
  categories: CatalogCategory[];
  productsByCategory: Map<number, CatalogProduct[]>;
  combosByCategory: Map<number, CatalogCombo[]>;
  productPassports: Map<number, CatalogProductPassport>;
};

type CatalogCardItem =
  | { cardKey: string; categoryId: number; product: CatalogProduct; type: 'product' }
  | { cardKey: string; categoryId: number; combo: CatalogCombo; type: 'combo' };

type CatalogListItem =
  | { categoryId: number; itemKey: string; title: string; type: 'header' }
  | { categoryId: number; itemKey: string; cards: CatalogCardItem[]; type: 'row' }
  | { categoryId: number; itemKey: string; type: 'empty' };

type CatalogItemLayout = {
  index: number;
  length: number;
  offset: number;
};

const emptyCatalogState: CatalogState = {
  categories: [],
  combosByCategory: new Map(),
  productPassports: new Map(),
  productsByCategory: new Map(),
};

const comboGridOrder = [0, 2, 3, 1];
const comboSlideDirections = ['up', 'right', 'left', 'down'] as const;
const comboRotationIntervalMs = 6800;
const comboRotationStepDurationMs = 760;
const comboRotationPrepareDelayMs = 180;

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
  const productPassports = new Map<number, CatalogProductPassport>();
  Object.entries(snapshot.productPassports || {}).forEach(([key, passport]) => {
    const id = Number(key || passport?.product?.id || 0);
    if (Number.isFinite(id) && id > 0 && passport) productPassports.set(id, passport);
  });
  return {
    categories,
    combosByCategory: mapSnapshotRecordToCategoryMap<CatalogCombo>(snapshot.combosByCategory, categories),
    productPassports,
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

function roundPrice(value: number) {
  return Math.round((Number.isFinite(value) ? value : 0) * 100) / 100;
}

function getDiscountedPrice(price: number, discount: CatalogProduct['discount']) {
  const value = Number(discount?.discount_value || 0);
  if (!(value > 0)) return price;
  if (discount?.discount_type === 'percent') return roundPrice(price * (1 - Math.min(100, value) / 100));
  return roundPrice(Math.max(0, price - value));
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

function asPlainRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? value as Record<string, unknown> : {};
}

function asPlainArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function trimText(value: unknown) {
  return String(value || '').trim();
}

function positiveId(value: unknown) {
  const id = Number(value || 0);
  return Number.isFinite(id) && id > 0 ? id : null;
}

function getPassportVariant(passport: CatalogProductPassport | null): CartVariant | null {
  const config = asPlainRecord(passport?.defaultConfig);
  const groupId = positiveId(config.variant_group_id);
  const valueIndex = config.variant_value_index == null ? null : Number(config.variant_value_index);
  const label = trimText(config.variant_label || passport?.product.default_variant?.variant_label);
  if (!label && !groupId) return null;

  const variantGroup = asPlainRecord(asPlainArray(passport?.variants)[0]);
  return {
    groupId,
    groupTitle: trimText(variantGroup.title || variantGroup.title_label),
    label,
    unit: trimText(variantGroup.unit_short_title || variantGroup.unit_code || variantGroup.unit_title),
    valueIndex: Number.isFinite(valueIndex) ? valueIndex : null,
  };
}

function getPassportIngredients(passport: CatalogProductPassport | null): CartIngredient[] {
  const config = asPlainRecord(passport?.defaultConfig);
  return asPlainArray(config.ingredients)
    .map((item): CartIngredient | null => {
      const source = asPlainRecord(item);
      const quantity = Number(source.quantity ?? source.qty ?? 0);
      const name = trimText(source.name || source.ingredient_name);
      if (!(quantity > 0) || !name) return null;
      return {
        id: positiveId(source.ingredient_id || source.id),
        name,
        quantity,
        unit: trimText(source.unit || source.unit_label || source.unit_short_title || source.unit_title || source.unit_code),
      };
    })
    .filter((item): item is CartIngredient => !!item);
}

function getPassportOptions(passport: CatalogProductPassport | null): CartOptionItem[] {
  const config = asPlainRecord(passport?.defaultConfig);
  return asPlainArray(config.option_items)
    .map((item): CartOptionItem | null => {
      const source = asPlainRecord(item);
      const name = trimText(source.title || source.name);
      if (!name) return null;
      const variantLabel = trimText(source.variant_label);
      return {
        id: positiveId(source.id),
        name,
        quantity: Math.max(1, Number(source.qty ?? source.quantity ?? 1)),
        unitPrice: Math.max(0, Number(source.price || 0)),
        variant: variantLabel ? {
          groupId: positiveId(source.variant_group_id),
          groupTitle: trimText(source.variant_group_title || source.group_title),
          label: variantLabel,
          unit: trimText(source.variant_unit || source.unit),
          valueIndex: source.variant_value_index == null ? null : Number(source.variant_value_index),
        } : null,
      };
    })
    .filter((item): item is CartOptionItem => !!item);
}

function getDefaultOptionTotal(passport: CatalogProductPassport | null) {
  const config = asPlainRecord(passport?.defaultConfig);
  return asPlainArray(config.option_items).reduce<number>((sum, item) => {
    const source = asPlainRecord(item);
    const quantity = Math.max(1, Number(source.qty ?? source.quantity ?? 1));
    const price = Math.max(0, Number(source.price || 0));
    return sum + (Number.isFinite(quantity) ? quantity : 1) * (Number.isFinite(price) ? price : 0);
  }, 0);
}

function getCatalogLinePricing(product: CatalogProduct, passport: CatalogProductPassport | null) {
  const config = asPlainRecord(passport?.defaultConfig);
  const fallbackPrice = getProductPrice(product);
  const overridePrice = Number(config.unit_price_override);
  const configuredPrice = Number(config.unit_price ?? config.variant_unit_price);
  const optionTotal = getDefaultOptionTotal(passport);
  const ingredientDiff = Number(config.ingredient_price_diff || 0);
  const beforeDiscountRaw = Number(config.unit_price_before_discount ?? config.base_unit_price ?? config.variant_unit_price);
  const beforeDiscount = Number.isFinite(beforeDiscountRaw) && beforeDiscountRaw > 0
    ? beforeDiscountRaw + optionTotal + (Number.isFinite(ingredientDiff) ? ingredientDiff : 0)
    : fallbackPrice + optionTotal + (Number.isFinite(ingredientDiff) ? ingredientDiff : 0);
  const configFinal = Number.isFinite(overridePrice) && overridePrice > 0
    ? overridePrice
    : Number.isFinite(configuredPrice) && configuredPrice > 0
      ? configuredPrice + optionTotal + (Number.isFinite(ingredientDiff) ? ingredientDiff : 0)
      : getDiscountedPrice(beforeDiscount, product.discount);
  const unitPrice = roundPrice(configFinal);
  const oldFromProduct = getOldPrice(product);
  const oldUnitPrice = Math.max(
    beforeDiscount > unitPrice ? beforeDiscount : 0,
    oldFromProduct > unitPrice ? oldFromProduct + optionTotal : 0,
  );
  return {
    oldUnitPrice: roundPrice(oldUnitPrice),
    unitPrice,
  };
}

function buildProductQuantitiesFromCart(lines: CartLine[]) {
  return lines.reduce<Record<number, number>>((result, line) => {
    if (line.type !== 'product') return result;
    const productId = Number(line.sourceId || 0);
    if (!Number.isFinite(productId) || productId <= 0) return result;
    result[productId] = (result[productId] || 0) + Math.max(1, Number(line.quantity || 1));
    return result;
  }, {});
}

function buildCatalogProductCartLine(product: CatalogProduct, passport: CatalogProductPassport | null) {
  const { oldUnitPrice, unitPrice } = getCatalogLinePricing(product, passport);
  const variant = getPassportVariant(passport);
  const ingredients = getPassportIngredients(passport);
  const options = getPassportOptions(passport);
  const line = {
    detailLines: getProductDefaultLines(product),
    ingredients,
    isUnavailable: !isAvailable(product.is_available),
    oldUnitPrice: oldUnitPrice > unitPrice ? oldUnitPrice : 0,
    options,
    photoUrl: getProductImage(product),
    quantity: 1,
    sourceId: Number(product.id),
    title: trimText(product.name) || 'Товар',
    type: 'product' as const,
    unitPrice,
    variant,
  } as CartLineDraft;
  return {
    ...line,
    id: makeCartLineId(line),
  };
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

function buildCatalogListItems(catalog: CatalogState, categories: CatalogCategory[]) {
  const items: CatalogListItem[] = [];
  const categoryIndexById = new Map<number, number>();

  categories.forEach((category) => {
    const categoryId = Number(category.id);
    if (!Number.isFinite(categoryId) || categoryId <= 0) return;

    categoryIndexById.set(categoryId, items.length);
    items.push({
      categoryId,
      itemKey: `header-${categoryId}`,
      title: category.title,
      type: 'header',
    });

    const products = catalog.productsByCategory.get(categoryId) || [];
    const combos = catalog.combosByCategory.get(categoryId) || [];
    const cards: CatalogCardItem[] = [
      ...products.map((product) => ({
        cardKey: `product-${categoryId}-${product.id}`,
        categoryId,
        product,
        type: 'product' as const,
      })),
      ...combos.map((combo) => ({
        cardKey: `combo-${categoryId}-${combo.id}`,
        categoryId,
        combo,
        type: 'combo' as const,
      })),
    ];

    if (!cards.length) {
      items.push({
        categoryId,
        itemKey: `empty-${categoryId}`,
        type: 'empty',
      });
      return;
    }

    for (let index = 0; index < cards.length; index += 2) {
      items.push({
        cards: cards.slice(index, index + 2),
        categoryId,
        itemKey: `row-${categoryId}-${index}`,
        type: 'row',
      });
    }
  });

  return { categoryIndexById, items };
}

function buildCatalogItemLayouts(items: CatalogListItem[], screenWidth: number) {
  const contentWidth = Math.max(0, screenWidth - theme.spacing.lg * 2);
  const cardWidth = contentWidth * 0.48;
  const rowLength = Math.ceil(cardWidth / 0.56 + theme.spacing.md);
  const headerLength = 44;
  const emptyLength = 38;
  const layouts: CatalogItemLayout[] = [];
  let offset = 0;

  items.forEach((item, index) => {
    const length = item.type === 'row'
      ? rowLength
      : item.type === 'header'
        ? headerLength
        : emptyLength;
    layouts[index] = { index, length, offset };
    offset += length;
  });

  return layouts;
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
      allowFontScaling={false}
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
  const prepareTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
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
      if (prepareTimer.current) clearTimeout(prepareTimer.current);
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

    if (prepareTimer.current) clearTimeout(prepareTimer.current);
    leaveAnimation.setValue(0);
    enterAnimation.setValue(0);
    const incomingLayer: ComboImageLayer = slideState.activeLayer === 'front' ? 'back' : 'front';
    setSlideState((current) => ({
      ...current,
      [incomingLayer]: { index: nextIndex, url: nextUrl },
      incomingLayer,
      phase: 'ready',
    }));

    prepareTimer.current = setTimeout(() => {
      prepareTimer.current = null;
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
    }, comboRotationPrepareDelayMs);
  }, [activeIndex, enterAnimation, leaveAnimation, nextIndex, nextUrl, photos.length, rotationKey, slideState.activeLayer]);

  if (!currentUrl) return null;

  const getLayerStyle = (layer: ComboImageLayer) => {
    const isActive = layer === slideState.activeLayer;
    const isIncoming = layer === slideState.incomingLayer;
    const isActiveResting = isActive && (slideState.phase === 'idle' || slideState.phase === 'ready');
    const isLeaving = isActive && slideState.phase === 'leaving';
    const isEntering = isIncoming && slideState.phase === 'entering';
    const opacity = isLeaving
      ? leaveAnimation.interpolate({
        inputRange: [0, 1],
        outputRange: [1, 0],
      })
      : isEntering
        ? enterAnimation
        : isActiveResting
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
        : isActiveResting
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
        : isActiveResting
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

function ComboCard({ combo, isAnimatedActive, onPress }: { combo: CatalogCombo; isAnimatedActive: boolean; onPress: () => void }) {
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
    if (!isAnimatedActive) return;
    const urls = Array.from(new Set(imageSets.flat().filter(Boolean)));
    urls.forEach((url) => {
      void Image.prefetch(url);
    });
  }, [imageSets, isAnimatedActive]);

  useEffect(() => {
    if (!isAnimatedActive) return;
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
  }, [imageSets, isAnimatedActive]);

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
  const { width: screenWidth } = useWindowDimensions();
  const listRef = useRef<FlatList<CatalogListItem>>(null);
  const chipsScrollRef = useRef<ScrollView>(null);
  const chipOffsets = useRef(new Map<number, number>());
  const scrollIdleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const programmaticScrollTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const passportWarmTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const passportWarmQueue = useRef<number[]>([]);
  const passportWarmRequestedIds = useRef(new Set<number>());
  const isPassportWarmRunning = useRef(false);
  const programmaticCategoryId = useRef<number | null>(null);
  const [activeCategoryId, setActiveCategoryId] = useState<number | null>(null);
  const [catalog, setCatalog] = useState<CatalogState>(emptyCatalogState);
  const [productQuantities, setProductQuantities] = useState<Record<number, number>>({});
  const [visibleComboKeys, setVisibleComboKeys] = useState<Set<string>>(() => new Set());
  const [isCatalogScrolling, setCatalogScrolling] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [errorText, setErrorText] = useState('');

  const visibleCategories = useMemo(
    () => catalog.categories.filter((category) => Number(category.id) > 0),
    [catalog.categories],
  );
  const { categoryIndexById, items: catalogItems } = useMemo(
    () => buildCatalogListItems(catalog, visibleCategories),
    [catalog, visibleCategories],
  );
  const catalogItemLayouts = useMemo(
    () => buildCatalogItemLayouts(catalogItems, screenWidth),
    [catalogItems, screenWidth],
  );
  const categoryHeaderLayouts = useMemo(
    () => visibleCategories
      .map((category) => {
        const categoryId = Number(category.id);
        const index = categoryIndexById.get(categoryId);
        const layout = index == null ? null : catalogItemLayouts[index];
        return layout && Number.isFinite(categoryId) && categoryId > 0
          ? { categoryId, offset: layout.offset }
          : null;
      })
      .filter((item): item is { categoryId: number; offset: number } => item !== null),
    [catalogItemLayouts, categoryIndexById, visibleCategories],
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

  useFocusEffect(
    useCallback(() => {
      let isActive = true;
      readCartLines().then((cartLines) => {
        if (isActive) setProductQuantities(buildProductQuantitiesFromCart(cartLines));
      }).catch(() => {
        if (isActive) setProductQuantities({});
      });
      return () => {
        isActive = false;
      };
    }, []),
  );

  useEffect(() => () => {
    if (scrollIdleTimer.current) clearTimeout(scrollIdleTimer.current);
    if (programmaticScrollTimer.current) clearTimeout(programmaticScrollTimer.current);
    if (passportWarmTimer.current) clearTimeout(passportWarmTimer.current);
  }, []);

  const runPassportWarmQueue = useCallback(async () => {
    if (isPassportWarmRunning.current) return;
    isPassportWarmRunning.current = true;
    try {
      while (passportWarmQueue.current.length) {
        const batch = passportWarmQueue.current.splice(0, 4);
        await Promise.all(batch.map((productId) => ensureMobileCatalogProductPassport(productId).catch(() => null)));
      }
    } finally {
      isPassportWarmRunning.current = false;
    }
  }, []);

  const scheduleProductPassportWarm = useCallback((productIds: number[]) => {
    productIds.forEach((productId) => {
      if (!Number.isFinite(productId) || productId <= 0 || passportWarmRequestedIds.current.has(productId)) return;
      passportWarmRequestedIds.current.add(productId);
      passportWarmQueue.current.push(productId);
    });
    if (!passportWarmQueue.current.length || passportWarmTimer.current) return;
    passportWarmTimer.current = setTimeout(() => {
      passportWarmTimer.current = null;
      void runPassportWarmQueue();
    }, 120);
  }, [runPassportWarmQueue]);

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
    if (programmaticScrollTimer.current) clearTimeout(programmaticScrollTimer.current);
    programmaticCategoryId.current = categoryId;
    setActiveCategoryId(categoryId);
    const index = categoryIndexById.get(categoryId);
    if (index != null) {
      listRef.current?.scrollToIndex({ animated: true, index, viewOffset: 8 });
      programmaticScrollTimer.current = setTimeout(() => {
        programmaticCategoryId.current = null;
      }, 1200);
    }
  }, [categoryIndexById]);

  useEffect(() => {
    const selectedCategoryId = Number(route.params?.selectedCategoryId || 0);
    if (!Number.isFinite(selectedCategoryId) || selectedCategoryId <= 0) return;
    if (!visibleCategories.some((category) => Number(category.id) === selectedCategoryId)) return;

    const timer = setTimeout(() => scrollToCategoryId(selectedCategoryId), 80);
    return () => clearTimeout(timer);
  }, [route.params?.selectedCategoryId, scrollToCategoryId, visibleCategories]);

  const markCatalogScrolling = useCallback(() => {
    if (scrollIdleTimer.current) clearTimeout(scrollIdleTimer.current);
    setCatalogScrolling(true);
  }, []);

  const scheduleCatalogScrollIdle = useCallback(() => {
    if (scrollIdleTimer.current) clearTimeout(scrollIdleTimer.current);
    scrollIdleTimer.current = setTimeout(() => {
      setCatalogScrolling(false);
      if (programmaticScrollTimer.current) clearTimeout(programmaticScrollTimer.current);
      programmaticCategoryId.current = null;
    }, 180);
  }, []);

  const handleViewableItemsChanged = useRef((info: { viewableItems: Array<ViewToken<CatalogListItem>> }) => {
    const visibleItems = info.viewableItems.map((entry) => entry.item).filter(Boolean);
    const nextComboKeys = new Set<string>();
    const visibleProductIds: number[] = [];
    visibleItems.forEach((item) => {
      if (item.type !== 'row') return;
      item.cards.forEach((card) => {
        if (card.type === 'combo') nextComboKeys.add(card.cardKey);
        if (card.type === 'product') visibleProductIds.push(Number(card.product.id));
      });
    });
    setVisibleComboKeys(nextComboKeys);
    scheduleProductPassportWarm(visibleProductIds);
  }).current;

  const viewabilityConfig = useRef({
    itemVisiblePercentThreshold: 25,
    minimumViewTime: 80,
  }).current;

  const handleCatalogScroll = useCallback((event: { nativeEvent: { contentOffset: { y: number } } }) => {
    if (programmaticCategoryId.current != null) return;

    const activationOffset = event.nativeEvent.contentOffset.y + theme.spacing.lg + 1;
    let nextCategoryId = categoryHeaderLayouts[0]?.categoryId ?? null;

    categoryHeaderLayouts.forEach((item) => {
      if (item.offset <= activationOffset) nextCategoryId = item.categoryId;
    });

    if (nextCategoryId != null) {
      setActiveCategoryId((current) => (current === nextCategoryId ? current : nextCategoryId));
    }
  }, [categoryHeaderLayouts]);

  const increaseProductQuantity = useCallback(async (product: CatalogProduct) => {
    const productId = Number(product.id);
    if (!Number.isFinite(productId) || productId <= 0 || !isAvailable(product.is_available)) return;
    const nextLines = await addCartLine(buildCatalogProductCartLine(product, catalog.productPassports.get(productId) || null));
    void ensureMobileCatalogProductPassport(productId);
    setProductQuantities(buildProductQuantitiesFromCart(nextLines));
  }, [catalog.productPassports]);

  const decreaseProductQuantity = useCallback(async (productId: number) => {
    const lines = await readCartLines();
    const line = [...lines].reverse().find((item) => item.type === 'product' && Number(item.sourceId) === productId);
    if (!line) {
      setProductQuantities(buildProductQuantitiesFromCart(lines));
      return;
    }
    const nextLines = await updateCartLineQuantity(line.id, line.quantity - 1);
    setProductQuantities(buildProductQuantitiesFromCart(nextLines));
  }, []);

  const renderCatalogCard = useCallback((card: CatalogCardItem) => {
    if (card.type === 'product') {
      return (
        <ProductCard
          key={card.cardKey}
          product={card.product}
          quantity={productQuantities[Number(card.product.id)] || 0}
          onDecrease={() => decreaseProductQuantity(Number(card.product.id))}
          onIncrease={() => void increaseProductQuantity(card.product)}
          onPress={() => {
            void ensureMobileCatalogProductPassport(Number(card.product.id));
            navigation.navigate('product', { productId: Number(card.product.id) });
          }}
        />
      );
    }

    return (
      <ComboCard
        key={card.cardKey}
        combo={card.combo}
        isAnimatedActive={visibleComboKeys.has(card.cardKey) && !isCatalogScrolling}
        onPress={() => navigation.navigate('combo', { comboId: Number(card.combo.id), openNonce: Date.now() })}
      />
    );
  }, [
    decreaseProductQuantity,
    increaseProductQuantity,
    isCatalogScrolling,
    navigation,
    productQuantities,
    visibleComboKeys,
  ]);

  const renderCatalogItem = useCallback(({ item }: { item: CatalogListItem }) => {
    if (item.type === 'header') {
      return (
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>{item.title}</Text>
        </View>
      );
    }

    if (item.type === 'empty') {
      return <Text style={styles.emptySection}>В этой категории пока нет товаров</Text>;
    }

    return (
      <View style={styles.grid}>
        {item.cards.map(renderCatalogCard)}
      </View>
    );
  }, [renderCatalogCard]);

  const getCatalogItemLayout = useCallback((_data: ArrayLike<CatalogListItem> | null | undefined, index: number) => {
    const layout = catalogItemLayouts[index];
    return layout || { index, length: 0, offset: 0 };
  }, [catalogItemLayouts]);

  return (
    <Screen edges={['top']}>
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
        <FlatList
          ref={listRef}
          data={catalogItems}
          style={styles.content}
          contentContainerStyle={styles.contentInner}
          getItemLayout={getCatalogItemLayout}
          keyExtractor={(item) => item.itemKey}
          maxToRenderPerBatch={8}
          onMomentumScrollBegin={markCatalogScrolling}
          onMomentumScrollEnd={scheduleCatalogScrollIdle}
          onScroll={handleCatalogScroll}
          onScrollBeginDrag={markCatalogScrolling}
          onScrollEndDrag={scheduleCatalogScrollIdle}
          onScrollToIndexFailed={(info) => {
            const layout = catalogItemLayouts[info.index];
            listRef.current?.scrollToOffset({
              animated: true,
              offset: Math.max(0, layout?.offset ?? info.averageItemLength * info.index),
            });
          }}
          onViewableItemsChanged={handleViewableItemsChanged}
          renderItem={renderCatalogItem}
          removeClippedSubviews
          scrollEventThrottle={80}
          updateCellsBatchingPeriod={50}
          viewabilityConfig={viewabilityConfig}
          windowSize={7}
        />
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
    height: 36,
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
  sectionHeader: {
    backgroundColor: theme.colors.mutedBackground,
    paddingBottom: theme.spacing.md,
    paddingTop: theme.spacing.sm,
    zIndex: 2,
  },
  sectionTitle: {
    color: theme.colors.text,
    fontSize: 20,
    fontWeight: '800',
    lineHeight: 24,
  },
  stateText: {
    color: theme.colors.muted,
    fontSize: 14,
    marginTop: theme.spacing.sm,
    textAlign: 'center',
  },
});
