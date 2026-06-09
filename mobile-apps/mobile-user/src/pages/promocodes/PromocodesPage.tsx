import { useCallback, useEffect, useMemo, useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';

import {
  attachCheckoutPromo,
  fetchCheckoutBenefitsPreview,
  fetchCustomerBenefits,
  isSameCachedValue,
  readCachedCustomerBenefits,
  readCachedCustomerPassport,
  type CustomerBenefitCard,
} from '../../shared/api';
import {
  readCheckoutPromoCode,
  readFulfillmentSelection,
  saveCheckoutPromoCode,
} from '../../features/checkout';
import { readCartLines, type CartLine } from '../../features/cart';
import { theme } from '../../shared/config/theme';
import { calculateBuyXGetYLineTotals } from '../../shared/lib/buyXGetY';
import { AppText as Text, Screen } from '../../shared/ui';

function asText(value: unknown) {
  return String(value || '').trim();
}

function formatPromoBadge(item: CustomerBenefitCard) {
  const direct = asText(item.badge_text);
  if (direct) return direct;

  const value = Number(item.discount_value ?? item.amount ?? 0);
  if (!(value > 0)) return '';

  const type = asText(item.discount_type).toLowerCase();
  if (type === 'percent') return `-${Math.round(value)}%`;
  return `-${Math.round(value).toLocaleString('ru-RU')} ₽`;
}

function isVisiblePromo(item: CustomerBenefitCard) {
  const usageLimit = Number(item.usage_limit || 0);
  const usageCount = Number(item.usage_count || 0);
  return usageLimit <= 0 || usageCount < usageLimit;
}

function roundPrice(value: unknown) {
  const number = Number(value || 0);
  if (!Number.isFinite(number)) return 0;
  return Math.round(number * 100) / 100;
}

function getLineTotals(line: CartLine) {
  return calculateBuyXGetYLineTotals({
    badge: line.type === 'product' ? line.buyXGetYBadge || null : null,
    oldUnitPrice: Number(line.oldUnitPrice || 0),
    quantity: Math.max(1, Number(line.quantity || 1)),
    unitPrice: Math.max(0, Number(line.unitPrice || 0)),
  });
}

function buildPromocodePreviewItems(lines: CartLine[]) {
  return lines.filter((line) => line.isUnavailable !== true).map((line) => {
    const quantity = Math.max(1, Number(line.quantity || 1));
    const totals = getLineTotals(line);
    const lineTotal = roundPrice(totals.total);
    const oldLineTotal = roundPrice(Math.max(lineTotal, totals.oldTotal));
    const variantGroupId = Number(line.variant?.groupId || 0);
    const variantValueIndex = Number(line.variant?.valueIndex);
    const baseItem: Record<string, unknown> = {
      buy_x_get_y_badge: line.type === 'product' && line.buyXGetYBadge ? line.buyXGetYBadge : null,
      cart_key: line.id,
      line_total: lineTotal,
      old_line_total: oldLineTotal,
      qty: quantity,
      type: line.type,
    };

    if (line.type === 'combo') {
      return {
        ...baseItem,
        combo_id: Number(line.sourceId || 0) || null,
        combo_title: line.title,
      };
    }

    return {
      ...baseItem,
      ingredients: (Array.isArray(line.ingredients) ? line.ingredients : []).map((ingredient) => ({
        ingredient_id: Number(ingredient.id || 0) || null,
        qty: Number(ingredient.quantity || 0) || 0,
      })).filter((ingredient) => Number(ingredient.ingredient_id || 0) > 0),
      option_items: (Array.isArray(line.options) ? line.options : []).map((option) => {
        const optionVariantGroupId = Number(option.variant?.groupId || 0);
        const optionVariantValueIndex = Number(option.variant?.valueIndex);
        return {
          id: Number(option.id || 0) || null,
          qty: Math.max(1, Number(option.quantity || 1)),
          variant_group_id: optionVariantGroupId > 0 ? optionVariantGroupId : null,
          variant_value_index: Number.isFinite(optionVariantValueIndex) && optionVariantValueIndex >= 0
            ? optionVariantValueIndex
            : null,
        };
      }).filter((option) => Number(option.id || 0) > 0),
      product_id: Number(line.sourceId || 0) || null,
      product_name: line.title,
      variant_group_id: variantGroupId > 0 ? variantGroupId : null,
      variant_value_index: Number.isFinite(variantValueIndex) && variantValueIndex >= 0 ? variantValueIndex : null,
    };
  });
}

function PromocodeCard({ item, onApply }: { item: CustomerBenefitCard; onApply?: (item: CustomerBenefitCard) => void }) {
  const code = asText(item.code) || '—';
  const title = asText(item.title) || 'Уникальная скидка по промокоду';
  const badgeText = formatPromoBadge(item);
  const disabledReason = asText(item.disabled_reason) || asText(item.disabled_reason_text);
  const isSelected = item.is_selected === true;
  const isApplicable = item.is_applicable !== false;
  const isDisabled = !isSelected && !isApplicable;
  const reasonText = isSelected
    ? 'Промокод активен.'
    : isApplicable
      ? asText(item.progress_text) || asText(item.status_text) || asText(item.apply_scope_text) || 'Можно применить к текущему заказу.'
      : disabledReason;

  return (
    <View style={styles.card}>
      <View style={styles.cardTop}>
        <Text style={styles.cardTitle}>{title}</Text>
        <View style={styles.badges}>
          {badgeText ? (
            <View style={styles.discountBadge}>
              <Text style={styles.discountBadgeText}>{badgeText}</Text>
            </View>
          ) : null}
          <View style={styles.linkBadge}>
            <Ionicons name="link" color={theme.colors.primaryText} size={15} />
          </View>
        </View>
      </View>

      <View style={styles.cardBottom}>
        <Text numberOfLines={1} adjustsFontSizeToFit style={styles.codeText}>{code}</Text>
        <Pressable
          disabled={isDisabled}
          onPress={() => onApply?.(item)}
          style={[
            styles.applyButton,
            isDisabled && styles.applyButtonDisabled,
            isSelected && styles.applyButtonSelected,
          ]}
        >
          <Text style={[
            styles.applyButtonText,
            isDisabled && styles.applyButtonTextDisabled,
            isSelected && styles.applyButtonTextSelected,
          ]}>
            {isSelected ? 'Активен' : 'Применить'}
          </Text>
        </Pressable>
      </View>

      {reasonText ? (
        <Text style={[styles.disabledReason, isApplicable && styles.availableReason]}>{reasonText}</Text>
      ) : null}
    </View>
  );
}

export function PromocodesPage() {
  const [items, setItems] = useState<CustomerBenefitCard[]>([]);
  const [isLoading, setLoading] = useState(true);
  const [errorText, setErrorText] = useState('');
  const [activeCode, setActiveCode] = useState('');

  const loadPromocodes = useCallback(async () => {
    setErrorText('');
    try {
      const passport = await readCachedCustomerPassport();
      if (!passport?.token) {
        setItems([]);
        setErrorText('Войдите в профиль, чтобы увидеть промокоды.');
        setLoading(false);
        return;
      }
      const [cachedBenefits, savedCode, cartLines, fulfillmentSelection] = await Promise.all([
        readCachedCustomerBenefits(passport.token),
        readCheckoutPromoCode().catch(() => ''),
        readCartLines().catch(() => []),
        readFulfillmentSelection(),
      ]);
      const cachedItems = (Array.isArray(cachedBenefits?.promo_codes) ? cachedBenefits.promo_codes : []).filter(isVisiblePromo);
      setActiveCode(savedCode);
      if (cachedBenefits) {
        setItems(cachedItems);
        setLoading(false);
      }
      const previewPayload = {
        items: buildPromocodePreviewItems(cartLines),
        method_code: fulfillmentSelection.mode === 'delivery' ? 'delivery' : 'takeaway',
        promo_code: savedCode || null,
        selected_promo_source: savedCode ? 'promo_code' : null,
      };
      const [benefits, preview] = await Promise.all([
        fetchCustomerBenefits(passport.token),
        fetchCheckoutBenefitsPreview(passport.token, previewPayload).catch(() => null),
      ]);
      const previewItems = Array.isArray(preview?.promo_codes) ? preview.promo_codes : [];
      const sourceItems = previewItems.length ? previewItems : benefits.promo_codes;
      const freshItems = (Array.isArray(sourceItems) ? sourceItems : []).filter(isVisiblePromo);
      if (!isSameCachedValue(freshItems, cachedItems)) setItems(freshItems);
    } catch (error) {
      setErrorText(error instanceof Error ? error.message : 'Не удалось загрузить промокоды.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadPromocodes();
  }, [loadPromocodes]);

  const applyPromoCode = useCallback(async (item: CustomerBenefitCard) => {
    const code = asText(item.code).toUpperCase();
    if (!code) return;
    if (activeCode === code) {
      await saveCheckoutPromoCode('');
      setActiveCode('');
      setItems((current) => current.map((row) => ({ ...row, is_selected: false })));
      return;
    }
    const passport = await readCachedCustomerPassport();
    if (!passport?.token) {
      setErrorText('Войдите в профиль, чтобы применить промокод.');
      return;
    }
    setErrorText('');
    try {
      await attachCheckoutPromo(passport.token, code);
      await saveCheckoutPromoCode(code);
      setActiveCode(code);
      setItems((current) => current.map((row) => ({
        ...row,
        is_selected: asText(row.code).toUpperCase() === code,
      })));
    } catch (error) {
      setErrorText(error instanceof Error ? error.message : 'Не удалось применить промокод.');
    }
  }, [activeCode]);

  const countText = useMemo(() => String(items.length), [items.length]);

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <View style={styles.countBadge}>
            <Text style={styles.countText}>{countText}</Text>
          </View>
        </View>

        {isLoading ? (
          <View style={styles.stateCard}>
            <ActivityIndicator color={theme.colors.accent} />
            <Text style={styles.stateText}>Загрузка…</Text>
          </View>
        ) : null}

        {errorText ? <Text style={styles.errorText}>{errorText}</Text> : null}

        {!isLoading && !errorText && !items.length ? (
          <View style={styles.stateCard}>
            <Text style={styles.stateText}>У вас пока нет доступных промокодов</Text>
          </View>
        ) : null}

        {!isLoading && !errorText && items.length ? (
          <View style={styles.list}>
            {items.map((item, index) => (
              <PromocodeCard
                key={`${item.id || item.code || index}`}
                item={{
                  ...item,
                  is_selected: asText(item.code).toUpperCase() === activeCode || item.is_selected === true,
                }}
                onApply={applyPromoCode}
              />
            ))}
          </View>
        ) : null}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  applyButton: {
    alignItems: 'center',
    backgroundColor: theme.colors.accent,
    borderRadius: 14,
    height: 40,
    justifyContent: 'center',
    minWidth: 118,
    paddingHorizontal: 16,
  },
  applyButtonText: {
    color: theme.colors.primaryText,
    fontSize: 14,
    fontWeight: '900',
  },
  applyButtonDisabled: {
    backgroundColor: '#f2f3f5',
  },
  applyButtonTextDisabled: {
    color: '#4b5563',
  },
  applyButtonSelected: {
    backgroundColor: '#fff1e8',
  },
  applyButtonTextSelected: {
    color: theme.colors.accent,
  },
  badges: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 6,
  },
  card: {
    backgroundColor: theme.colors.surface,
    borderColor: '#dfe3e8',
    borderRadius: 14,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  cardBottom: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 12,
    marginTop: 10,
  },
  cardTitle: {
    color: theme.colors.text,
    flex: 1,
    fontSize: 15,
    fontWeight: '900',
    lineHeight: 20,
  },
  cardTop: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: 10,
  },
  codeText: {
    color: theme.colors.text,
    flex: 1,
    fontSize: 24,
    fontWeight: '900',
    letterSpacing: 0,
  },
  content: {
    backgroundColor: '#f3f4f6',
    flexGrow: 1,
    padding: 12,
    paddingBottom: theme.spacing.xl,
  },
  countBadge: {
    alignItems: 'center',
    backgroundColor: '#eef0f3',
    borderColor: '#d8dde3',
    borderRadius: theme.radius.pill,
    borderWidth: 1,
    height: 28,
    justifyContent: 'center',
    minWidth: 28,
    paddingHorizontal: 8,
  },
  countText: {
    color: '#4b5563',
    fontSize: 13,
    fontWeight: '900',
  },
  disabledReason: {
    color: '#667085',
    fontSize: 15,
    fontWeight: '600',
    lineHeight: 20,
    marginTop: 10,
  },
  availableReason: {
    color: '#15803d',
  },
  discountBadge: {
    alignItems: 'center',
    backgroundColor: theme.colors.accent,
    borderRadius: theme.radius.pill,
    minHeight: 26,
    paddingHorizontal: 10,
    justifyContent: 'center',
  },
  discountBadgeText: {
    color: theme.colors.primaryText,
    fontSize: 13,
    fontWeight: '900',
  },
  errorText: {
    color: theme.colors.danger,
    fontSize: 13,
    fontWeight: '800',
    lineHeight: 18,
  },
  header: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8,
    justifyContent: 'flex-end',
    marginBottom: 10,
  },
  linkBadge: {
    alignItems: 'center',
    backgroundColor: theme.colors.accent,
    borderRadius: theme.radius.pill,
    height: 26,
    justifyContent: 'center',
    width: 26,
  },
  list: {
    gap: 10,
  },
  stateCard: {
    alignItems: 'center',
    backgroundColor: theme.colors.surface,
    borderColor: '#dfe3e8',
    borderRadius: 14,
    borderWidth: 1,
    gap: theme.spacing.sm,
    padding: theme.spacing.xl,
  },
  stateText: {
    color: theme.colors.muted,
    fontSize: 14,
    fontWeight: '800',
    textAlign: 'center',
  },
});
