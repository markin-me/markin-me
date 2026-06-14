import {
  useCallback,
  useEffect,
  useMemo,
  useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import * as Brightness from 'expo-brightness';
import { useFocusEffect,
  useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { ActivityIndicator,
  Image,
  Keyboard,
  Pressable,
  RefreshControl,
  ScrollView,
  Share,
  StyleSheet,
  TouchableWithoutFeedback,
  View,
} from 'react-native';
import QRCode from 'react-native-qrcode-svg';

import {
  authLogin,
  authMessengerCodeSend,
  authMessengerCodeVerify,
  authPhoneStatus,
  clearCustomerPassport,
  readCachedCustomerPassport,
  refreshCustomerPassport,
  resolveAssetUrl,
  saveCustomerPassport,
  type BonusConfig,
  type BonusFavoriteCategories,
  type BonusReferrals,
  type CustomerPassport,
  type CustomerProfile,
} from '../../shared/api';
import { ensureCheckoutBenefitsState } from '../../features/checkout';
import { theme } from '../../shared/config/theme';
import { BottomSheet } from '../../shared/ui/BottomSheet';
import { Screen } from '../../shared/ui/Screen';
import { routes, type RootStackParamList } from '../../app/navigation/routes';

import { AppText as Text, AppTextInput as TextInput } from '../../shared/ui';
type AuthStep = 'phone' | 'birthday' | 'code';
const PROFILE_PASSPORT_FRESH_MS = 5 * 60 * 1000;

function isFreshPassport(passport: CustomerPassport) {
  const updatedAtMs = Date.parse(passport.updatedAt || '');
  return Number.isFinite(updatedAtMs) && Date.now() - updatedAtMs < PROFILE_PASSPORT_FRESH_MS;
}

function normalizePhoneDigits(value: string) {
  let digits = String(value || '').replace(/\D/g, '');
  if (digits.startsWith('8')) digits = `7${digits.slice(1)}`;
  if (digits.length === 10) digits = `7${digits}`;
  return digits.slice(0, 11);
}

function getPhoneTail(value: string) {
  const digits = String(value || '').replace(/\D/g, '');
  const normalized = digits.startsWith('8') ? `7${digits.slice(1)}` : digits;
  const rest = normalized.startsWith('7') ? normalized.slice(1) : normalized;
  return rest.slice(0, 10);
}

function formatPhoneTail(value: string) {
  const rest = String(value || '').replace(/\D/g, '').slice(0, 10);
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

function formatPhoneInput(value: string) {
  return formatPhoneTail(getPhoneTail(value));
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
  if (!raw) return '—';
  const iso = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[3]}.${iso[2]}.${iso[1]}`;
  return formatBirthdayInput(raw) || raw;
}

function formatPhoneDisplay(value?: string | null) {
  const digits = normalizePhoneDigits(String(value || ''));
  return digits.length === 11 ? formatPhoneInput(digits) : (value || '—');
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

function getAuthErrorText(error: unknown) {
  const code = error instanceof Error ? error.message : String(error || '');
  if (code === 'PHONE_REQUIRED') return 'Введите телефон в формате +7XXXXXXXXXX.';
  if (code === 'BIRTHDAY_REQUIRED' || code === 'BAD_BIRTHDAY') return 'Введите дату рождения в формате дд.мм.гггг.';
  if (code === 'WRONG_BIRTHDAY') return 'Неверная дата рождения.';
  if (code === 'NAME_REQUIRED') return 'Введите имя.';
  if (code === 'CODE_INVALID') return 'Неверный код.';
  if (code === 'CODE_EXPIRED') return 'Код истек, запросите новый.';
  if (code === 'CLIENT_BLOCKED') return 'Учетная запись заблокирована.';
  if (code === 'MESSENGER_NOT_LINKED') return 'Номер подтвержден, но бот не привязан.';
  if (code === 'MESSENGER_LOGIN_REQUIRED') return 'Для этого номера доступен вход через код из бота.';
  if (code === 'UNAUTHORIZED') return 'Сессия истекла. Войдите снова.';
  return 'Не удалось выполнить вход. Проверьте данные и подключение.';
}

function getBonusSummary(config: BonusConfig | null) {
  if (!config) return null;
  const account = config.account && typeof config.account === 'object' ? config.account : null;
  const levels = Array.isArray(config.levels) ? config.levels : [];
  const settings = config.settings && typeof config.settings === 'object' ? config.settings : {};
  const balance = Number(account?.balance ?? account?.bonus_balance ?? account?.amount ?? 0);
  const levelId = Number(account?.level_id ?? account?.bonus_level_id ?? 0);
  const level = levels.find((item) => Number(item.id || 0) === levelId) || levels[0] || null;
  const coinName = String(settings.bonus_coin_name || 'Бонусы');
  const levelTitle = String(level?.title || 'Уровень');
  return { balance, coinName, levelTitle };
}

function getOrderedBonusLevels(levels: Array<Record<string, unknown>>) {
  return levels
    .filter((level) => level && level.is_active !== false)
    .slice()
    .sort((a, b) => Number(a.sort_order || 0) - Number(b.sort_order || 0) || Number(a.id || 0) - Number(b.id || 0));
}

function getNextBonusLevel(levels: Array<Record<string, unknown>>, currentLevel: Record<string, unknown> | null) {
  const currentId = Number(currentLevel?.id || 0);
  if (!(currentId > 0)) return null;
  const ordered = getOrderedBonusLevels(levels);
  const currentIndex = ordered.findIndex((level) => Number(level?.id || 0) === currentId);
  return currentIndex >= 0 ? ordered[currentIndex + 1] || null : null;
}

function getLevelConditionRows(level: Record<string, unknown> | null) {
  const progress = level?.progress && typeof level.progress === 'object' ? level.progress as Record<string, unknown> : {};
  const rows = [
    { current: progress.amount_current, suffix: '₽', target: progress.amount_target || level?.requirement_amount, title: 'Сумма заказов' },
    { current: progress.orders_current, suffix: '', target: progress.orders_target || level?.requirement_orders, title: 'Количество заказов' },
    { current: progress.referrals_current, suffix: '', target: progress.referrals_target || level?.requirement_referrals, title: 'Рефералы' },
    { current: progress.bonus_accrued_current, suffix: '', target: progress.bonus_accrued_target || level?.requirement_bonus_accrued, title: 'Накопить бонусов' },
    { current: progress.bonus_redeemed_current, suffix: '', target: progress.bonus_redeemed_target || level?.requirement_bonus_redeemed, title: 'Потратить бонусов' },
  ];
  return rows
    .map((row) => ({
      ...row,
      currentNumber: Math.max(0, Number(row.current || 0)),
      targetNumber: Math.max(0, Number(row.target || 0)),
    }))
    .filter((row) => row.targetNumber > 0);
}

function getLevelConditionMatchCount(level: Record<string, unknown> | null, rows: ReturnType<typeof getLevelConditionRows>) {
  const progress = level?.progress && typeof level.progress === 'object' ? level.progress as Record<string, unknown> : {};
  return Math.min(rows.length, Math.max(1, Math.floor(Number(progress.match_count || level?.requirement_match_count || 1))));
}

function getLevelConditionsProgressPercent(level: Record<string, unknown> | null) {
  const rows = getLevelConditionRows(level);
  const matchCount = getLevelConditionMatchCount(level, rows);
  if (!rows.length || !(matchCount > 0)) return 0;
  const ratios = rows
    .map((row) => row.currentNumber / row.targetNumber)
    .sort((a, b) => b - a)
    .slice(0, matchCount);
  const total = ratios.reduce((sum, value) => sum + Math.max(0, Math.min(1, value)), 0);
  return Math.max(0, Math.min(100, Math.round(total / matchCount * 100)));
}

function getProfileLevelProgressPercent(levels: Array<Record<string, unknown>>, level: Record<string, unknown> | null) {
  const nextLevel = getNextBonusLevel(levels, level);
  const progressLevel = nextLevel || level;
  const rows = getLevelConditionRows(progressLevel);
  if (!nextLevel && !rows.length) return 100;
  return getLevelConditionsProgressPercent(progressLevel);
}

function getLevelPopoverSummary(config: BonusConfig | null) {
  if (!config) return null;
  const account = config.account && typeof config.account === 'object' ? config.account : null;
  const levels = Array.isArray(config.levels) ? config.levels : [];
  const currentLevelId = Number(account?.level_id ?? account?.bonus_level_id ?? 0);
  const orderedLevels = getOrderedBonusLevels(levels);
  const currentLevel = orderedLevels.find((level) => Number(level?.id || 0) === currentLevelId) || orderedLevels[0] || null;
  const nextLevel = getNextBonusLevel(orderedLevels, currentLevel) || currentLevel;
  const rows = getLevelConditionRows(nextLevel);
  const matchCount = getLevelConditionMatchCount(nextLevel, rows);
  if (!rows.length) return null;
  return { matchCount, rows };
}

function normalizeHexColor(value: unknown, fallback: string) {
  const raw = String(value || '').trim();
  return /^#[0-9a-f]{6}$/i.test(raw) ? raw : fallback;
}

function hexToRgba(value: unknown, opacity: unknown, fallback: string) {
  const hex = normalizeHexColor(value, fallback).replace('#', '');
  const alpha = Math.max(0, Math.min(100, Number(opacity ?? 90))) / 100;
  const red = parseInt(hex.slice(0, 2), 16);
  const green = parseInt(hex.slice(2, 4), 16);
  const blue = parseInt(hex.slice(4, 6), 16);
  return `rgba(${red}, ${green}, ${blue}, ${alpha})`;
}

function formatBonusNumber(value: unknown, digits = 0) {
  const number = Number(value || 0);
  if (!Number.isFinite(number)) return '0';
  return number.toLocaleString('ru-RU', {
    maximumFractionDigits: digits,
    minimumFractionDigits: 0,
  });
}

function formatBonusPercent(value: unknown, digits = 0) {
  const number = Number(value || 0);
  return Number.isFinite(number) ? formatBonusNumber(Math.max(0, number), digits) : '0';
}

function getSelectedFavoriteCategories(favorites: BonusFavoriteCategories | null) {
  const selectedIds = Array.isArray(favorites?.selected_ids)
    ? favorites.selected_ids.map((id) => Number(id || 0)).filter((id) => id > 0)
    : [];
  const categories = Array.isArray(favorites?.categories) ? favorites.categories : [];
  return selectedIds
    .map((id) => categories.find((item) => Number(item?.id || 0) === id))
    .filter((item): item is Record<string, unknown> => Boolean(item));
}

function getBonusCardSummary(config: BonusConfig | null, favorites: BonusFavoriteCategories | null) {
  const base = getBonusSummary(config);
  if (!config || !base) return null;
  const account = config.account && typeof config.account === 'object' ? config.account : null;
  const levels = Array.isArray(config.levels) ? config.levels : [];
  const settings = config.settings && typeof config.settings === 'object' ? config.settings : {};
  const levelId = Number(account?.level_id ?? account?.bonus_level_id ?? 0);
  const level = levels.find((item) => Number(item.id || 0) === levelId) || levels[0] || null;
  const favoriteMin = Number(level?.favorite_categories_min_bonus_percent || 0);
  const favoriteMax = Number(level?.favorite_categories_max_bonus_percent || level?.favorite_categories_bonus_percent || favorites?.bonus_percent || 0);
  const favoriteLabel = favoriteMax > 0
    ? favoriteMin > 0 && favoriteMin !== favoriteMax ? `${favoriteMin}-${favoriteMax}%` : `${favoriteMax}%`
    : '';
  const favoriteCategoryLimit = Math.max(0, Math.floor(Number(level?.favorite_categories_limit || favorites?.limit || 0)));
  const selectedFavoriteCategories = getSelectedFavoriteCategories(favorites);
  const isPaid = level?.access_type === 'paid';
  const isJoined = Boolean(account?.joined_at) && Number(account?.id || 0) > 0;
  const programLogo = isPaid
    ? String(settings.bonus_program_logo_paid || settings.bonus_program_logo || '')
    : String(settings.bonus_program_logo_base || settings.bonus_program_logo || '');
  const programName = isPaid
    ? String(settings.bonus_program_name_paid || settings.bonus_program_name || '')
    : String(settings.bonus_program_name_base || settings.bonus_program_name || 'Бонусная программа');
  return {
    ...base,
    baseColor: normalizeHexColor(level?.base_color, '#1f8d2e'),
    cashbackPercent: Number(level?.cashback_percent || 0),
    coinLogo: String(settings.bonus_coin_logo || ''),
    contentColor: normalizeHexColor(level?.content_color, '#ffffff'),
    favoriteLabel,
    favoriteCategoryLimit,
    isJoined,
    mainColor: normalizeHexColor(level?.main_color || level?.design_color, '#46b13b'),
    programLogo,
    programName: String(settings.bonus_program_name || settings.bonus_program_name_base || 'Бонусная программа'),
    programDisplayName: programName,
    progressPercent: getProfileLevelProgressPercent(levels, level),
    qrEnabled: level?.qr_enabled !== false,
    redeemPercent: Number(level?.redeem_percent || 0),
    showTitleOnCard: level?.show_title_on_card !== false,
    titleBackgroundColor: normalizeHexColor(level?.title_background_color, '#ffffff'),
    titleBackgroundEnabled: level?.title_background_enabled !== false,
    titleBackgroundOpacity: Number(level?.title_background_opacity ?? 90),
    titleColor: normalizeHexColor(level?.title_color, '#1f2937'),
    selectedFavoriteCategories,
  };
}

function getReferralSummary(referrals: BonusReferrals | null, config: BonusConfig | null) {
  const settings = config?.settings && typeof config.settings === 'object' ? config.settings : {};
  const stats = referrals?.stats && typeof referrals.stats === 'object' ? referrals.stats : {};
  const referralLevels = Array.isArray(config?.referral_levels) ? config.referral_levels : [];
  const firstReferralLevel = referralLevels.find((level) => level?.is_active !== false) || null;
  const bonusLevels = Array.isArray(config?.levels) ? config.levels : [];
  const account = config?.account && typeof config.account === 'object' ? config.account : null;
  const levelId = Number(account?.level_id || 0);
  const currentLevel = bonusLevels.find((level) => Number(level?.id || 0) === levelId) || bonusLevels[0] || null;
  const basePercent = Number(firstReferralLevel?.percent || 0);
  const extraPercent = Number(currentLevel?.referral_bonus_percent || 0);
  return {
    baseColor: normalizeHexColor(settings.referral_card_base_color, '#d1d5db'),
    bonusesMonth: Number(stats.bonuses_month || 0),
    bonusesTotal: Number(stats.bonuses_total || 0),
    buttonColor: normalizeHexColor(settings.referral_card_button_color, '#ff6a00'),
    code: String(referrals?.code || ''),
    contentColor: normalizeHexColor(settings.referral_card_content_color, '#64748b'),
    enabled: Boolean(settings.referral_program_enabled),
    firstPurchaseReward: Number(settings.referral_first_purchase_reward || 0),
    inviteUrl: String(referrals?.invite_url || ''),
    mainColor: normalizeHexColor(settings.referral_card_main_color, '#f3f4f6'),
    percent: Math.max(0, (Number.isFinite(basePercent) ? basePercent : 0) + (Number.isFinite(extraPercent) ? extraPercent : 0)),
    qrEnabled: settings.referral_card_qr_enabled !== false,
    referralsMonth: Number(stats.referrals_month || 0),
    referralsTotal: Number(stats.referrals_total || 0),
    registrationReward: Number(settings.referral_registration_reward || 0),
    titleBackgroundColor: normalizeHexColor(settings.referral_card_title_background_color, '#ffffff'),
    titleBackgroundEnabled: settings.referral_card_title_background_enabled !== false,
    titleBackgroundOpacity: Number(settings.referral_card_title_background_opacity ?? 90),
  };
}

const PROFILE_MENU_KEYS = ['addresses', 'my-orders', 'promocodes', 'discounts', 'gifts', 'tasks'];

const PROFILE_MENU_DEFAULTS: Record<string, { icon: string; title: string }> = {
  addresses: { icon: 'location-outline', title: 'Адреса' },
  discounts: { icon: 'pricetag-outline', title: 'Скидки' },
  favorites: { icon: 'heart-outline', title: 'Избранное' },
  gifts: { icon: 'gift-outline', title: 'Подарки' },
  'my-orders': { icon: 'receipt-outline', title: 'Мои заказы' },
  promocodes: { icon: 'ticket-outline', title: 'Промокоды' },
  tasks: { icon: 'checkbox-outline', title: 'Задания' },
};

function getProfileMenuItems(config: BonusConfig | null) {
  const source = Array.isArray(config?.site_menu_items) ? config.site_menu_items : [];
  const byKey = new Map<string, Record<string, unknown>>();
  source.forEach((item) => {
    if (!item || typeof item !== 'object') return;
    const key = String(item.key || '').trim();
    if (PROFILE_MENU_KEYS.includes(key)) byKey.set(key, item);
  });
  return PROFILE_MENU_KEYS
    .map((key, index) => {
      const item = byKey.get(key) || {};
      const defaults = PROFILE_MENU_DEFAULTS[key];
      return {
        enabled: item.enabled === false ? false : true,
        icon: defaults.icon,
        iconUrl: String(item.icon_url || '').trim(),
        key,
        sortOrder: Number(item.sort_order ?? index),
        title: String(item.title || defaults.title).trim() || defaults.title,
      };
    })
    .filter((item) => item.enabled);
}

function getDefaultAddressLine(passport: CustomerPassport) {
  const address = passport.addresses.find((item) => item.is_default === true || item.is_default === 1) || passport.addresses[0];
  if (!address) return 'Адреса не добавлены';
  const normalized = String(address.address_normalized_display || '').trim();
  if (normalized) return normalized;
  return [address.city, address.street, address.house, address.apartment ? `кв. ${address.apartment}` : '']
    .map((item) => String(item || '').trim())
    .filter(Boolean)
    .join(', ') || 'Адрес сохранен';
}

export function ProfilePage() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const [passport, setPassport] = useState<CustomerPassport | null>(null);
  const [step, setStep] = useState<AuthStep>('phone');
  const [phone, setPhone] = useState('+7');
  const [name, setName] = useState('');
  const [birthday, setBirthday] = useState('');
  const [code, setCode] = useState('');
  const [needsNameInput, setNeedsNameInput] = useState(false);
  const [loading, setLoading] = useState(false);
  const [passportChecked, setPassportChecked] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [errorText, setErrorText] = useState('');
  const [levelPopoverVisible, setLevelPopoverVisible] = useState(false);
  const [isReferralQrSheetVisible, setReferralQrSheetVisible] = useState(false);
  const [previousBrightness, setPreviousBrightness] = useState<number | null>(null);

  useEffect(() => {
    let isMounted = true;

    async function loadProfile() {
      const cached = await readCachedCustomerPassport();
      if (!isMounted) return;
      setPassportChecked(true);
      if (cached) {
        setPassport(cached);
        if (isFreshPassport(cached)) return;
        setRefreshing(true);
        try {
          const fresh = await refreshCustomerPassport(cached.token, cached.customer);
          if (isMounted) setPassport(fresh);
        } catch (error) {
          if (error instanceof Error && error.message === 'UNAUTHORIZED') {
            await clearCustomerPassport();
            if (isMounted) setPassport(null);
          }
        } finally {
          if (isMounted) setRefreshing(false);
        }
      }
    }

    void loadProfile();

    return () => {
      isMounted = false;
    };
  }, []);

  useFocusEffect(
    useCallback(() => {
      let isActive = true;
      void readCachedCustomerPassport().then((cached) => {
        if (isActive) {
          setPassport(cached);
          setPassportChecked(true);
        }
      });
      return () => {
        isActive = false;
      };
    }, []),
  );

  const refreshProfile = useCallback(async () => {
    if (refreshing) return;
    setRefreshing(true);
    try {
      const cached = await readCachedCustomerPassport();
      setPassportChecked(true);
      if (!cached) {
        setPassport(null);
        return;
      }
      setPassport(cached);
      const fresh = await refreshCustomerPassport(cached.token, cached.customer);
      setPassport(fresh);
    } catch (error) {
      if (error instanceof Error && error.message === 'UNAUTHORIZED') {
        await clearCustomerPassport();
        setPassport(null);
      }
    } finally {
      setRefreshing(false);
    }
  }, [refreshing]);

  const bonusSummary = useMemo(
    () => getBonusCardSummary(passport?.bonusConfig || null, passport?.bonusFavoriteCategories || null),
    [passport?.bonusConfig, passport?.bonusFavoriteCategories],
  );
  const levelPopoverSummary = useMemo(
    () => getLevelPopoverSummary(passport?.bonusConfig || null),
    [passport?.bonusConfig],
  );
  const bonusCardBaseColor = bonusSummary?.isJoined ? bonusSummary.baseColor : '#cfd5dc';
  const bonusCardMainColor = bonusSummary?.isJoined ? bonusSummary.mainColor : '#f3f4f6';
  const bonusCardContentColor = bonusSummary?.isJoined ? bonusSummary.contentColor : '#5f6f84';
  const referralSummary = useMemo(
    () => getReferralSummary(passport?.bonusReferrals || null, passport?.bonusConfig || null),
    [passport?.bonusConfig, passport?.bonusReferrals],
  );
  const profileMenuItems = useMemo(
    () => getProfileMenuItems(passport?.bonusConfig || null),
    [passport?.bonusConfig],
  );

  const handleProfileMenuPress = useCallback((key: string) => {
    if (key === 'addresses') {
      navigation.navigate(routes.addresses);
      return;
    }
    if (key === 'my-orders') {
      navigation.navigate(routes.orders);
      return;
    }
    if (key === 'promocodes') {
      navigation.navigate(routes.promocodes);
      return;
    }
    if (key === 'discounts') {
      navigation.navigate(routes.discounts);
      return;
    }
    if (key === 'gifts') {
      navigation.navigate(routes.gifts);
      return;
    }
    if (key === 'tasks') {
      navigation.navigate(routes.tasks);
    }
  }, [navigation]);

  const openReferralQrSheet = useCallback(async () => {
    if (!referralSummary.inviteUrl) return;
    setReferralQrSheetVisible(true);
    try {
      const current = await Brightness.getBrightnessAsync();
      setPreviousBrightness(current);
      await Brightness.setBrightnessAsync(1);
    } catch {
      setPreviousBrightness(null);
    }
  }, [referralSummary.inviteUrl]);

  const closeReferralQrSheet = useCallback(() => {
    setReferralQrSheetVisible(false);
    const brightness = previousBrightness;
    setPreviousBrightness(null);
    if (brightness == null) return;
    void Brightness.setBrightnessAsync(brightness).catch(() => {});
  }, [previousBrightness]);

  const shareReferralInvite = useCallback(async () => {
    if (!referralSummary.inviteUrl) return;
    await Share.share({ message: referralSummary.inviteUrl, url: referralSummary.inviteUrl });
  }, [referralSummary.inviteUrl]);

  useEffect(() => {
    if (!levelPopoverVisible) return undefined;
    const timer = setTimeout(() => setLevelPopoverVisible(false), 3600);
    return () => clearTimeout(timer);
  }, [levelPopoverVisible]);

  const toggleLevelPopover = useCallback(() => {
    if (!levelPopoverSummary) return;
    setLevelPopoverVisible((value) => !value);
  }, [levelPopoverSummary]);

  const closeLevelPopover = useCallback(() => {
    setLevelPopoverVisible(false);
  }, []);

  const resetAuthForm = () => {
    setStep('phone');
    setPhone('+7');
    setName('');
    setBirthday('');
    setCode('');
    setNeedsNameInput(false);
    setErrorText('');
  };

  const completeAuth = async (token: string, customer: CustomerProfile | null) => {
    if (!token) throw new Error('UNAUTHORIZED');
    const seedPassport: CustomerPassport = {
      addresses: [],
      bonusConfig: null,
      bonusFavoriteCategories: null,
      bonusReferrals: null,
      customer,
      token,
      updatedAt: new Date().toISOString(),
    };
    await saveCustomerPassport(seedPassport);
    setPassport(seedPassport);
    void ensureCheckoutBenefitsState().catch(() => null);
    resetAuthForm();
    try {
      const fresh = await refreshCustomerPassport(token, customer);
      setPassport(fresh);
    } catch {
      // The seed profile is enough to keep the user logged in until the next refresh.
    }
  };

  const handleContinue = async (phoneOverride?: string) => {
    const nextPhone = phoneOverride || phone;
    const digits = normalizePhoneDigits(nextPhone);
    if (digits.length !== 11 || !digits.startsWith('7')) {
      setErrorText('Введите телефон в формате +7XXXXXXXXXX.');
      return;
    }
    setLoading(true);
    setErrorText('');
    try {
      const status = await authPhoneStatus(nextPhone);
      const shouldAskName = Boolean(status.needs_name_input || !status.has_name);
      setNeedsNameInput(shouldAskName);
      if (status.requires_messenger_login) {
        await authMessengerCodeSend(nextPhone);
        setStep('code');
        return;
      }
      setStep('birthday');
    } catch (error) {
      setErrorText(getAuthErrorText(error));
    } finally {
      setLoading(false);
    }
  };

  const handlePhoneChange = (value: string) => {
    const tail = getPhoneTail(value);
    const nextPhone = formatPhoneTail(tail);
    setPhone(nextPhone);
    setErrorText('');
    if (step === 'phone' && tail.length === 10 && !loading) {
      setTimeout(() => {
        void handleContinue(nextPhone);
      }, 0);
    }
  };

  const handleLogin = async () => {
    const authName = needsNameInput ? name.trim() : '';
    if (needsNameInput && !authName) {
      setErrorText('Введите имя.');
      return;
    }
    if (step === 'birthday' && !isValidBirthday(birthday)) {
      setErrorText('Введите дату рождения в формате дд.мм.гггг.');
      return;
    }
    if (step === 'code' && String(code).replace(/\D/g, '').length !== 4) {
      setErrorText('Введите 4-значный код.');
      return;
    }

    setLoading(true);
    setErrorText('');
    try {
      const result = step === 'code'
        ? await authMessengerCodeVerify({ code: String(code).replace(/\D/g, '').slice(0, 4), name: authName || null, phone })
        : await authLogin({ birthday, name: authName || null, phone });
      await completeAuth(result.token, result.customer);
    } catch (error) {
      setErrorText(getAuthErrorText(error));
    } finally {
      setLoading(false);
    }
  };

  if (!passport && !passportChecked) {
    return (
      <Screen edges={['top']}>
        <View style={styles.authRoot}>
          <ActivityIndicator color={theme.colors.accent} />
        </View>
      </Screen>
    );
  }

  if (!passport) {
    return (
      <Screen edges={['top']}>
        <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
          <View style={styles.authRoot}>
          <View style={styles.authHeader}>
            <Text style={styles.authTitle}>Вход</Text>
          </View>

          <View style={styles.authForm}>
            <Text style={styles.authNote}>
              {step === 'phone'
                ? 'Введите телефон.'
                : step === 'code'
                  ? (needsNameInput ? 'Введите имя и код из бота.' : 'Введите код из бота.')
                  : (needsNameInput ? 'Введите имя и дату рождения (дд.мм.гггг).' : 'Введите дату рождения (дд.мм.гггг).')}
            </Text>

            <TextInput
              editable={step === 'phone' && !loading}
              keyboardType="phone-pad"
              onChangeText={handlePhoneChange}
              style={[styles.input, step !== 'phone' && styles.inputReadonly]}
              value={phone}
            />

            {needsNameInput && step !== 'phone' ? (
              <TextInput
                editable={!loading}
                onChangeText={setName}
                placeholder="Введите имя"
                placeholderTextColor={theme.colors.muted}
                style={styles.input}
                value={name}
              />
            ) : null}

            {step === 'birthday' ? (
              <TextInput
                editable={!loading}
                keyboardType="number-pad"
                maxLength={10}
                onChangeText={(value) => setBirthday(formatBirthdayInput(value))}
                placeholder="дд.мм.гггг"
                placeholderTextColor={theme.colors.muted}
                style={styles.input}
                value={birthday}
              />
            ) : null}

            {step === 'code' ? (
              <TextInput
                editable={!loading}
                keyboardType="number-pad"
                maxLength={4}
                onChangeText={(value) => setCode(String(value || '').replace(/\D/g, '').slice(0, 4))}
                placeholder="Код из бота"
                placeholderTextColor={theme.colors.muted}
                style={styles.input}
                value={code}
              />
            ) : null}

            {errorText ? <Text style={styles.errorText}>{errorText}</Text> : null}

            <Pressable
              disabled={loading}
              onPress={step === 'phone' ? () => handleContinue() : handleLogin}
              style={[styles.primaryButton, loading && styles.primaryButtonDisabled]}
            >
              {loading ? (
                <ActivityIndicator color={theme.colors.primaryText} />
              ) : (
                <Text style={styles.primaryButtonText}>{step === 'phone' ? 'Продолжить' : 'Войти'}</Text>
              )}
            </Pressable>

            {step !== 'phone' ? (
              <Pressable disabled={loading} onPress={() => setStep('phone')} style={styles.backButton}>
                <Text style={styles.backButtonText}>Изменить телефон</Text>
              </Pressable>
            ) : null}
          </View>
          </View>
        </TouchableWithoutFeedback>
      </Screen>
    );
  }

  const customer = passport.customer;
  const photo = resolveAssetUrl(customer?.photo || '');
  const bonusProgramLogo = resolveAssetUrl(bonusSummary?.programLogo || '');
  const bonusCoinLogo = resolveAssetUrl(bonusSummary?.coinLogo || '');
  const bonusTitleBackground = bonusSummary?.titleBackgroundEnabled
    ? hexToRgba(bonusSummary.titleBackgroundColor, bonusSummary.titleBackgroundOpacity, '#ffffff')
    : 'transparent';
  const referralTitleBackground = referralSummary.titleBackgroundEnabled
    ? hexToRgba(referralSummary.titleBackgroundColor, referralSummary.titleBackgroundOpacity, '#ffffff')
    : 'transparent';

  return (
    <Screen edges={['top']}>
      <ScrollView
        style={styles.profileRoot}
        contentContainerStyle={styles.profileContent}
        refreshControl={<RefreshControl refreshing={refreshing} tintColor={theme.colors.accent} onRefresh={refreshProfile} />}
      >
        <View style={styles.profileHeader}>
          <Text style={styles.profileTitle}>Профиль</Text>
          <Pressable onPress={() => navigation.navigate(routes.profileSettings)} style={styles.settingsButton}>
            <Ionicons name="settings-outline" color={theme.colors.text} size={22} />
          </Pressable>
        </View>

        {refreshing ? <Text style={styles.refreshText}>Обновляем данные...</Text> : null}

        {levelPopoverVisible ? <Pressable onPress={closeLevelPopover} style={styles.levelPopoverBackdrop} /> : null}

        {bonusSummary ? (
          <View style={styles.levelPopoverAnchor}>
          <Pressable onPress={toggleLevelPopover} style={[styles.bonusCard, levelPopoverVisible ? styles.bonusCardActive : null]}>
            <View style={styles.bonusAvatar}>
              {photo ? <Image source={{ uri: photo }} style={styles.bonusAvatarImage} /> : <Ionicons name="person" color={theme.colors.accent} size={24} />}
            </View>
            <View style={styles.bonusMain}>
              <Text style={styles.bonusTitle}>
                {(customer?.name || 'Клиент')} · {bonusSummary.levelTitle}
              </Text>
              <View style={styles.progressTrack}>
                <View style={[styles.progressFill, { width: `${bonusSummary.progressPercent}%` }]} />
              </View>
            </View>
          </Pressable>
          {levelPopoverVisible && levelPopoverSummary ? (
            <View style={styles.levelPopover}>
              <Text style={styles.levelPopoverTitle}>До нового уровня</Text>
              <Text style={styles.levelPopoverSubtitle}>
                Выполните {levelPopoverSummary.matchCount} из {levelPopoverSummary.rows.length} условий:
              </Text>
              {levelPopoverSummary.rows.slice(0, 2).map((row) => {
                const ratio = Math.max(0, Math.min(100, row.currentNumber / row.targetNumber * 100));
                const suffix = row.suffix ? ` ${row.suffix}` : '';
                return (
                  <View key={row.title} style={styles.levelConditionRow}>
                    <View style={styles.levelConditionIcon}>
                      <Text style={styles.levelConditionIconText}>+</Text>
                    </View>
                    <View style={styles.levelConditionMain}>
                      <Text style={styles.levelConditionTitle}>{row.title}</Text>
                      <Text style={styles.levelConditionValue}>
                        {formatBonusNumber(row.currentNumber)} / {formatBonusNumber(row.targetNumber)}{suffix}
                      </Text>
                      <View style={styles.levelConditionTrack}>
                        <View style={[styles.levelConditionFill, { width: `${ratio}%` }]} />
                      </View>
                    </View>
                  </View>
                );
              })}
            </View>
          ) : null}
          </View>
        ) : null}

        {bonusSummary || referralSummary.enabled ? (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.cardsScroll}
            contentContainerStyle={styles.cardsScrollContent}
          >
            {bonusSummary ? (
              <Pressable onPress={() => navigation.navigate(routes.bonusProgram)} style={[styles.previewCard, { backgroundColor: bonusCardBaseColor }]}>
                <View style={[styles.previewMain, { backgroundColor: bonusCardMainColor }]}>
                  {bonusSummary.showTitleOnCard ? (
                    <View style={[styles.previewTitleBadge, { backgroundColor: bonusTitleBackground }]}>
                      {bonusProgramLogo ? <Image source={{ uri: bonusProgramLogo }} style={styles.previewProgramLogo} /> : null}
                      <View style={styles.previewTitleText}>
                        <Text style={[styles.previewProgramName, { color: bonusSummary.titleColor }]}>{bonusSummary.programDisplayName}</Text>
                        <Text numberOfLines={1} style={[styles.previewLevelName, { color: bonusSummary.titleColor }]}>{bonusSummary.levelTitle}</Text>
                      </View>
                      <Text style={[styles.previewChevron, { color: bonusSummary.titleColor }]}>›</Text>
                    </View>
                  ) : null}
                  {bonusSummary.isJoined ? (
                    <>
                      <Text style={[styles.previewLabel, { color: bonusCardContentColor }]}>{bonusSummary.coinName}</Text>
                      <View style={styles.previewBalanceRow}>
                        <Text style={[styles.previewBalance, { color: bonusCardContentColor }]}>{formatBonusNumber(bonusSummary.balance)}</Text>
                        {bonusCoinLogo ? <Image source={{ uri: bonusCoinLogo }} style={styles.coinLogo} /> : null}
                      </View>
                    </>
                  ) : (
                    <View style={styles.previewJoinButton}>
                      <Text style={styles.previewJoinText}>Присоединиться</Text>
                    </View>
                  )}
                  {bonusSummary.qrEnabled ? (
                    <View style={styles.previewQr}>
                      <Text style={styles.previewQrText}>QR</Text>
                    </View>
                  ) : null}
                </View>
                <View style={styles.previewSub}>
                  <Pressable onPress={() => navigation.navigate(routes.bonusCashback)} style={styles.previewFooterSide}>
                    <Ionicons name="refresh-circle" color={bonusCardContentColor} size={22} />
                    <Text style={[styles.previewFooterValue, { color: bonusCardContentColor }]}>{formatBonusPercent(bonusSummary.cashbackPercent)}%</Text>
                  </Pressable>
                  {bonusSummary.favoriteCategoryLimit > 0 ? (
                    <Pressable onPress={() => navigation.navigate(routes.bonusFavoriteCategories)} style={styles.previewFavoriteSide}>
                      {bonusSummary.selectedFavoriteCategories.length > 0 ? (
                        <>
                          <View style={styles.previewFavoriteIcons}>
                            {bonusSummary.selectedFavoriteCategories.slice(0, 3).map((category) => {
                              const icon = resolveAssetUrl(String(category.icon || ''));
                              const id = String(category.id || category.title || icon);
                              return (
                                <View key={id} style={styles.previewFavoriteThumb}>
                                  {icon ? <Image source={{ uri: icon }} style={styles.previewFavoriteImage} /> : <Ionicons name="pricetag" color={theme.colors.text} size={12} />}
                                </View>
                              );
                            })}
                          </View>
                          <Text style={[styles.previewFooterValue, { color: bonusCardContentColor }]}>{bonusSummary.favoriteLabel}</Text>
                        </>
                      ) : bonusSummary.isJoined ? (
                        <View style={styles.previewSelectPill}>
                          <Text style={[styles.previewSelectText, { color: bonusCardContentColor }]}>Выбрать</Text>
                        </View>
                      ) : (
                        <>
                          <View style={styles.previewCategoryLimitIcon}>
                            <View style={styles.previewCategoryDots}>
                              <View style={styles.previewCategoryDot} />
                              <View style={styles.previewCategoryDot} />
                              <View style={styles.previewCategoryDot} />
                              <View style={styles.previewCategoryDot} />
                            </View>
                            <Text style={[styles.previewCategoryLimitText, { color: bonusCardContentColor }]}>{bonusSummary.favoriteCategoryLimit}</Text>
                          </View>
                          <Text style={[styles.previewFooterValue, { color: bonusCardContentColor }]}>{bonusSummary.favoriteLabel}</Text>
                        </>
                      )}
                    </Pressable>
                  ) : null}
                </View>
              </Pressable>
            ) : null}

            {referralSummary.enabled === true ? (
              <Pressable onPress={() => navigation.navigate(routes.bonusReferrals)} style={[styles.previewCard, { backgroundColor: referralSummary.baseColor }]}>
                <View style={[styles.previewMain, { backgroundColor: referralSummary.mainColor }]}>
                  <View style={[styles.previewReferralTitle, { backgroundColor: referralTitleBackground }]}>
                    <Text style={[styles.previewReferralTitleText, { color: referralSummary.contentColor }]}>Рефералы</Text>
                  </View>
                  <Text style={[styles.previewLabel, { color: referralSummary.contentColor }]}>Рефералов</Text>
                  <Text style={[styles.previewBalance, { color: referralSummary.contentColor }]}>{formatBonusNumber(referralSummary.referralsTotal)}</Text>
                  {referralSummary.qrEnabled ? (
                    <Pressable
                      disabled={!referralSummary.inviteUrl}
                      onPress={(event) => {
                        event.stopPropagation();
                        void openReferralQrSheet();
                      }}
                      style={styles.previewQr}
                    >
                      {referralSummary.inviteUrl ? (
                        <QRCode
                          value={referralSummary.inviteUrl}
                          size={84}
                          color={theme.colors.text}
                          backgroundColor={theme.colors.card}
                        />
                      ) : (
                        <Text style={styles.previewQrText}>QR</Text>
                      )}
                    </Pressable>
                  ) : null}
                </View>
                <View style={styles.previewSub}>
                  <View style={styles.previewFooterSide}>
                    <Ionicons name="person-add" color={referralSummary.contentColor} size={18} />
                    <Text style={[styles.previewFooterValue, { color: referralSummary.contentColor }]}>{formatBonusPercent(referralSummary.percent)}%</Text>
                  </View>
                  <Pressable
                    disabled={!referralSummary.inviteUrl}
                    onPress={(event) => {
                      event.stopPropagation();
                      void shareReferralInvite();
                    }}
                    style={[styles.referralInvitePill, { backgroundColor: referralSummary.buttonColor }]}
                  >
                    <Text style={styles.referralInviteText}>Пригласить друга</Text>
                  </Pressable>
                </View>
              </Pressable>
            ) : null}

            {false && referralSummary.enabled ? (
              <View style={[styles.programCard, styles.programCardReferral]}>
                <View style={styles.referralTopRow}>
                  <View>
                    <Text style={styles.referralTitle}>Рефералы</Text>
                    <Text style={styles.referralLabel}>Рефералов</Text>
                    <Text style={styles.referralCount}>{referralSummary.referralsTotal}</Text>
                  </View>
                  <View style={styles.referralCodeBox}>
                    <Text style={styles.referralCodeLabel}>Код</Text>
                    <Text style={styles.referralCodeText} numberOfLines={2}>{referralSummary.code || '—'}</Text>
                  </View>
                </View>
                <View style={styles.referralFooter}>
                  <Text style={styles.referralFooterText}>+{referralSummary.referralsMonth} за месяц</Text>
                  <Text style={styles.referralFooterText}>{Math.round(referralSummary.bonusesTotal)} бонусов</Text>
                </View>
              </View>
            ) : null}
          </ScrollView>
        ) : null}

        <View style={styles.profileMenuGrid}>
          {profileMenuItems.map((item) => {
            const iconUrl = resolveAssetUrl(item.iconUrl);
            return (
              <Pressable
                key={item.key}
                onPress={() => handleProfileMenuPress(item.key)}
                style={styles.profileMenuItem}
              >
                <View style={styles.profileMenuIcon}>
                  {iconUrl ? (
                    <Image source={{ uri: iconUrl }} style={styles.profileMenuIconImage} />
                  ) : (
                    <Ionicons name={item.icon as keyof typeof Ionicons.glyphMap} color={theme.colors.accent} size={28} />
                  )}
                </View>
                <Text numberOfLines={2} style={styles.profileMenuTitle}>{item.title}</Text>
              </Pressable>
            );
          })}
        </View>
      </ScrollView>
      <BottomSheet
        onClose={closeReferralQrSheet}
        title="Пригласить друга"
        visible={isReferralQrSheetVisible}
      >
        <View style={styles.qrSheetContent}>
          <View style={styles.qrSheetCode}>
            {referralSummary.inviteUrl ? (
              <QRCode
                value={referralSummary.inviteUrl}
                size={230}
                color={theme.colors.text}
                backgroundColor={theme.colors.card}
              />
            ) : null}
          </View>
          <Text style={styles.qrSheetLink} numberOfLines={2}>{referralSummary.inviteUrl}</Text>
          <View style={styles.qrRewardGrid}>
            <View style={styles.qrRewardCard}>
              <Text style={styles.qrRewardLabel}>Вы получите</Text>
              <View style={styles.qrRewardValueRow}>
                <Text style={styles.qrRewardValue}>{formatBonusNumber(referralSummary.firstPurchaseReward)}</Text>
                {bonusCoinLogo ? <Image source={{ uri: bonusCoinLogo }} style={styles.qrRewardCoin} /> : null}
              </View>
              <Text style={styles.qrRewardMeta}>после первой покупки друга</Text>
            </View>
            <View style={styles.qrRewardCard}>
              <Text style={styles.qrRewardLabel}>Друг получит</Text>
              <View style={styles.qrRewardValueRow}>
                <Text style={styles.qrRewardValue}>{formatBonusNumber(referralSummary.registrationReward)}</Text>
                {bonusCoinLogo ? <Image source={{ uri: bonusCoinLogo }} style={styles.qrRewardCoin} /> : null}
              </View>
              <Text style={styles.qrRewardMeta}>за регистрацию</Text>
            </View>
          </View>
          <Pressable onPress={shareReferralInvite} disabled={!referralSummary.inviteUrl} style={[styles.qrInviteButton, !referralSummary.inviteUrl ? styles.qrInviteButtonDisabled : null]}>
            <Text style={styles.qrInviteButtonText}>Пригласить друга</Text>
          </Pressable>
        </View>
      </BottomSheet>
    </Screen>
  );
}

const styles = StyleSheet.create({
  authForm: {
    marginTop: 150,
    paddingHorizontal: theme.spacing.xl,
  },
  authHeader: {
    alignItems: 'center',
    paddingTop: theme.spacing.lg,
  },
  authNote: {
    color: theme.colors.muted,
    fontSize: 14,
    marginBottom: theme.spacing.md,
    textAlign: 'center',
  },
  authRoot: {
    backgroundColor: theme.colors.card,
    flex: 1,
  },
  authTitle: {
    color: theme.colors.text,
    fontSize: 18,
    fontWeight: '900',
  },
  backButton: {
    alignItems: 'center',
    marginTop: theme.spacing.md,
  },
  backButtonText: {
    color: theme.colors.muted,
    fontSize: 14,
    fontWeight: '800',
  },
  bonusAvatar: {
    alignItems: 'center',
    backgroundColor: theme.colors.surface,
    borderColor: '#ffd3b6',
    borderRadius: 12,
    borderWidth: 1,
    height: 48,
    justifyContent: 'center',
    overflow: 'hidden',
    width: 48,
  },
  bonusAvatarImage: {
    height: '100%',
    width: '100%',
  },
  bonusCard: {
    alignItems: 'center',
    backgroundColor: theme.colors.card,
    borderRadius: 24,
    flexDirection: 'row',
    gap: theme.spacing.md,
    marginTop: theme.spacing.lg,
    padding: theme.spacing.md,
  },
  bonusCardActive: {
    borderColor: theme.colors.accent,
    borderWidth: 1,
  },
  bonusMain: {
    flex: 1,
  },
  bonusSubtitle: {
    color: theme.colors.muted,
    fontSize: 12,
    fontWeight: '700',
    marginTop: theme.spacing.xs,
  },
  bonusTitle: {
    color: theme.colors.text,
    fontSize: 14,
    fontWeight: '900',
  },
  cardsScroll: {
    marginHorizontal: -theme.spacing.lg,
    marginTop: theme.spacing.md,
  },
  cardsScrollContent: {
    gap: theme.spacing.md,
    paddingHorizontal: theme.spacing.lg,
  },
  coinLogo: {
    height: 28,
    marginLeft: theme.spacing.sm,
    width: 28,
  },
  customerCard: {
    backgroundColor: theme.colors.card,
    borderRadius: 18,
    flexDirection: 'row',
    gap: theme.spacing.lg,
    marginTop: theme.spacing.lg,
    padding: theme.spacing.md,
  },
  customerInfo: {
    flex: 1,
  },
  customerPhoto: {
    alignItems: 'center',
    backgroundColor: theme.colors.surface,
    borderColor: '#ffd3b6',
    borderRadius: 18,
    borderWidth: 1,
    height: 112,
    justifyContent: 'center',
    overflow: 'hidden',
    width: 112,
  },
  customerPhotoImage: {
    height: '100%',
    width: '100%',
  },
  errorText: {
    color: '#dc2626',
    fontSize: 13,
    fontWeight: '700',
    marginBottom: theme.spacing.sm,
    textAlign: 'center',
  },
  fieldLabel: {
    color: theme.colors.muted,
    fontSize: 12,
    marginTop: theme.spacing.xs,
  },
  fieldValue: {
    color: theme.colors.text,
    fontSize: 15,
    fontWeight: '900',
    marginTop: 2,
  },
  infoCard: {
    backgroundColor: theme.colors.card,
    borderRadius: 16,
    marginTop: theme.spacing.lg,
    padding: theme.spacing.md,
  },
  infoCardMeta: {
    color: theme.colors.muted,
    fontSize: 12,
    marginTop: theme.spacing.xs,
  },
  infoCardText: {
    color: theme.colors.text,
    fontSize: 14,
    fontWeight: '700',
    marginTop: theme.spacing.xs,
  },
  infoCardTitle: {
    color: theme.colors.text,
    fontSize: 16,
    fontWeight: '900',
  },
  input: {
    backgroundColor: theme.colors.mutedBackground,
    borderColor: '#ffd3b6',
    borderRadius: theme.radius.pill,
    borderWidth: 1,
    color: theme.colors.text,
    fontSize: 22,
    fontWeight: '900',
    height: 56,
    marginBottom: theme.spacing.md,
    paddingHorizontal: theme.spacing.lg,
  },
  inputReadonly: {
    borderColor: theme.colors.border,
    color: theme.colors.text,
    opacity: 0.75,
  },
  logoutButton: {
    alignItems: 'center',
    borderColor: theme.colors.accent,
    borderRadius: 10,
    borderWidth: 1,
    marginTop: theme.spacing.lg,
    paddingVertical: theme.spacing.md,
  },
  logoutButtonText: {
    color: theme.colors.accent,
    fontSize: 15,
    fontWeight: '800',
  },
  levelConditionFill: {
    backgroundColor: theme.colors.accent,
    borderRadius: theme.radius.pill,
    height: '100%',
  },
  levelConditionIcon: {
    alignItems: 'center',
    backgroundColor: theme.colors.mutedBackground,
    borderRadius: theme.radius.pill,
    height: 30,
    justifyContent: 'center',
    width: 30,
  },
  levelConditionIconText: {
    color: theme.colors.text,
    fontSize: 14,
    fontWeight: '900',
  },
  levelConditionMain: {
    flex: 1,
  },
  levelConditionRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: theme.spacing.sm,
    marginTop: theme.spacing.sm,
  },
  levelConditionTitle: {
    color: theme.colors.text,
    fontSize: 13,
    fontWeight: '900',
  },
  levelConditionTrack: {
    backgroundColor: theme.colors.border,
    borderRadius: theme.radius.pill,
    height: 5,
    marginTop: 4,
    overflow: 'hidden',
  },
  levelConditionValue: {
    color: theme.colors.text,
    fontSize: 13,
    fontWeight: '900',
    marginTop: 2,
  },
  levelPopover: {
    backgroundColor: theme.colors.card,
    borderRadius: 18,
    elevation: 6,
    left: theme.spacing.md,
    padding: theme.spacing.md,
    position: 'absolute',
    right: theme.spacing.md,
    shadowColor: '#0f172a',
    shadowOffset: { height: 12, width: 0 },
    shadowOpacity: 0.14,
    shadowRadius: 24,
    top: 104,
    zIndex: 30,
  },
  levelPopoverAnchor: {
    position: 'relative',
    zIndex: 20,
  },
  levelPopoverBackdrop: {
    bottom: 0,
    left: 0,
    position: 'absolute',
    right: 0,
    top: 0,
    zIndex: 10,
  },
  levelPopoverSubtitle: {
    color: theme.colors.text,
    fontSize: 13,
    fontWeight: '800',
    marginTop: theme.spacing.xs,
  },
  levelPopoverTitle: {
    color: theme.colors.text,
    fontSize: 15,
    fontWeight: '900',
  },
  primaryButton: {
    alignItems: 'center',
    backgroundColor: theme.colors.accent,
    borderRadius: theme.radius.pill,
    height: 56,
    justifyContent: 'center',
  },
  primaryButtonDisabled: {
    opacity: 0.65,
  },
  primaryButtonText: {
    color: theme.colors.primaryText,
    fontSize: 17,
    fontWeight: '900',
  },
  previewBalance: {
    fontSize: 34,
    fontWeight: '900',
    lineHeight: 38,
  },
  previewBalanceRow: {
    alignItems: 'center',
    flexDirection: 'row',
    marginTop: 2,
  },
  previewCard: {
    aspectRatio: 16 / 9,
    borderRadius: 30,
    elevation: 3,
    overflow: 'hidden',
    shadowColor: '#0f172a',
    shadowOffset: { height: 10, width: 0 },
    shadowOpacity: 0.12,
    shadowRadius: 24,
    width: 300,
  },
  previewChevron: {
    fontSize: 15,
    fontWeight: '900',
    lineHeight: 18,
    marginLeft: theme.spacing.xs,
  },
  previewFavoriteMock: {
    alignItems: 'center',
    backgroundColor: theme.colors.card,
    borderRadius: 8,
    height: 24,
    justifyContent: 'center',
    width: 38,
  },
  previewFavoriteSide: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: theme.spacing.xs,
  },
  previewFavoriteIcons: {
    alignItems: 'center',
    backgroundColor: theme.colors.card,
    borderRadius: 8,
    flexDirection: 'row',
    height: 24,
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  previewFavoriteImage: {
    height: '100%',
    width: '100%',
  },
  previewFavoriteThumb: {
    alignItems: 'center',
    borderRadius: 6,
    height: 20,
    justifyContent: 'center',
    marginHorizontal: -3,
    overflow: 'hidden',
    width: 20,
  },
  previewCategoryDot: {
    backgroundColor: theme.colors.muted,
    borderRadius: 2,
    height: 5,
    width: 5,
  },
  previewCategoryDots: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 2,
    height: 12,
    width: 12,
  },
  previewCategoryLimitIcon: {
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.22)',
    borderRadius: theme.radius.pill,
    flexDirection: 'row',
    gap: 2,
    height: 26,
    justifyContent: 'center',
    minWidth: 36,
    paddingHorizontal: 6,
  },
  previewCategoryLimitText: {
    fontSize: 11,
    fontWeight: '900',
    lineHeight: 13,
    marginTop: -8,
  },
  previewFooterSide: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: theme.spacing.xs,
  },
  previewFooterValue: {
    fontSize: 22,
    fontWeight: '900',
    lineHeight: 24,
  },
  previewLabel: {
    fontSize: 13,
    fontWeight: '800',
    marginTop: 'auto',
  },
  previewLevelName: {
    fontSize: 12,
    fontWeight: '800',
    lineHeight: 14,
    opacity: 0.8,
  },
  previewMain: {
    borderBottomLeftRadius: 30,
    borderBottomRightRadius: 30,
    flex: 1,
    marginBottom: -6,
    paddingBottom: theme.spacing.sm,
    paddingHorizontal: 14,
    paddingTop: 14,
    position: 'relative',
    zIndex: 2,
  },
  previewProgramLogo: {
    borderRadius: 3,
    height: 34,
    width: 34,
  },
  previewProgramName: {
    fontSize: 12,
    fontWeight: '900',
    lineHeight: 14,
  },
  previewQr: {
    alignItems: 'center',
    backgroundColor: theme.colors.card,
    borderRadius: 8,
    height: 92,
    justifyContent: 'center',
    overflow: 'hidden',
    position: 'absolute',
    right: 12,
    top: 12,
    width: 92,
  },
  previewQrText: {
    color: theme.colors.text,
    fontSize: 16,
    fontWeight: '900',
  },
  qrInviteButton: {
    alignItems: 'center',
    backgroundColor: theme.colors.accent,
    borderRadius: theme.radius.pill,
    height: 54,
    justifyContent: 'center',
    marginTop: theme.spacing.md,
  },
  qrInviteButtonDisabled: {
    opacity: 0.5,
  },
  qrInviteButtonText: {
    color: theme.colors.primaryText,
    fontSize: 16,
    fontWeight: '900',
  },
  qrRewardCard: {
    backgroundColor: theme.colors.mutedBackground,
    borderRadius: 18,
    flex: 1,
    padding: theme.spacing.md,
  },
  qrRewardCoin: {
    height: 22,
    width: 22,
  },
  qrRewardGrid: {
    flexDirection: 'row',
    gap: theme.spacing.md,
    marginTop: theme.spacing.md,
  },
  qrRewardLabel: {
    color: theme.colors.text,
    fontSize: 14,
    fontWeight: '900',
  },
  qrRewardMeta: {
    color: theme.colors.muted,
    fontSize: 12,
    fontWeight: '800',
    marginTop: 6,
  },
  qrRewardValue: {
    color: theme.colors.text,
    fontSize: 26,
    fontWeight: '900',
  },
  qrRewardValueRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 6,
    marginTop: theme.spacing.sm,
  },
  qrSheetCode: {
    alignItems: 'center',
    backgroundColor: theme.colors.card,
    borderColor: theme.colors.border,
    borderRadius: 24,
    borderWidth: 1,
    justifyContent: 'center',
    padding: theme.spacing.lg,
  },
  qrSheetContent: {
    gap: theme.spacing.sm,
  },
  qrSheetLink: {
    color: theme.colors.text,
    fontSize: 13,
    fontWeight: '800',
    marginTop: theme.spacing.sm,
    textAlign: 'center',
  },
  previewReferralTitle: {
    alignItems: 'center',
    alignSelf: 'flex-start',
    borderRadius: theme.radius.pill,
    minHeight: 24,
    paddingHorizontal: 10,
    paddingVertical: 2,
  },
  previewReferralTitleText: {
    fontSize: 13,
    fontWeight: '900',
    lineHeight: 17,
  },
  previewSub: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: theme.spacing.md,
    height: 42,
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    zIndex: 1,
  },
  previewJoinButton: {
    alignItems: 'center',
    alignSelf: 'flex-start',
    backgroundColor: theme.colors.accent,
    borderRadius: theme.radius.pill,
    marginTop: 'auto',
    paddingHorizontal: 18,
    paddingVertical: 9,
  },
  previewJoinText: {
    color: theme.colors.primaryText,
    fontSize: 13,
    fontWeight: '900',
  },
  previewSelectPill: {
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.18)',
    borderRadius: theme.radius.pill,
    minHeight: 28,
    paddingHorizontal: 12,
    justifyContent: 'center',
  },
  previewSelectText: {
    fontSize: 17,
    fontWeight: '900',
    lineHeight: 20,
  },
  previewTitleBadge: {
    alignItems: 'flex-start',
    alignSelf: 'flex-start',
    borderRadius: theme.radius.pill,
    flexDirection: 'row',
    maxWidth: 214,
    minHeight: 42,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  previewTitleText: {
    flex: 1,
    justifyContent: 'center',
    marginLeft: theme.spacing.xs,
  },
  programCard: {
    borderRadius: 26,
    height: 170,
    justifyContent: 'space-between',
    overflow: 'hidden',
    padding: theme.spacing.md,
    width: 290,
  },
  programCardBalance: {
    color: theme.colors.primaryText,
    fontSize: 34,
    fontWeight: '900',
    lineHeight: 38,
  },
  programCardBalanceRow: {
    alignItems: 'center',
    flexDirection: 'row',
  },
  programCardBonus: {
    backgroundColor: '#9fc5ff',
  },
  programCardFooter: {
    alignItems: 'center',
    backgroundColor: 'rgba(37, 99, 235, 0.28)',
    borderRadius: theme.radius.pill,
    flexDirection: 'row',
    gap: theme.spacing.md,
    marginHorizontal: -theme.spacing.md,
    marginBottom: -theme.spacing.md,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
  },
  programCardFooterText: {
    color: theme.colors.primaryText,
    fontSize: 20,
    fontWeight: '900',
  },
  programCardHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: theme.spacing.sm,
  },
  programCardHeaderText: {
    flex: 1,
  },
  programCardIcon: {
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.45)',
    borderRadius: 12,
    height: 42,
    justifyContent: 'center',
    overflow: 'hidden',
    width: 42,
  },
  programCardIconImage: {
    height: '100%',
    width: '100%',
  },
  programCardLabel: {
    color: theme.colors.primaryText,
    fontSize: 13,
    fontWeight: '800',
  },
  programCardReferral: {
    backgroundColor: theme.colors.accent,
  },
  programCardSubtitle: {
    color: theme.colors.primaryText,
    fontSize: 13,
    fontWeight: '800',
    opacity: 0.85,
  },
  programCardTitle: {
    color: theme.colors.primaryText,
    fontSize: 15,
    fontWeight: '900',
  },
  profileContent: {
    padding: theme.spacing.lg,
    paddingBottom: theme.spacing.xl,
    position: 'relative',
  },
  profileRoot: {
    backgroundColor: theme.colors.mutedBackground,
    flex: 1,
  },
  profileHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  profileMenuGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    marginTop: theme.spacing.lg,
    rowGap: theme.spacing.md,
  },
  profileMenuIcon: {
    alignItems: 'center',
    backgroundColor: '#fff3ea',
    borderColor: '#ffd3b6',
    borderRadius: 18,
    borderWidth: 1,
    height: 100,
    justifyContent: 'center',
    overflow: 'hidden',
    shadowColor: theme.colors.accent,
    shadowOffset: { height: 4, width: 0 },
    shadowOpacity: 0.16,
    shadowRadius: 10,
    width: 100,
  },
  profileMenuIconImage: {
    height: '100%',
    width: '100%',
  },
  profileMenuItem: {
    alignItems: 'center',
    width: 100,
  },
  profileMenuTitle: {
    color: theme.colors.text,
    fontSize: 12,
    fontWeight: '900',
    lineHeight: 15,
    marginTop: theme.spacing.xs,
    minHeight: 30,
    textAlign: 'center',
  },
  profileTitle: {
    color: theme.colors.text,
    fontSize: 24,
    fontWeight: '900',
  },
  settingsButton: {
    alignItems: 'center',
    backgroundColor: theme.colors.card,
    borderRadius: theme.radius.pill,
    height: 42,
    justifyContent: 'center',
    width: 42,
  },
  progressFill: {
    backgroundColor: theme.colors.accent,
    borderRadius: theme.radius.pill,
    height: '100%',
    width: '48%',
  },
  progressTrack: {
    backgroundColor: theme.colors.border,
    borderRadius: theme.radius.pill,
    height: 10,
    marginTop: theme.spacing.sm,
    overflow: 'hidden',
  },
  refreshText: {
    color: theme.colors.muted,
    fontSize: 12,
    marginTop: theme.spacing.xs,
    textAlign: 'center',
  },
  referralCodeBox: {
    alignItems: 'center',
    backgroundColor: theme.colors.card,
    borderRadius: 12,
    justifyContent: 'center',
    minHeight: 72,
    padding: theme.spacing.sm,
    width: 92,
  },
  referralCodeLabel: {
    color: theme.colors.muted,
    fontSize: 10,
    fontWeight: '900',
    textTransform: 'uppercase',
  },
  referralCodeText: {
    color: theme.colors.text,
    fontSize: 13,
    fontWeight: '900',
    marginTop: 2,
    textAlign: 'center',
  },
  referralCount: {
    color: theme.colors.primaryText,
    fontSize: 34,
    fontWeight: '900',
    lineHeight: 38,
  },
  referralInvitePill: {
    alignItems: 'center',
    borderRadius: theme.radius.pill,
    height: 28,
    justifyContent: 'center',
    paddingHorizontal: theme.spacing.md,
  },
  referralInviteText: {
    color: theme.colors.primaryText,
    fontSize: 12,
    fontWeight: '900',
  },
  referralFooter: {
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.28)',
    borderRadius: theme.radius.pill,
    flexDirection: 'row',
    gap: theme.spacing.sm,
    marginHorizontal: -theme.spacing.md,
    marginBottom: -theme.spacing.md,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
  },
  referralFooterText: {
    color: theme.colors.primaryText,
    fontSize: 13,
    fontWeight: '900',
  },
  referralLabel: {
    color: theme.colors.primaryText,
    fontSize: 13,
    fontWeight: '800',
    marginTop: theme.spacing.lg,
  },
  referralTitle: {
    color: theme.colors.primaryText,
    fontSize: 15,
    fontWeight: '900',
  },
  referralTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
});
