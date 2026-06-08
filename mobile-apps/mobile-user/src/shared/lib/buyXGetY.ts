import type { CatalogBuyXGetYBadge } from '../../entities/product';

export type BuyXGetYRule = {
  id: number | null;
  title: string;
  buyQty: number;
  rewardQty: number;
  repeatMode: 'single' | 'repeat';
  isStackable: boolean;
  badgeText: string;
};

export type BuyXGetYApplication = {
  applications: number;
  freeQty: number;
  paidParticipatingQty: number;
  participatingQty: number;
};

export type BuyXGetYLineTotals = BuyXGetYApplication & {
  discountAmount: number;
  oldTotal: number;
  rule: BuyXGetYRule | null;
  total: number;
};

function asText(value: unknown) {
  return String(value || '').trim();
}

function roundPrice(value: number) {
  return Math.round((Number.isFinite(value) ? value : 0) * 100) / 100;
}

function toBooleanFlag(value: unknown) {
  if (value === true || value === 1 || value === '1') return true;
  const text = asText(value).toLowerCase();
  return text === 'true' || text === 'yes' || text === 'on';
}

function toPositiveNumber(value: unknown) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : null;
}

export function getBuyXGetYRule(source?: CatalogBuyXGetYBadge | null): BuyXGetYRule | null {
  if (!source || typeof source !== 'object') return null;
  const badgeText = asText(source.badge_text);
  const plusMatch = badgeText.match(/^(\d+)\s*\+\s*(\d+)$/);
  const equalsMatch = badgeText.match(/^(\d+)\s*=\s*(\d+)$/);
  const hasQty = source.buy_qty != null || source.reward_qty != null || !!plusMatch || !!equalsMatch;
  if (!hasQty) return null;

  const buyQty = Math.max(1, Math.floor(Number(source.buy_qty ?? plusMatch?.[1] ?? equalsMatch?.[2] ?? 0)) || 1);
  const rewardQtyFromEquals = equalsMatch ? Math.max(1, Number(equalsMatch[1] || 0) - Number(equalsMatch[2] || 0)) : 0;
  const rewardQty = Math.max(1, Math.floor(Number(source.reward_qty ?? plusMatch?.[2] ?? rewardQtyFromEquals ?? 0)) || 1);
  const repeatMode = asText(source.repeat_mode).toLowerCase() === 'repeat' ? 'repeat' : 'single';

  return {
    badgeText: `${buyQty + rewardQty}=${buyQty}`,
    buyQty,
    id: toPositiveNumber(source.id),
    isStackable: toBooleanFlag(source.is_stackable),
    repeatMode,
    rewardQty,
    title: asText(source.title || source.badge_text || '1+1') || '1+1',
  };
}

export function getBuyXGetYBadgeText(source?: CatalogBuyXGetYBadge | null) {
  const rule = getBuyXGetYRule(source);
  return rule ? rule.badgeText : asText(source?.badge_text);
}

export function calculateBuyXGetYApplication(quantity: number, rule?: BuyXGetYRule | null): BuyXGetYApplication {
  const qty = Math.max(0, Math.floor(Number(quantity) || 0));
  const buyQty = Math.max(1, Math.floor(Number(rule?.buyQty || 0)) || 1);
  const rewardQty = Math.max(1, Math.floor(Number(rule?.rewardQty || 0)) || 1);
  const groupQty = buyQty + rewardQty;

  if (!(qty >= groupQty)) {
    return {
      applications: 0,
      freeQty: 0,
      paidParticipatingQty: 0,
      participatingQty: 0,
    };
  }

  const applications = rule?.repeatMode === 'repeat' ? Math.floor(qty / groupQty) : 1;
  const participatingQty = Math.min(qty, applications * groupQty);
  const freeQty = Math.min(qty, applications * rewardQty);

  return {
    applications,
    freeQty,
    paidParticipatingQty: Math.max(0, participatingQty - freeQty),
    participatingQty,
  };
}

export function calculateBuyXGetYLineTotals({
  badge,
  oldUnitPrice = 0,
  quantity,
  unitPrice,
}: {
  badge?: CatalogBuyXGetYBadge | null;
  oldUnitPrice?: number;
  quantity: number;
  unitPrice: number;
}): BuyXGetYLineTotals {
  const rule = getBuyXGetYRule(badge);
  const application = calculateBuyXGetYApplication(quantity, rule);
  const price = Math.max(0, Number(unitPrice) || 0);
  const oldPrice = Math.max(0, Number(oldUnitPrice) || 0);
  const discountAmount = roundPrice(price * application.freeQty);
  const total = roundPrice(Math.max(0, price * Math.max(0, Math.floor(Number(quantity) || 0)) - discountAmount));
  const oldTotal = oldPrice > price
    ? roundPrice(oldPrice * Math.max(0, Math.floor(Number(quantity) || 0)))
    : application.freeQty > 0
      ? roundPrice(price * Math.max(0, Math.floor(Number(quantity) || 0)))
      : 0;

  return {
    ...application,
    discountAmount,
    oldTotal,
    rule,
    total,
  };
}
