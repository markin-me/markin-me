import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import type { RootStackParamList } from '../../app/navigation/routes';
import type { CatalogComboDetails } from '../../entities/product';
import {
  cloneComboDraft,
  ComboLineCard,
  getComboBlockConfig,
  getComboDraft,
  getComboTotals,
  resetComboDraft,
  saveComboDraft,
} from '../../features/combo-builder';
import {
  fetchCatalogComboDetails,
  getMemoryCatalogComboDetails,
  readCachedCatalogComboDetails,
} from '../../shared/api';
import { theme } from '../../shared/config/theme';
import { formatPrice } from '../../shared/lib/formatPrice';
import { Screen } from '../../shared/ui/Screen';

type ComboPageProps = NativeStackScreenProps<RootStackParamList, 'combo'>;

export function ComboPage({ navigation, route }: ComboPageProps) {
  const comboId = route.params.comboId;
  const openNonce = route.params.openNonce || 0;
  const randomizedOpenKeyRef = useRef('');
  const [combo, setCombo] = useState<CatalogComboDetails | null>(() => getMemoryCatalogComboDetails(comboId));
  const [draft, setDraft] = useState(() => (combo ? cloneComboDraft(getComboDraft(combo)) : null));
  const [errorText, setErrorText] = useState('');

  const applyCombo = useCallback((nextCombo: CatalogComboDetails, resetForOpen = false) => {
    const openKey = `${Number(nextCombo.id || 0)}:${openNonce}`;
    const shouldResetDraft = resetForOpen && randomizedOpenKeyRef.current !== openKey;
    const nextDraft = shouldResetDraft ? resetComboDraft(nextCombo) : getComboDraft(nextCombo);
    if (shouldResetDraft) randomizedOpenKeyRef.current = openKey;
    setCombo(nextCombo);
    setDraft(cloneComboDraft(nextDraft));
  }, [openNonce]);

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
        if (isMounted) applyCombo(fresh, !appliedInitial);
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
          <Pressable style={styles.actionButton}>
            <View style={styles.actionPriceRow}>
              <Text style={styles.actionButtonText}>{formatPrice(totals.price)}</Text>
              {totals.oldPrice > totals.price ? <Text style={styles.actionOldPrice}>{formatPrice(totals.oldPrice)}</Text> : null}
            </View>
            <Text style={styles.actionButtonSubText}>в корзину</Text>
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
