import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import type { RootStackParamList } from '../../app/navigation/routes';
import type { CatalogComboDetails, UnitConversion } from '../../entities/product';
import { addCartLine, cartLinesToStockCheckItems, getCartLineStockProductIds, makeCartLineId, readCartLines, saveCartLine, type CartComboSelection, type CartIngredient, type CartLine, type CartLineDraft, type CartVariant } from '../../features/cart';
import {
  cloneComboDraft,
  ComboLineCard,
  getComboProductLines,
  getComboProductOldPrice,
  getComboProductPrice,
  getComboProductTitle,
  getComboBlockConfig,
  getComboDraft,
  getComboTotals,
  resetComboDraft,
  saveComboDraft,
} from '../../features/combo-builder';
import { calculateCartStockLimit, getStockProductIdsForLines, useProductStock } from '../../features/stock';
import {
  fetchCatalogComboDetails,
  checkOrderStock,
  getMemoryCatalogComboDetails,
  readCachedCatalogComboDetails,
  resolveAssetUrl,
} from '../../shared/api';
import { theme } from '../../shared/config/theme';
import { formatPrice } from '../../shared/lib/formatPrice';
import { getUnitConversionFactor } from '../../shared/lib/productStock';
import { Screen } from '../../shared/ui/Screen';

import { AppText as Text } from '../../shared/ui';
type ComboPageProps = NativeStackScreenProps<RootStackParamList, 'combo'>;

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? value as Record<string, unknown> : {};
}

function trimText(value: unknown) {
  return String(value || '').trim();
}

