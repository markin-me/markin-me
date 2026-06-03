import { useCallback, useMemo, useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import {
  readCachedCustomerPassport,
  refreshCustomerPassport,
  resolveAssetUrl,
  saveBonusFavoriteCategories,
  type BonusFavoriteCategories,
  type CustomerPassport,
} from '../../shared/api';
import { theme } from '../../shared/config/theme';
import { Screen } from '../../shared/ui/Screen';

function getCurrentLevelId(passport: CustomerPassport | null) {
  const config = passport?.bonusConfig || null;
  const account = config?.account && typeof config.account === 'object' ? config.account : null;
  const levels = Array.isArray(config?.levels) ? config.levels : [];
  const levelId = Number(account?.level_id || account?.bonus_level_id || 0);
  if (levelId > 0) return levelId;
  return Number(levels[0]?.id || 0);
}

function getInitialSelected(favorites: BonusFavoriteCategories | null) {
  return Array.isArray(favorites?.selected_ids)
    ? favorites.selected_ids.map((id) => Number(id || 0)).filter((id) => id > 0)
    : [];
}

export function BonusFavoriteCategoriesPage() {
  const navigation = useNavigation();
  const [passport, setPassport] = useState<CustomerPassport | null>(null);
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [saving, setSaving] = useState(false);
  const [errorText, setErrorText] = useState('');

  useFocusEffect(
    useCallback(() => {
      let isActive = true;
      void readCachedCustomerPassport().then((cached) => {
        if (!isActive) return;
        setPassport(cached);
        setSelectedIds(getInitialSelected(cached?.bonusFavoriteCategories || null));
      });
      return () => {
        isActive = false;
      };
    }, []),
  );

  const favorites = passport?.bonusFavoriteCategories || null;
  const categories = useMemo(() => Array.isArray(favorites?.categories) ? favorites.categories : [], [favorites]);
  const limit = Math.max(0, Math.floor(Number(favorites?.limit || 0)));
  const locked = Boolean(favorites?.locked);
  const remaining = Math.max(0, limit - selectedIds.length);
  const canSave = !locked && categories.length > 0 && selectedIds.length > 0 && selectedIds.length <= limit;
  const footerText = saving
    ? 'Сохраняем...'
    : selectedIds.length <= 0
      ? 'Выберите категории'
      : remaining > 0
        ? `Можно выбрать еще ${remaining}`
        : 'Категории выбраны';

  const toggleCategory = (categoryId: number) => {
    if (locked) return;
    setErrorText('');
    setSelectedIds((current) => {
      if (current.includes(categoryId)) return current.filter((id) => id !== categoryId);
      if (current.length >= limit) return current;
      return [...current, categoryId];
    });
  };

  const handleSave = async () => {
    if (!passport?.token) return;
    if (!selectedIds.length || selectedIds.length > limit) {
      setErrorText('Выберите категории');
      return;
    }
    setSaving(true);
    setErrorText('');
    try {
      await saveBonusFavoriteCategories(passport.token, getCurrentLevelId(passport), selectedIds);
      const fresh = await refreshCustomerPassport(passport.token, passport.customer);
      setPassport(fresh);
      navigation.goBack();
    } catch {
      setErrorText('Не удалось сохранить категории');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Screen>
      <View style={styles.screen}>
      <ScrollView style={styles.root} contentContainerStyle={styles.content}>
        <Text style={styles.note}>{locked ? 'Выбранные категории' : `Можно выбрать: ${remaining || limit}`}</Text>
        {errorText ? <Text style={styles.errorText}>{errorText}</Text> : null}

        {categories.length ? categories.map((category) => {
          const id = Number(category.id || 0);
          const icon = resolveAssetUrl(String(category.icon || ''));
          const selected = selectedIds.includes(id);
          return (
            <Pressable
              key={String(id)}
              onPress={() => toggleCategory(id)}
              style={[styles.categoryCard, selected ? styles.categoryCardSelected : null]}
            >
              <View style={styles.categoryIcon}>
                {icon ? <Image source={{ uri: icon }} style={styles.categoryImage} /> : <Ionicons name="pricetag" color={theme.colors.accent} size={24} />}
              </View>
              <View style={styles.categoryMain}>
                <Text style={styles.categoryTitle}>{String(category.title || '')}</Text>
                <Text style={styles.categoryMeta}>+{Number(category.bonus_percent || favorites?.bonus_percent || 0)}%</Text>
              </View>
              {selected ? <Ionicons name="checkmark-circle" color={theme.colors.accent} size={28} /> : <View style={styles.emptyCircle} />}
            </Pressable>
          );
        }) : <Text style={styles.emptyText}>Категории не настроены</Text>}

      </ScrollView>
      {!locked && categories.length ? (
        <View style={styles.footer}>
          <Pressable onPress={handleSave} disabled={!canSave || saving} style={[styles.saveButton, !canSave || saving ? styles.saveButtonDisabled : null]}>
            <Text style={styles.saveButtonText}>{footerText}</Text>
          </Pressable>
        </View>
      ) : null}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  categoryCard: {
    alignItems: 'center',
    backgroundColor: theme.colors.card,
    borderColor: theme.colors.border,
    borderRadius: 18,
    borderWidth: 1,
    flexDirection: 'row',
    gap: theme.spacing.md,
    marginBottom: theme.spacing.sm,
    padding: theme.spacing.md,
  },
  categoryCardSelected: {
    borderColor: theme.colors.accent,
  },
  categoryIcon: {
    alignItems: 'center',
    backgroundColor: theme.colors.surface,
    borderRadius: 14,
    height: 52,
    justifyContent: 'center',
    overflow: 'hidden',
    width: 52,
  },
  categoryImage: {
    height: '100%',
    width: '100%',
  },
  categoryMain: {
    flex: 1,
  },
  categoryMeta: {
    color: theme.colors.muted,
    fontSize: 13,
    fontWeight: '800',
    marginTop: 2,
  },
  categoryTitle: {
    color: theme.colors.text,
    fontSize: 16,
    fontWeight: '900',
  },
  content: {
    padding: theme.spacing.lg,
    paddingBottom: 110,
  },
  emptyCircle: {
    borderColor: theme.colors.border,
    borderRadius: 14,
    borderWidth: 2,
    height: 28,
    width: 28,
  },
  emptyText: {
    color: theme.colors.muted,
    fontSize: 15,
    fontWeight: '800',
    textAlign: 'center',
  },
  errorText: {
    color: '#dc2626',
    fontSize: 13,
    fontWeight: '800',
    marginBottom: theme.spacing.sm,
  },
  note: {
    color: theme.colors.muted,
    fontSize: 14,
    fontWeight: '900',
    marginBottom: theme.spacing.md,
  },
  root: {
    backgroundColor: theme.colors.mutedBackground,
    flex: 1,
  },
  footer: {
    backgroundColor: theme.colors.card,
    borderTopColor: theme.colors.border,
    borderTopWidth: 1,
    bottom: 0,
    left: 0,
    padding: theme.spacing.lg,
    position: 'absolute',
    right: 0,
  },
  saveButton: {
    alignItems: 'center',
    backgroundColor: theme.colors.accent,
    borderRadius: theme.radius.pill,
    height: 54,
    justifyContent: 'center',
  },
  saveButtonDisabled: {
    opacity: 0.5,
  },
  saveButtonText: {
    color: theme.colors.primaryText,
    fontSize: 16,
    fontWeight: '900',
  },
  screen: {
    flex: 1,
  },
});
