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
import type { CatalogComboDetails } from '../../entities/product';
import { addCartLine, makeCartLineId, readCartLines, saveCartLine, type CartComboSelection, type CartIngredient, type CartLine, type CartLineDraft, type CartVariant } from '../../features/cart';
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
import {
  fetchCatalogComboDetails,
  getMemoryCatalogComboDetails,
  isSameCachedValue,
  readCachedCatalogComboDetails,
  resolveAssetUrl,
} from '../../shared/api';
import { theme } from '../../shared/config/theme';
import { formatPrice } from '../../shared/lib/formatPrice';
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

function buildComboSelectionVariant(config: ReturnType<typeof getComboBlockConfig> | null, product: CatalogComboDetails['blocks'][number]['products'][number] | null): CartVariant | null {
  const preview = product?.preview || null;
  const label = trimText(config?.variant_label || preview?.variant_label);
  const unit = trimText(config?.variant_unit || preview?.variant_unit);
  if (!label && !config?.variant_group_id) return null;
  return {
    groupId: config?.variant_group_id ?? null,
    groupTitle: trimText(config?.variant_group_title),
    label,
    unit,
    valueIndex: config?.variant_value_index ?? null,
  };
}

function buildComboSelectionIngredients(config: ReturnType<typeof getComboBlockConfig> | null, product: CatalogComboDetails['blocks'][number]['products'][number] | null): CartIngredient[] {
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
          unit: trimText(source.unit_short_title || source.unit_label || source.unit_title || source.unit),
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
        unit: trimText(source.unit || source.unit_label || source.unit_short_title || source.unit_title),
      };
    }).filter((item): item is CartIngredient => !!item)
    : [];
}

function buildComboSelections(combo: CatalogComboDetails, draft: NonNullable<ReturnType<typeof getComboDraft>>): CartComboSelection[] {
  return combo.blocks
    .map((block, blockIndex): CartComboSelection | null => {
      const selectedIndex = draft.selectedByBlock[String(blockIndex)] ?? 0;
      const product = block.products[selectedIndex] || block.products[0] || null;
      if (!product) return null;
      const config = getComboBlockConfig(draft, blockIndex, product);
      const productName = getComboProductTitle(product, config);
      if (!productName) return null;
      return {
        ingredients: buildComboSelectionIngredients(config, product),
        oldUnitPrice: getComboProductOldPrice(product, config),
        productId: toPositiveId(config?.product_id || product.product_id),
        productName,
        productPhoto: resolveAssetUrl(config?.product_photo || product.product_photo || ''),
        unitPrice: getComboProductPrice(product, config),
        variant: buildComboSelectionVariant(config, product),
      };
    })
    .filter((item): item is CartComboSelection => !!item);
}

export function ComboPage({ navigation, route }: ComboPageProps) {
  const comboId = route.params.comboId;
  const cartLineId = route.params.cartLineId || '';
  const openNonce = route.params.openNonce || 0;
  const randomizedOpenKeyRef = useRef('');
  const restoredCartLineIdRef = useRef('');
  const [combo, setCombo] = useState<CatalogComboDetails | null>(() => getMemoryCatalogComboDetails(comboId));
  const [draft, setDraft] = useState(() => (combo ? cloneComboDraft(getComboDraft(combo)) : null));
  const [editingLine, setEditingLine] = useState<CartLine | null>(null);
  const [errorText, setErrorText] = useState('');

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
      let appliedInitial = false;
      if (cached && isMounted) {
        applyCombo(cached, true);
        appliedInitial = true;
      }

      try {
        const fresh = await fetchCatalogComboDetails(comboId);
        if (isMounted && !isSameCachedValue(fresh, cached)) applyCombo(fresh, !appliedInitial);
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

  const changeQuantity = (delta: number) => {
    if (!combo || !draft) return;
    const nextDraft = {
      ...draft,
      quantity: Math.max(1, draft.quantity + delta),
    };
    saveComboDraft(combo.id, nextDraft);
    setDraft(nextDraft);
  };

  const addComboToCart = useCallback(async () => {
    if (!combo || !draft) return;
    const photoUrls: string[] = [];
    const comboSelections = buildComboSelections(combo, draft);
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
    if (cartLineId) {
      await saveCartLine(nextLine, cartLineId);
      navigation.goBack();
      return;
    }
    await addCartLine(nextLine);
    navigation.navigate('main', { screen: 'cart' });
  }, [cartLineId, combo, draft, navigation, totals.oldPrice, totals.price, totals.quantity]);

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
              onPress={() => changeQuantity(-1)}
              style={[styles.footerQtyButton, totals.quantity <= 1 && styles.footerQtyButtonDisabled]}
            >
              <Ionicons name="remove" color={theme.colors.text} size={16} />
            </Pressable>
            <Text style={styles.footerQtyText}>{totals.quantity}</Text>
            <Pressable onPress={() => changeQuantity(1)} style={styles.footerQtyButton}>
              <Ionicons name="add" color={theme.colors.text} size={16} />
            </Pressable>
          </View>
          <Pressable onPress={addComboToCart} style={styles.actionButton}>
            <View style={styles.actionPriceRow}>
              <Text style={styles.actionButtonText}>{formatPrice(totals.price)}</Text>
              {totals.oldPrice > totals.price ? <Text style={styles.actionOldPrice}>{formatPrice(totals.oldPrice)}</Text> : null}
            </View>
              <Text style={styles.actionButtonSubText}>{cartLineId ? 'Сохранить' : 'в корзину'}</Text>
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