function toFiniteNumber(value: unknown, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function toPositiveId(value: unknown) {
  const id = Number(value || 0);
  return Number.isFinite(id) && id > 0 ? id : null;
}

function buildComboSelectionVariant(
  config: ReturnType<typeof getComboBlockConfig> | null,
  product: CatalogComboDetails['blocks'][number]['products'][number] | null,
  unitConversions: UnitConversion[],
): CartVariant | null {
  const preview = product?.preview || null;
  const previewRecord = asRecord(preview);
  const variantGroup = asRecord(Array.isArray(preview?.variants) ? preview.variants[0] : null);
  const values = Array.isArray(variantGroup.values) ? variantGroup.values : [];
  const selectedIndex = config?.variant_value_index ?? preview?.variant_value_index ?? variantGroup.default_value_index ?? null;
  const label = trimText(config?.variant_label || preview?.variant_label);
  const unit = trimText(config?.variant_unit || preview?.variant_unit);
  const sourceUnitId = variantGroup.unit_id;
  const targetUnitId = config?.unit_id ?? preview?.unit_id ?? variantGroup.unit_id;
  const stockQuantity = toFiniteNumber(config?.variant_stock_quantity ?? previewRecord.variant_stock_quantity, 0) > 0
    ? toFiniteNumber(config?.variant_stock_quantity ?? previewRecord.variant_stock_quantity, 0)
    : Number.isFinite(Number(selectedIndex)) && selectedIndex != null && values.length
      ? (() => {
        const numericValue = Number(String(values[Number(selectedIndex)]).replace(',', '.'));
        if (!Number.isFinite(numericValue) || numericValue <= 0) return 0;
        const factor = getUnitConversionFactor(unitConversions, sourceUnitId, targetUnitId);
        return factor == null ? 0 : numericValue * factor;
      })()
      : 0;
  if (!label && !config?.variant_group_id) return null;
  return {
    groupId: config?.variant_group_id ?? null,
    groupTitle: trimText(config?.variant_group_title),
    label,
    quantityInBase: stockQuantity > 0 ? stockQuantity : null,
    stockQuantity: stockQuantity > 0 ? stockQuantity : null,
    unit,
    unitId: toPositiveId(config?.unit_id || preview?.unit_id),
    valueIndex: config?.variant_value_index ?? null,
  };
}

function getIngredientStockQuantity(source: Record<string, unknown>, quantity: number, unitConversions: UnitConversion[]) {
  const explicitStockQuantity = Number(source.stock_quantity ?? source.stockQuantity);
  if (Number.isFinite(explicitStockQuantity) && explicitStockQuantity > 0) return explicitStockQuantity;

  const factor = getUnitConversionFactor(
    unitConversions,
    source.unit_id ?? source.unitId ?? source.ingredient_unit_id ?? source.ingredientUnitId,
    source.ingredient_base_unit_id ?? source.ingredientBaseUnitId ?? source.base_unit_id ?? source.baseUnitId ?? source.stock_unit_id ?? source.stockUnitId,
  );
  return factor == null ? quantity : quantity * factor;
}

function buildComboSelectionIngredients(config: ReturnType<typeof getComboBlockConfig> | null, product: CatalogComboDetails['blocks'][number]['products'][number] | null, unitConversions: UnitConversion[]): CartIngredient[] {
  const preview = product?.preview || null;
  const ingredients = Array.isArray(preview?.ingredients) ? preview.ingredients : [];
  if (ingredients.length) {
    return ingredients
      .map((item): CartIngredient | null => {
        const source = asRecord(item);
        const id = toPositiveId(source.ingredient_id || source.id);
        const quantity = id && config?.ingredient_quantities
          ? toFiniteNumber(config.ingredient_quantities[String(id)], toFiniteNumber(source.quantity ?? source.qty))
          : toFiniteNumber(source.quantity ?? source.qty);
        const name = trimText(source.ingredient_name || source.name || source.title);
        if (!(quantity > 0) || !name) return null;
        return {
          id,
          name,
          quantity,
          stockQuantity: getIngredientStockQuantity(source, quantity, unitConversions),
          unit: trimText(source.unit_short_title || source.unit_label || source.unit_title || source.unit),
          unitId: toPositiveId(source.unit_id || source.ingredient_unit_id),
        };
      })
      .filter((item): item is CartIngredient => !!item);
  }

  return Array.isArray(preview?.ingredients_display)
    ? preview.ingredients_display.map((item): CartIngredient | null => {
      const source = asRecord(item);
      const quantity = toFiniteNumber(source.quantity ?? source.qty);
      const name = trimText(source.name || source.ingredient_name || source.title);
      if (!(quantity > 0) || !name) return null;
      return {
        id: toPositiveId(source.ingredient_id || source.id),
        name,
        quantity,
        stockQuantity: getIngredientStockQuantity(source, quantity, unitConversions),
        unit: trimText(source.unit || source.unit_label || source.unit_short_title || source.unit_title),
        unitId: toPositiveId(source.unit_id || source.ingredient_unit_id),
      };
    }).filter((item): item is CartIngredient => !!item)
    : [];
}

function buildComboSelections(combo: CatalogComboDetails, draft: NonNullable<ReturnType<typeof getComboDraft>>, unitConversions: UnitConversion[]): CartComboSelection[] {
  return combo.blocks
    .map((block, blockIndex): CartComboSelection | null => {
      const selectedIndex = draft.selectedByBlock[String(blockIndex)] ?? 0;
      const product = block.products[selectedIndex] || block.products[0] || null;
      if (!product) return null;
      const config = getComboBlockConfig(draft, blockIndex, product);
      const productName = getComboProductTitle(product, config);
      if (!productName) return null;
      return {
        ingredients: buildComboSelectionIngredients(config, product, unitConversions),
        oldUnitPrice: getComboProductOldPrice(product, config),
        productId: toPositiveId(config?.product_id || product.product_id),
        productName,
        productPhoto: resolveAssetUrl(config?.product_photo || product.product_photo || ''),
        unitPrice: getComboProductPrice(product, config),
        variant: buildComboSelectionVariant(config, product, unitConversions),
      };
    })
    .filter((item): item is CartComboSelection => !!item);
}

export function ComboPage({ navigation, route }: ComboPageProps) {
  const comboId = route.params.comboId;
  const cartLineId = route.params.cartLineId || '';
  const openNonce = route.params.openNonce || 0;
  const { mergeStockRows, refreshMany, stockLevels, unitConversions } = useProductStock();
  const randomizedOpenKeyRef = useRef('');
  const restoredCartLineIdRef = useRef('');
  const [combo, setCombo] = useState<CatalogComboDetails | null>(() => getMemoryCatalogComboDetails(comboId));
  const [draft, setDraft] = useState(() => (combo ? cloneComboDraft(getComboDraft(combo)) : null));
  const [editingLine, setEditingLine] = useState<CartLine | null>(null);
  const [errorText, setErrorText] = useState('');
  const [comboCanSubmit, setComboCanSubmit] = useState(true);
  const [comboCanIncrease, setComboCanIncrease] = useState(true);

  const applyCombo = useCallback((nextCombo: CatalogComboDetails, resetForOpen = false) => {
    const openKey = `${Number(nextCombo.id || 0)}:${openNonce}`;
    const shouldResetDraft = !cartLineId && resetForOpen && randomizedOpenKeyRef.current !== openKey;
    const nextDraft = shouldResetDraft ? resetComboDraft(nextCombo) : getComboDraft(nextCombo);
    if (shouldResetDraft) randomizedOpenKeyRef.current = openKey;
    setCombo(nextCombo);
    setDraft(cloneComboDraft(nextDraft));
  }, [cartLineId, openNonce]);

  useEffect(() => {
    let isMounted = true;

    async function loadCombo() {
      setErrorText('');
      const cached = await readCachedCatalogComboDetails(comboId);
      if (cached && isMounted) {
        applyCombo(cached, true);
        return;
      }

      try {
        const fresh = await fetchCatalogComboDetails(comboId);
        if (isMounted) applyCombo(fresh, true);
      } catch (error) {
        if (!cached && isMounted) setErrorText(error instanceof Error ? error.message : 'Комбо не найдено');
      }
    }

    void loadCombo();

    return () => {
      isMounted = false;
    };
  }, [applyCombo, comboId, openNonce]);

  useFocusEffect(
    useCallback(() => {
      const memory = getMemoryCatalogComboDetails(comboId);
      if (!memory) return;
      const nextDraft = getComboDraft(memory);
      setCombo(memory);
      setDraft(cloneComboDraft(nextDraft));
    }, [comboId]),
  );

  useEffect(() => {
    if (!cartLineId) {
      restoredCartLineIdRef.current = '';
      setEditingLine(null);
      return;
    }
    let isMounted = true;
    readCartLines().then((lines) => {
      if (!isMounted) return;
      setEditingLine(lines.find((line) => line.id === cartLineId && line.type === 'combo') || null);
    }).catch(() => {
      if (isMounted) setEditingLine(null);
    });
    return () => {
      isMounted = false;
    };
  }, [cartLineId]);

  useEffect(() => {
    if (!cartLineId || !combo || !editingLine?.comboDraft || typeof editingLine.comboDraft !== 'object') return;
    if (restoredCartLineIdRef.current === cartLineId) return;
    const restoredDraft = cloneComboDraft(editingLine.comboDraft as ReturnType<typeof getComboDraft>);
    restoredCartLineIdRef.current = cartLineId;
    saveComboDraft(combo.id, restoredDraft);
    setDraft(restoredDraft);
  }, [cartLineId, combo, editingLine]);

  const totals = useMemo(() => getComboTotals(combo, draft), [combo, draft]);

  useEffect(() => {
    if (!combo || !draft) {
      setComboCanSubmit(true);
      setComboCanIncrease(true);
      return undefined;
    }
    const safeCombo = combo;
    const safeDraft = draft;
    let cancelled = false;
    const timer = setTimeout(() => {
      async function syncComboStock() {
        const buildProbeLine = (nextDraft: typeof safeDraft) => {
          const nextTotals = getComboTotals(safeCombo, nextDraft);
          const line = {
            comboDraft: nextDraft,
            comboSelections: buildComboSelections(safeCombo, nextDraft, unitConversions),
            ingredients: [],
            oldUnitPrice: nextTotals.oldPrice > nextTotals.price ? nextTotals.oldPrice / nextTotals.quantity : 0,
            options: [],
            quantity: nextTotals.quantity,
            sourceId: safeCombo.id,
            title: safeCombo.title || 'Комбо',
            type: 'combo',
            unitPrice: nextTotals.price / nextTotals.quantity,
            variant: null,
          } as CartLineDraft;
          return { ...line, id: makeCartLineId(line) } as CartLine;
        };
        const submitLine = buildProbeLine(safeDraft);
        const increaseLine = buildProbeLine({ ...safeDraft, quantity: Math.max(1, safeDraft.quantity + 1) });
        const currentLines = await readCartLines();
        const submitLines = cartLineId
          ? currentLines.map((item) => item.id === cartLineId ? submitLine : item)
          : [...currentLines, submitLine];
        const increaseLines = cartLineId
          ? currentLines.map((item) => item.id === cartLineId ? increaseLine : item)
          : [...currentLines, increaseLine];
        const affectedProductIds = Array.from(new Set([
          ...getStockProductIdsForLines(submitLines, stockLevels),
          ...getStockProductIdsForLines(increaseLines, stockLevels),
        ]));
        const refreshResult = affectedProductIds.length ? await refreshMany(affectedProductIds).catch(() => null) : null;
        const latestStockLevels = refreshResult?.stockLevels || stockLevels;
        const submitLocal = calculateCartStockLimit(submitLines, latestStockLevels, submitLine.id);
        const increaseLocal = calculateCartStockLimit(increaseLines, latestStockLevels, increaseLine.id);
        const [submitCheck, increaseCheck] = await Promise.all([
          submitLocal.canAdd ? checkOrderStock(cartLinesToStockCheckItems(submitLines)).catch(() => null) : Promise.resolve(null),
          increaseLocal.canAdd ? checkOrderStock(cartLinesToStockCheckItems(increaseLines)).catch(() => null) : Promise.resolve(null),
        ]);
        if (cancelled) return;
        if (Array.isArray(submitCheck?.stock_levels)) mergeStockRows(submitCheck.stock_levels);
        if (Array.isArray(increaseCheck?.stock_levels)) mergeStockRows(increaseCheck.stock_levels);
        setComboCanSubmit(submitLocal.canAdd && (submitCheck ? submitCheck.available !== false : false));
        setComboCanIncrease(increaseLocal.canAdd && (increaseCheck ? increaseCheck.available !== false : false));
      }
      void syncComboStock();
    }, 180);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [cartLineId, combo, draft, mergeStockRows, refreshMany, stockLevels, unitConversions]);

  const changeQuantity = async (delta: number) => {
    if (!combo || !draft) return;
    if (delta > 0 && !comboCanIncrease) return;
    const nextDraft = {
      ...draft,
      quantity: Math.max(1, draft.quantity + delta),
    };
    if (delta > 0) {
      const nextTotals = getComboTotals(combo, nextDraft);
      const line = {
        comboDraft: nextDraft,
        comboSelections: buildComboSelections(combo, nextDraft, unitConversions),
        ingredients: [],
        oldUnitPrice: nextTotals.oldPrice > nextTotals.price ? nextTotals.oldPrice / nextTotals.quantity : 0,
        options: [],
        quantity: nextTotals.quantity,
        sourceId: combo.id,
        title: combo.title || 'Комбо',
        type: 'combo',
        unitPrice: nextTotals.price / nextTotals.quantity,
        variant: null,
      } as CartLineDraft;
      const nextLine = {
        ...line,
        id: makeCartLineId(line),
      };
      const currentLines = await readCartLines();
      const nextLinesForCheck = cartLineId
        ? currentLines.map((item) => item.id === cartLineId ? nextLine : item)
        : [...currentLines, nextLine];
      const affectedProductIds = Array.from(new Set([
        ...nextLinesForCheck.flatMap((item) => getCartLineStockProductIds(item)),
        ...getStockProductIdsForLines(nextLinesForCheck, stockLevels),
      ]));
      const refreshResult = affectedProductIds.length ? await refreshMany(affectedProductIds).catch(() => null) : null;
      const latestStockLevels = refreshResult?.stockLevels || stockLevels;
      const localStockLimit = calculateCartStockLimit(nextLinesForCheck, latestStockLevels, nextLine.id);
      if (!localStockLimit.canAdd) return;
    }
    saveComboDraft(combo.id, nextDraft);
    setDraft(nextDraft);
  };

  const addComboToCart = useCallback(async () => {
    if (!combo || !draft || !comboCanSubmit) return;
    const photoUrls: string[] = [];
    const comboSelections = buildComboSelections(combo, draft, unitConversions);
    const detailLines = combo.blocks
      .map((block, blockIndex) => {
        const selectedIndex = draft.selectedByBlock[String(blockIndex)] ?? 0;
        const product = block.products[selectedIndex] || block.products[0] || null;
        const config = getComboBlockConfig(draft, blockIndex, product);
        const title = getComboProductTitle(product, config);
        const lines = getComboProductLines(product, config);
        const photoUrl = resolveAssetUrl(config?.product_photo || product?.product_photo || '');
        if (photoUrl) photoUrls.push(photoUrl);
        return [title, ...lines.slice(0, 1)].filter(Boolean).join(' · ');
      })
      .filter(Boolean);
    const line = {
      comboDraft: draft,
      comboSelections,
      detailLines,
      ingredients: [],
      oldUnitPrice: totals.oldPrice > totals.price ? totals.oldPrice / totals.quantity : 0,
      options: detailLines.map((line, index) => ({
        id: index + 1,
        name: line,
        quantity: 1,
      })),
      photoUrl: resolveAssetUrl(combo.image_thumb || combo.image_url || combo.grid_photos_thumb?.[0] || combo.grid_photos?.[0] || ''),
      photoUrls,
      quantity: totals.quantity,
      sourceId: combo.id,
      title: combo.title || 'Комбо',
      type: 'combo',
      unitPrice: totals.price / totals.quantity,
      variant: null,
    } as CartLineDraft;
    const nextLine = {
      ...line,
      id: makeCartLineId(line),
    };
    const currentLines = await readCartLines();
    const nextLinesForCheck = cartLineId
      ? currentLines.map((item) => item.id === cartLineId ? nextLine : item)
      : [...currentLines, nextLine];
    const affectedProductIds = Array.from(new Set([
      ...nextLinesForCheck.flatMap((item) => getCartLineStockProductIds(item)),
      ...getStockProductIdsForLines(nextLinesForCheck, stockLevels),
    ]));
    const refreshResult = affectedProductIds.length ? await refreshMany(affectedProductIds).catch(() => null) : null;
    const latestStockLevels = refreshResult?.stockLevels || stockLevels;
    const localStockLimit = calculateCartStockLimit(nextLinesForCheck, latestStockLevels, nextLine.id);
    if (!localStockLimit.canAdd) return;
    const stockCheck = await checkOrderStock(cartLinesToStockCheckItems(nextLinesForCheck)).catch(() => null);
    if (Array.isArray(stockCheck?.stock_levels)) mergeStockRows(stockCheck.stock_levels);
    if (stockCheck && stockCheck.available === false) return;
    if (cartLineId) {
      await saveCartLine(nextLine, cartLineId);
      navigation.goBack();
      return;
    }
    await addCartLine(nextLine);
    navigation.navigate('main', { screen: 'cart' });
  }, [cartLineId, combo, comboCanSubmit, draft, mergeStockRows, navigation, refreshMany, stockLevels, totals.oldPrice, totals.price, totals.quantity, unitConversions]);

  if (!combo || !draft) {
    return (
      <Screen>
        <View style={styles.centerState}>
          <Text style={styles.errorTitle}>Комбо не загрузилось</Text>
          <Text style={styles.stateText}>{errorText || 'Данные комбо пока не сохранены в кэше'}</Text>
        </View>
      </Screen>
    );
  }

  return (
    <Screen>
      <View style={styles.root}>
        <ScrollView style={styles.page} contentContainerStyle={styles.comboContent}>
          <View style={styles.comboTitleRow}>
            {Number(combo.discount_percent || 0) > 0 ? (
              <Text style={styles.comboDiscountBadge}>-{Math.round(Number(combo.discount_percent || 0))}%</Text>
            ) : null}
            <Text style={styles.title}>{combo.title}</Text>
          </View>
          {combo.description ? <Text style={styles.subtitle}>{combo.description}</Text> : null}

          <View style={styles.comboBlocks}>
            {combo.blocks.map((block, blockIndex) => {
              const selectedIndex = draft.selectedByBlock[String(blockIndex)] ?? 0;
              const product = block.products[selectedIndex] || block.products[0] || null;
              const config = getComboBlockConfig(draft, blockIndex, product);
              return (
                <View key={`${block.block_id}-${blockIndex}`} style={styles.comboBlockSection}>
                  <ComboLineCard
                    config={config}
                    product={product}
                    showGear={false}
                    onPress={() => navigation.navigate('comboReplace', { blockIndex, blockTitle: block.block_title, comboId })}
                  />
                </View>
              );
            })}
          </View>
        </ScrollView>

        <View style={styles.footer}>
          <View style={styles.footerQty}>
            <Pressable
              disabled={totals.quantity <= 1}
              onPress={() => void changeQuantity(-1)}
              style={[styles.footerQtyButton, totals.quantity <= 1 && styles.footerQtyButtonDisabled]}
            >
              <Ionicons name="remove" color={theme.colors.text} size={16} />
            </Pressable>
            <Text style={styles.footerQtyText}>{totals.quantity}</Text>
            <Pressable
              disabled={!comboCanIncrease}
              onPress={() => void changeQuantity(1)}
              style={[styles.footerQtyButton, !comboCanIncrease && styles.footerQtyButtonDisabled]}
            >
              <Ionicons name="add" color={comboCanIncrease ? theme.colors.text : theme.colors.muted} size={16} />
            </Pressable>
          </View>
          <Pressable disabled={!comboCanSubmit} onPress={addComboToCart} style={[styles.actionButton, !comboCanSubmit && styles.actionButtonDisabled]}>
            <View style={styles.actionPriceRow}>
              <Text style={styles.actionButtonText}>{comboCanSubmit ? formatPrice(totals.price) : 'Больше нет'}</Text>
              {comboCanSubmit && totals.oldPrice > totals.price ? <Text style={styles.actionOldPrice}>{formatPrice(totals.oldPrice)}</Text> : null}
            </View>
            {comboCanSubmit ? <Text style={styles.actionButtonSubText}>{cartLineId ? 'Сохранить' : 'в корзину'}</Text> : null}
          </Pressable>
        </View>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  actionButton: {
    alignItems: 'center',
    backgroundColor: theme.colors.accent,
    borderRadius: theme.radius.pill,
    flex: 1,
    paddingHorizontal: theme.spacing.lg,
    paddingVertical: 9,
  },
  actionButtonDisabled: {
    opacity: 0.55,
  },
  actionButtonSubText: {
    color: theme.colors.primaryText,
    fontSize: 11,
    fontWeight: '900',
    marginTop: -1,
  },
  actionButtonText: {
    color: theme.colors.primaryText,
    fontSize: 16,
    fontWeight: '900',
  },
  actionOldPrice: {
    color: theme.colors.primaryText,
    fontSize: 10,
    fontWeight: '800',
    marginLeft: theme.spacing.sm,
    opacity: 0.75,
    textDecorationLine: 'line-through',
  },
  actionPriceRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'center',
  },
  centerState: {
    alignItems: 'center',
    flex: 1,
    justifyContent: 'center',
    padding: theme.spacing.xl,
  },
  comboBlockSection: {
    marginTop: theme.spacing.md,
  },
  comboBlocks: {
    marginTop: theme.spacing.md,
  },
  comboContent: {
    padding: theme.spacing.lg,
    paddingBottom: 116,
  },
  comboDiscountBadge: {
    backgroundColor: theme.colors.accent,
    borderRadius: theme.radius.pill,
    color: theme.colors.primaryText,
    fontSize: 14,
    fontWeight: '900',
    overflow: 'hidden',
    paddingHorizontal: theme.spacing.md,
    paddingVertical: 7,
  },
  comboTitleRow: {
    alignItems: 'center',
  },
  errorTitle: {
    color: theme.colors.text,
    fontSize: 20,
    fontWeight: '800',
  },
  footer: {
    alignItems: 'center',
    backgroundColor: theme.colors.card,
    borderTopColor: theme.colors.border,
    borderTopWidth: 1,
    bottom: 0,
    flexDirection: 'row',
    gap: theme.spacing.sm,
    justifyContent: 'space-between',
    left: 0,
    paddingHorizontal: theme.spacing.lg,
    paddingVertical: theme.spacing.md,
    position: 'absolute',
    right: 0,
  },
  footerQty: {
    alignItems: 'center',
    backgroundColor: theme.colors.mutedBackground,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.pill,
    borderWidth: 1,
    flexDirection: 'row',
    minWidth: 122,
    padding: 4,
  },
  footerQtyButton: {
    alignItems: 'center',
    height: 42,
    justifyContent: 'center',
    width: 42,
  },
  footerQtyButtonDisabled: {
    opacity: 0.45,
  },
  footerQtyText: {
    color: theme.colors.text,
    flex: 1,
    fontSize: 16,
    fontWeight: '900',
    textAlign: 'center',
  },
  page: {
    backgroundColor: theme.colors.mutedBackground,
    flex: 1,
  },
  root: {
    backgroundColor: theme.colors.mutedBackground,
    flex: 1,
  },
  stateText: {
    color: theme.colors.muted,
    fontSize: 14,
    marginTop: theme.spacing.sm,
    textAlign: 'center',
  },
  subtitle: {
    color: theme.colors.muted,
    fontSize: 14,
    lineHeight: 20,
    marginTop: theme.spacing.sm,
  },
  title: {
    color: theme.colors.text,
    fontSize: 26,
    fontWeight: '900',
    lineHeight: 32,
    marginTop: theme.spacing.sm,
    textAlign: 'center',
  },
});
