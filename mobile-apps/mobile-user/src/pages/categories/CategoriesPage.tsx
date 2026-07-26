import {
  Ionicons } from '@expo/vector-icons';
import { Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import type { RootStackParamList } from '../../app/navigation/routes';
import { routes } from '../../app/navigation/routes';
import { theme } from '../../shared/config/theme';
import { Screen } from '../../shared/ui/Screen';

import { AppText as Text } from '../../shared/ui';
type CategoriesPageProps = NativeStackScreenProps<RootStackParamList, 'categories'>;

export function CategoriesPage({ navigation, route }: CategoriesPageProps) {
  const categories = route.params.categories || [];
  const activeCategoryId = Number(route.params.activeCategoryId || 0);

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.content}>
        {categories.map((category) => {
          const categoryId = Number(category.id);
          const isActive = categoryId === activeCategoryId;

          return (
            <Pressable
              key={category.id}
              style={[styles.row, isActive && styles.rowActive]}
              onPress={() => {
                navigation.navigate('main', {
                  screen: routes.home,
                  params: {
                    selectedCategoryId: categoryId,
                    categorySelectionNonce: Date.now(),
                  },
                });
              }}
            >
              <View style={[styles.icon, isActive && styles.iconActive]}>
                <Ionicons name="pricetag-outline" size={18} color={isActive ? theme.colors.primaryText : theme.colors.muted} />
              </View>
              <Text style={[styles.title, isActive && styles.titleActive]}>{category.title}</Text>
              {isActive ? <Ionicons name="checkmark" size={20} color={theme.colors.accent} /> : null}
            </Pressable>
          );
        })}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: {
    padding: theme.spacing.lg,
  },
  icon: {
    alignItems: 'center',
    backgroundColor: theme.colors.mutedBackground,
    borderRadius: theme.radius.pill,
    height: 36,
    justifyContent: 'center',
    marginRight: theme.spacing.md,
    width: 36,
  },
  iconActive: {
    backgroundColor: theme.colors.accent,
  },
  row: {
    alignItems: 'center',
    backgroundColor: theme.colors.surface,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    flexDirection: 'row',
    marginBottom: theme.spacing.sm,
    padding: theme.spacing.md,
  },
  rowActive: {
    borderColor: theme.colors.accent,
  },
  title: {
    color: theme.colors.text,
    flex: 1,
    fontSize: 16,
    fontWeight: '700',
  },
  titleActive: {
    color: theme.colors.accent,
  },
});
