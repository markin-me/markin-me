import { useEffect, useMemo, useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import type { RootStackParamList } from '../../app/navigation/routes';
import type { CatalogComboDetails } from '../../entities/product';
import {
  buildComboConfiguredProduct,
  cloneComboDraft,
  ComboLineCard,
  formatComboVariantValue,
  getComboBlockConfig,
  getComboDraft,
  getComboIngredientEditorMeta,
  getComboProductEditorState,
  normalizeComboIngredientQuantity,
  saveComboDraft,
} from '../../features/combo-builder';
import {
  fetchCatalogComboDetails,
  getMemoryCatalogComboDetails,
  readCachedCatalogComboDetails,
} from '../../shared/api';
import { theme } from '../../shared/config/theme';
import { Screen } from '../../shared/ui/Screen';

type ComboReplacePageProps = NativeStackScreenProps<RootStackParamList, 'comboReplace'>;

export function ComboReplacePage({ navigation, route }: ComboReplacePageProps) {
  const { blockIndex, comboId } = route.params;
  const [combo, setCombo] = useState<CatalogComboDetails | null>(() => getMemoryCatalogComboDetails(comboId));
  const [draft, setDraft] = useState(() => (combo ? cloneComboDraft(getComboDraft(combo)) : null));
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [editingIngredientQuantities, setEditingIngredientQuantities] = useState<Record<string, number>>({});
  const [editingVariantIndex, setEditingVariantIndex] = useState<number | null>(null);
  const [errorText, setErrorText] = useState('');

  useEffect(() => {
    let isMounted = true;

    async function loadCombo() {
      const cached = await readCachedCatalogComboDetails(comboId);
      if (cached && isMounted) {
        setCombo(cached);
        setDraft(cloneComboDraft(getComboDraft(cached)));
      }

      try {
        const fresh = await fetchCatalogComboDetails(comboId);
        if (isMounted) {
          setCombo(fresh);
          setDraft(cloneComboDraft(getComboDraft(fresh)));
        }
      } catch (error) {
        if (!cached && isMounted) setErrorText(error instanceof Error ? error.message : 'Блок комбо не найден');
      }
    }

    void loadCombo();

    return () => {
      isMounted = false;
    };
  }, [comboId]);

  const block = combo?.blocks[blockIndex] || null;
  const selectedIndex = draft?.selectedByBlock[String(blockIndex)] ?? 0;
  const orderedProducts = useMemo(() => {
    const products = Array.isArray(block?.products) ? block.products : [];
    return products
      .map((product, index) => ({ index, product }))
      .sort((left, right) => {
        if (left.index === selectedIndex) return -1;
        if (right.index === selectedIndex) return 1;
        return left.index - right.index;
      });
  }, [block?.products, selectedIndex]);

  const selectProduct = (index: number) => {
    if (!combo || !draft) return;
    const nextDraft = {
      ...draft,
      configuredByBlock: {
        ...draft.configuredByBlock,
      },
      selectedByBlock: {
        ...draft.selectedByBlock,
        [String(blockIndex)]: index,
      },
    };
    delete nextDraft.configuredByBlock[String(blockIndex)];
    saveComboDraft(combo.id, nextDraft);
    setDraft(nextDraft);
    navigation.goBack();
  };

  const openProductConfig = (index: number) => {
    const product = block?.products[index];
    if (!product) return;
    const config = getComboBlockConfig(draft, blockIndex, product);
    const editorState = getComboProductEditorState(product, config);
    setEditingIndex((current) => current === index ? null : index);
    setEditingIngredientQuantities(editorState.ingredientQuantities);
    setEditingVariantIndex(editorState.variantIndex);
  };

  const updateEditingIngredient = (item: unknown, delta: number) => {
    const meta = getComboIngredientEditorMeta(item);
    if (!meta.id) return;
    setEditingIngredientQuantities((current) => {
      const previous = current[String(meta.id)] ?? meta.limits.defaultQty;
      return {
        ...current,
        [String(meta.id)]: normalizeComboIngredientQuantity(previous + delta * meta.limits.step, item),
      };
    });
  };

  const confirmProductConfig = (index: number) => {
    if (!combo || !draft || !block) return;
    const product = block.products[index];
    if (!product) return;
    const configured = buildComboConfiguredProduct(product, Number(combo.discount_percent || 0), editingVariantIndex, editingIngredientQuantities);
    const nextDraft = {
      ...draft,
      configuredByBlock: {
        ...draft.configuredByBlock,
        [String(blockIndex)]: configured,
      },
      selectedByBlock: {
        ...draft.selectedByBlock,
        [String(blockIndex)]: index,
      },
    };
    saveComboDraft(combo.id, nextDraft);
    setDraft(nextDraft);
    setEditingIndex(null);
    navigation.goBack();
  };

  if (!combo || !block) {
    return (
      <Screen>
        <View style={styles.centerState}>
          <Text style={styles.errorTitle}>Блок не загрузился</Text>
          <Text style={styles.stateText}>{errorText || 'Данные блока пока не сохранены в кэше'}</Text>
        </View>
      </Screen>
    );
  }

  return (
    <Screen>
      <View style={styles.root}>
        <ScrollView style={styles.page} contentContainerStyle={styles.comboReplaceContent}>
          <View style={styles.comboReplaceList}>
            {orderedProducts.map(({ index, product }) => {
              const selected = index === selectedIndex;
              const config = getComboBlockConfig(draft, blockIndex, product);
              const liveConfig = editingIndex === index
                ? buildComboConfiguredProduct(product, Number(combo.discount_percent || 0), editingVariantIndex, editingIngredientQuantities)
                : config;
              return (
                <View key={`${product.product_id}-${index}`}>
                  <ComboLineCard
                    config={liveConfig}
                    onGearPress={() => openProductConfig(index)}
                    product={product}
                    selected={selected}
                    showSelectedCheck={false}
                    showReplace={false}
                    onPress={() => selectProduct(index)}
                  />
                  {editingIndex === index ? (() => {
                    const editorState = getComboProductEditorState(product, config);
                    const variantGroup = editorState.variants[0] && typeof editorState.variants[0] === 'object'
                      ? editorState.variants[0] as Record<string, unknown>
                      : null;
                    const variantValues = Array.isArray(variantGroup?.values) ? variantGroup.values : [];
                    const variantUnit = variantGroup?.unit_short_title || variantGroup?.unit_code || variantGroup?.unit_title;
                    return (
                      <View style={styles.inlineEditor}>
                        {variantGroup && variantValues.length > 1 ? (
                          <View style={styles.editorSection}>
                            <Text style={styles.editorTitle}>{String(variantGroup.title || 'Варианты')}</Text>
                            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                              {variantValues.map((value, valueIndex) => {
                                const active = editingVariantIndex === valueIndex;
                                const label = formatComboVariantValue(value, variantUnit);
                                return (
                                  <Pressable
                                    key={`${label}-${valueIndex}`}
                                    onPress={() => setEditingVariantIndex(valueIndex)}
                                    style={[styles.editorChip, active && styles.editorChipActive]}
                                  >
                                    <Text style={[styles.editorChipText, active && styles.editorChipTextActive]}>{label}</Text>
                                  </Pressable>
                                );
                              })}
                            </ScrollView>
                          </View>
                        ) : null}

                        {editorState.ingredients.length ? (
                          <View style={styles.editorSection}>
                            <Text style={styles.editorTitle}>Состав</Text>
                            {editorState.ingredients.map((item) => {
                              const meta = getComboIngredientEditorMeta(item);
                              if (!meta.id) return null;
                              const value = editingIngredientQuantities[String(meta.id)] ?? meta.limits.defaultQty;
                              const canDecrease = meta.limits.isVariable && value > meta.limits.min;
                              const canIncrease = meta.limits.isVariable && value < meta.limits.max;
                              return (
                                <View key={meta.id} style={styles.ingredientEditorRow}>
                                  <Text numberOfLines={2} style={styles.ingredientEditorTitle}>{meta.title}</Text>
                                  <View style={styles.ingredientStepper}>
                                    <Pressable
                                      disabled={!canDecrease}
                                      onPress={() => updateEditingIngredient(item, -1)}
                                      style={[styles.ingredientStepperButton, !canDecrease && styles.ingredientStepperButtonDisabled]}
                                    >
                                      <Ionicons name="remove" color={theme.colors.primaryText} size={14} />
                                    </Pressable>
                                    <Text style={styles.ingredientStepperValue}>
                                      {String(value).replace('.', ',')}{meta.unit ? ` ${meta.unit}` : ''}
                                    </Text>
                                    <Pressable
                                      disabled={!canIncrease}
                                      onPress={() => updateEditingIngredient(item, 1)}
                                      style={[styles.ingredientStepperButton, !canIncrease && styles.ingredientStepperButtonDisabled]}
                                    >
                                      <Ionicons name="add" color={theme.colors.primaryText} size={14} />
                                    </Pressable>
                                  </View>
                                </View>
                              );
                            })}
                          </View>
                        ) : null}

                        <Pressable style={styles.confirmButton} onPress={() => confirmProductConfig(index)}>
                          <Ionicons name="checkmark" color={theme.colors.primaryText} size={20} />
                        </Pressable>
                      </View>
                    );
                  })() : null}
                </View>
              );
            })}
          </View>
        </ScrollView>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  centerState: {
    alignItems: 'center',
    flex: 1,
    justifyContent: 'center',
    padding: theme.spacing.xl,
  },
  comboReplaceContent: {
    padding: theme.spacing.lg,
    paddingBottom: theme.spacing.xl,
  },
  comboReplaceList: {
    marginTop: theme.spacing.lg,
  },
  confirmButton: {
    alignItems: 'center',
    alignSelf: 'flex-end',
    backgroundColor: theme.colors.accent,
    borderRadius: theme.radius.pill,
    height: 42,
    justifyContent: 'center',
    marginTop: theme.spacing.md,
    width: 42,
  },
  editorChip: {
    backgroundColor: theme.colors.mutedBackground,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.pill,
    borderWidth: 1,
    marginRight: theme.spacing.sm,
    paddingHorizontal: theme.spacing.lg,
    paddingVertical: theme.spacing.sm,
  },
  editorChipActive: {
    backgroundColor: theme.colors.accent,
    borderColor: theme.colors.accent,
  },
  editorChipText: {
    color: theme.colors.text,
    fontSize: 14,
    fontWeight: '800',
  },
  editorChipTextActive: {
    color: theme.colors.primaryText,
  },
  editorSection: {
    marginBottom: theme.spacing.md,
  },
  editorTitle: {
    color: theme.colors.text,
    fontSize: 14,
    fontWeight: '900',
    marginBottom: theme.spacing.sm,
  },
  errorTitle: {
    color: theme.colors.text,
    fontSize: 20,
    fontWeight: '800',
  },
  ingredientEditorRow: {
    alignItems: 'center',
    borderColor: theme.colors.border,
    borderRadius: 14,
    borderWidth: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: theme.spacing.sm,
    padding: theme.spacing.sm,
  },
  ingredientEditorTitle: {
    color: theme.colors.text,
    flex: 1,
    fontSize: 14,
    fontWeight: '800',
    paddingRight: theme.spacing.md,
  },
  ingredientStepper: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: theme.spacing.sm,
  },
  ingredientStepperButton: {
    alignItems: 'center',
    backgroundColor: theme.colors.accent,
    borderRadius: theme.radius.pill,
    height: 30,
    justifyContent: 'center',
    width: 30,
  },
  ingredientStepperButtonDisabled: {
    opacity: 0.35,
  },
  ingredientStepperValue: {
    color: theme.colors.text,
    fontSize: 13,
    fontWeight: '900',
    minWidth: 58,
    textAlign: 'center',
  },
  inlineEditor: {
    backgroundColor: theme.colors.card,
    borderColor: theme.colors.border,
    borderRadius: 16,
    borderWidth: 1,
    marginBottom: theme.spacing.md,
    marginTop: -theme.spacing.sm,
    padding: theme.spacing.md,
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
});
