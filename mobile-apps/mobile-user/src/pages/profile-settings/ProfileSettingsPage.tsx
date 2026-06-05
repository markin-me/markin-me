import {
  useCallback,
  useEffect,
  useMemo,
  useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import * as ImagePicker from 'expo-image-picker';
import {
  ActivityIndicator,
  Image,
  Keyboard,
  Pressable,
  ScrollView,
  StyleSheet,
  TouchableWithoutFeedback,
  View,
} from 'react-native';

import {
  clearCustomerPassport,
  deleteCustomerPhoto,
  logoutCustomer,
  readCachedCustomerPassport,
  resolveAssetUrl,
  saveCustomerPassport,
  updateCustomerMe,
  uploadCustomerPhoto,
  type CustomerPassport,
  type CustomerProfile,
} from '../../shared/api';
import { theme } from '../../shared/config/theme';
import { Screen } from '../../shared/ui/Screen';

import { AppText as Text, AppTextInput as TextInput } from '../../shared/ui';
function normalizePhoneDigits(value: string) {
  let digits = String(value || '').replace(/\D/g, '');
  if (digits.startsWith('8')) digits = `7${digits.slice(1)}`;
  if (digits.length === 10) digits = `7${digits}`;
  return digits.slice(0, 11);
}

function formatPhoneInput(value: string) {
  const digits = normalizePhoneDigits(value);
  const rest = digits.startsWith('7') ? digits.slice(1) : digits;
  const p1 = rest.slice(0, 3);
  const p2 = rest.slice(3, 6);
  const p3 = rest.slice(6, 8);
  const p4 = rest.slice(8, 10);
  let result = '+7';
  if (p1) result += ` (${p1}`;
  if (p1.length === 3) result += ')';
  if (p2) result += ` ${p2}`;
  if (p3) result += `-${p3}`;
  if (p4) result += `-${p4}`;
  return result;
}

function formatPhoneDisplay(value?: string | null) {
  const digits = normalizePhoneDigits(String(value || ''));
  return digits.length === 11 ? formatPhoneInput(digits) : (value || '—');
}

function formatBirthdayInput(value: string) {
  const digits = String(value || '').replace(/\D/g, '').slice(0, 8);
  const day = digits.slice(0, 2);
  const month = digits.slice(2, 4);
  const year = digits.slice(4, 8);
  return [day, month, year].filter(Boolean).join('.');
}

function formatBirthdayDisplay(value?: string | null) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  const iso = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[3]}.${iso[2]}.${iso[1]}`;
  return formatBirthdayInput(raw) || raw;
}

function isValidBirthday(value: string) {
  const match = String(value || '').match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
  if (!match) return false;
  const day = Number(match[1]);
  const month = Number(match[2]);
  const year = Number(match[3]);
  if (year < 1900 || year > new Date().getFullYear()) return false;
  const date = new Date(year, month - 1, day);
  return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day;
}

function getSettingsErrorText(error: unknown) {
  const code = error instanceof Error ? error.message : String(error || '');
  if (code === 'UNAUTHORIZED') return 'Сессия истекла. Войдите снова.';
  if (code === 'BAD_BIRTHDAY' || code === 'BIRTHDAY_REQUIRED') return 'Введите дату рождения в формате дд.мм.гггг.';
  if (code === 'NAME_REQUIRED') return 'Введите имя.';
  if (code === 'AbortError' || code === 'Aborted') return 'Запрос прерван. Проверьте подключение.';
  return 'Не удалось сохранить изменения. Проверьте данные и подключение.';
}

function buildNextPassport(passport: CustomerPassport, customer: CustomerProfile | null): CustomerPassport {
  return {
    ...passport,
    customer,
    updatedAt: new Date().toISOString(),
  };
}

export function ProfileSettingsPage() {
  const navigation = useNavigation();
  const [passport, setPassport] = useState<CustomerPassport | null>(null);
  const [name, setName] = useState('');
  const [birthday, setBirthday] = useState('');
  const [editingName, setEditingName] = useState(false);
  const [editingBirthday, setEditingBirthday] = useState(false);
  const [savingName, setSavingName] = useState(false);
  const [savingBirthday, setSavingBirthday] = useState(false);
  const [photoLoading, setPhotoLoading] = useState(false);
  const [logoutLoading, setLogoutLoading] = useState(false);
  const [errorText, setErrorText] = useState('');

  useEffect(() => {
    let isMounted = true;
    void readCachedCustomerPassport().then((cached) => {
      if (!isMounted) return;
      setPassport(cached);
      setName(cached?.customer?.name || '');
      setBirthday(formatBirthdayDisplay(cached?.customer?.birthday));
    });
    return () => {
      isMounted = false;
    };
  }, []);

  const customer = passport?.customer || null;
  const photo = useMemo(() => resolveAssetUrl(customer?.photo || ''), [customer?.photo]);

  const applyCustomer = useCallback(async (nextCustomer: CustomerProfile | null) => {
    if (!passport) return;
    const nextPassport = buildNextPassport(passport, nextCustomer);
    await saveCustomerPassport(nextPassport);
    setPassport(nextPassport);
  }, [passport]);

  const handleUnauthorized = useCallback(async (error: unknown) => {
    if (error instanceof Error && error.message === 'UNAUTHORIZED') {
      await clearCustomerPassport();
      setPassport(null);
      navigation.goBack();
      return true;
    }
    return false;
  }, [navigation]);

  const handleSaveName = async () => {
    if (!passport) return;
    const nextName = name.trim();
    if (!nextName) {
      setErrorText('Введите имя.');
      return;
    }
    setSavingName(true);
    setErrorText('');
    try {
      await updateCustomerMe(passport.token, { name: nextName });
      await applyCustomer({ ...(customer || { id: 0 }), name: nextName });
      setEditingName(false);
    } catch (error) {
      if (!await handleUnauthorized(error)) setErrorText(getSettingsErrorText(error));
    } finally {
      setSavingName(false);
    }
  };

  const handleSaveBirthday = async () => {
    if (!passport) return;
    const nextBirthday = formatBirthdayInput(birthday);
    if (!isValidBirthday(nextBirthday)) {
      setErrorText('Введите дату рождения в формате дд.мм.гггг.');
      return;
    }
    setSavingBirthday(true);
    setErrorText('');
    try {
      await updateCustomerMe(passport.token, { birthday: nextBirthday });
      setBirthday(nextBirthday);
      await applyCustomer({ ...(customer || { id: 0 }), birthday: nextBirthday });
      setEditingBirthday(false);
    } catch (error) {
      if (!await handleUnauthorized(error)) setErrorText(getSettingsErrorText(error));
    } finally {
      setSavingBirthday(false);
    }
  };

  const handlePickPhoto = async () => {
    if (!passport) return;
    setPhotoLoading(true);
    setErrorText('');
    try {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        setErrorText('Разрешите доступ к фото.');
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        allowsEditing: true,
        aspect: [1, 1],
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        quality: 1,
      });
      if (result.canceled || !result.assets[0]?.uri) return;

      const asset = result.assets[0];
      const photoUrl = await uploadCustomerPhoto(passport.token, {
        name: asset.fileName || 'profile-photo.jpg',
        type: asset.mimeType || 'image/jpeg',
        uri: asset.uri,
      });
      await applyCustomer({ ...(customer || { id: 0 }), photo: photoUrl || customer?.photo || null });
    } catch (error) {
      if (!await handleUnauthorized(error)) setErrorText(getSettingsErrorText(error));
    } finally {
      setPhotoLoading(false);
    }
  };

  const handleDeletePhoto = async () => {
    if (!passport || !customer?.photo) return;
    setPhotoLoading(true);
    setErrorText('');
    try {
      await deleteCustomerPhoto(passport.token);
      await applyCustomer({ ...customer, photo: null });
    } catch (error) {
      if (!await handleUnauthorized(error)) setErrorText(getSettingsErrorText(error));
    } finally {
      setPhotoLoading(false);
    }
  };

  const handleLogout = async () => {
    const token = passport?.token || '';
    setLogoutLoading(true);
    setErrorText('');
    try {
      if (token) await logoutCustomer(token);
    } catch {
      // Local logout still clears stale sessions.
    } finally {
      await clearCustomerPassport();
      setPassport(null);
      setLogoutLoading(false);
      navigation.goBack();
    }
  };

  if (!passport) {
    return (
      <Screen>
        <View style={styles.emptyState}>
          <Text style={styles.emptyTitle}>Профиль не загружен</Text>
          <Text style={styles.emptyText}>Войдите заново во вкладке профиля.</Text>
        </View>
      </Screen>
    );
  }

  return (
    <Screen>
      <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
        <ScrollView
          keyboardShouldPersistTaps="handled"
          style={styles.root}
          contentContainerStyle={styles.content}
        >
          <View style={styles.photoBlock}>
            <Pressable disabled={photoLoading} onPress={handlePickPhoto} style={styles.photoButton}>
              {photo ? (
                <Image source={{ uri: photo }} style={styles.photoImage} />
              ) : (
                <Ionicons name="person-outline" color={theme.colors.accent} size={48} />
              )}
              {photoLoading ? (
                <View style={styles.photoOverlay}>
                  <ActivityIndicator color={theme.colors.primaryText} />
                </View>
              ) : null}
            </Pressable>
            <Pressable disabled={photoLoading} onPress={handlePickPhoto} style={styles.secondaryButton}>
              <Text style={styles.secondaryButtonText}>{photo ? 'Изменить фото' : 'Загрузить фото'}</Text>
            </Pressable>
            {customer?.photo ? (
              <Pressable disabled={photoLoading} onPress={handleDeletePhoto} style={styles.linkButton}>
                <Text style={styles.linkButtonText}>Удалить фото</Text>
              </Pressable>
            ) : null}
          </View>

          {errorText ? <Text style={styles.errorText}>{errorText}</Text> : null}

          <View style={styles.card}>
            <Text style={styles.label}>Имя</Text>
            {editingName ? (
              <View style={styles.editRow}>
                <TextInput
                  editable={!savingName}
                  onChangeText={setName}
                  placeholder="Введите имя"
                  placeholderTextColor={theme.colors.muted}
                  style={styles.input}
                  value={name}
                />
                <Pressable disabled={savingName} onPress={handleSaveName} style={styles.iconButton}>
                  {savingName ? <ActivityIndicator color={theme.colors.primaryText} /> : <Ionicons name="checkmark" color={theme.colors.primaryText} size={22} />}
                </Pressable>
              </View>
            ) : (
              <Pressable onPress={() => setEditingName(true)} style={styles.valueRow}>
                <Text style={styles.valueText}>{customer?.name || '—'}</Text>
                <Ionicons name="pencil" color={theme.colors.muted} size={18} />
              </Pressable>
            )}

            <View style={styles.divider} />

            <Text style={styles.label}>Телефон</Text>
            <Text style={styles.readonlyText}>{formatPhoneDisplay(customer?.phone)}</Text>

            <View style={styles.divider} />

            <Text style={styles.label}>Дата рождения</Text>
            {editingBirthday ? (
              <View style={styles.editRow}>
                <TextInput
                  editable={!savingBirthday}
                  keyboardType="number-pad"
                  maxLength={10}
                  onChangeText={(value) => setBirthday(formatBirthdayInput(value))}
                  placeholder="дд.мм.гггг"
                  placeholderTextColor={theme.colors.muted}
                  style={styles.input}
                  value={birthday}
                />
                <Pressable disabled={savingBirthday} onPress={handleSaveBirthday} style={styles.iconButton}>
                  {savingBirthday ? <ActivityIndicator color={theme.colors.primaryText} /> : <Ionicons name="checkmark" color={theme.colors.primaryText} size={22} />}
                </Pressable>
              </View>
            ) : (
              <Pressable onPress={() => setEditingBirthday(true)} style={styles.valueRow}>
                <Text style={styles.valueText}>{formatBirthdayDisplay(customer?.birthday) || '—'}</Text>
                <Ionicons name="pencil" color={theme.colors.muted} size={18} />
              </Pressable>
            )}
          </View>

          <Pressable disabled={logoutLoading} onPress={handleLogout} style={styles.logoutButton}>
            {logoutLoading ? (
              <ActivityIndicator color={theme.colors.accent} />
            ) : (
              <Text style={styles.logoutButtonText}>Выйти из учетной записи</Text>
            )}
          </Pressable>
        </ScrollView>
      </TouchableWithoutFeedback>
    </Screen>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: theme.colors.card,
    borderRadius: 18,
    padding: theme.spacing.md,
  },
  content: {
    padding: theme.spacing.lg,
    paddingBottom: theme.spacing.xl,
  },
  divider: {
    backgroundColor: theme.colors.border,
    height: 1,
    marginVertical: theme.spacing.md,
  },
  editRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: theme.spacing.sm,
    marginTop: theme.spacing.xs,
  },
  emptyState: {
    alignItems: 'center',
    flex: 1,
    justifyContent: 'center',
    padding: theme.spacing.xl,
  },
  emptyText: {
    color: theme.colors.muted,
    fontSize: 15,
    marginTop: theme.spacing.sm,
    textAlign: 'center',
  },
  emptyTitle: {
    color: theme.colors.text,
    fontSize: 22,
    fontWeight: '900',
  },
  errorText: {
    color: '#dc2626',
    fontSize: 13,
    fontWeight: '700',
    marginBottom: theme.spacing.md,
    textAlign: 'center',
  },
  iconButton: {
    alignItems: 'center',
    backgroundColor: theme.colors.accent,
    borderRadius: theme.radius.pill,
    height: 46,
    justifyContent: 'center',
    width: 46,
  },
  input: {
    backgroundColor: theme.colors.mutedBackground,
    borderColor: theme.colors.border,
    borderRadius: 14,
    borderWidth: 1,
    color: theme.colors.text,
    flex: 1,
    fontSize: 17,
    fontWeight: '800',
    height: 46,
    paddingHorizontal: theme.spacing.md,
  },
  label: {
    color: theme.colors.muted,
    fontSize: 13,
    fontWeight: '700',
  },
  linkButton: {
    marginTop: theme.spacing.sm,
  },
  linkButtonText: {
    color: theme.colors.accent,
    fontSize: 14,
    fontWeight: '800',
  },
  logoutButton: {
    alignItems: 'center',
    borderColor: theme.colors.accent,
    borderRadius: 12,
    borderWidth: 1,
    height: 48,
    justifyContent: 'center',
    marginTop: theme.spacing.lg,
  },
  logoutButtonText: {
    color: theme.colors.accent,
    fontSize: 15,
    fontWeight: '800',
  },
  photoBlock: {
    alignItems: 'center',
    marginBottom: theme.spacing.lg,
  },
  photoButton: {
    alignItems: 'center',
    backgroundColor: theme.colors.card,
    borderColor: '#ffd3b6',
    borderRadius: 28,
    borderWidth: 1,
    height: 132,
    justifyContent: 'center',
    overflow: 'hidden',
    width: 132,
  },
  photoImage: {
    height: '100%',
    width: '100%',
  },
  photoOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    backgroundColor: 'rgba(15, 23, 42, 0.35)',
    justifyContent: 'center',
  },
  readonlyText: {
    color: theme.colors.text,
    fontSize: 17,
    fontWeight: '900',
    marginTop: theme.spacing.xs,
  },
  root: {
    backgroundColor: theme.colors.mutedBackground,
    flex: 1,
  },
  secondaryButton: {
    alignItems: 'center',
    backgroundColor: theme.colors.accent,
    borderRadius: theme.radius.pill,
    height: 44,
    justifyContent: 'center',
    marginTop: theme.spacing.md,
    paddingHorizontal: theme.spacing.lg,
  },
  secondaryButtonText: {
    color: theme.colors.primaryText,
    fontSize: 15,
    fontWeight: '900',
  },
  valueRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: theme.spacing.sm,
    justifyContent: 'space-between',
    marginTop: theme.spacing.xs,
  },
  valueText: {
    color: theme.colors.text,
    flex: 1,
    fontSize: 17,
    fontWeight: '900',
  },
});
