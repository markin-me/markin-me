import type { CartLine } from '../cart';
import type { ProductStockLevel } from '../../shared/lib/productStock';

export type StockLimitReason = 'available' | 'sold_out' | 'limit_reached' | 'unknown_stock';

export type StockLimitResult = {
  canAdd: boolean;
  limitingProductIds: number[];
  maxQty: number | null;
  reason: StockLimitReason;
  remainingQty: number | null;
};

type DeductionSource = {
  lineId?: string;
  productId: number;
  qty: number;
};

function toPositiveId(value: unknown) {
  const id = Number(value || 0);
  return Number.isFinite(id) && id > 0 ? id : null;
}

function toPositiveQty(value: unknown, fallback = 0) {
  const qty = Number(value);
  return Number.isFinite(qty) && qty > 0 ? qty : fallback;
}

function getVariantStockQuantity(variant: CartLine['variant'] | undefined | null) {
  return toPositiveQty(variant?.stockQuantity ?? variant?.quantityInBase, 0);
}

function getOptionStockQuantity(option: NonNullable<CartLine['options']>[number]) {
  return toPositiveQty(option.stockQuantity ?? option.variant?.stockQuantity ?? option.variant?.quantityInBase, toPositiveQty(option.quantity, 1));
}

function addDeduction(target: DeductionSource[], lineId: string | undefined, productId: unknown, qty: unknown) {
  const id = toPositiveId(productId);
  const quantity = toPositiveQty(qty);
  if (!id || !(quantity > 0)) return;
  target.push({ lineId, productId: id, qty: quantity });
}

function addProductRequirements(
  target: DeductionSource[],
  lineId: string | undefined,
  productId: unknown,
  quantity: number,
  stockLevels: Map<number, ProductStockLevel>,
) {
  const id = toPositiveId(productId);
  if (!id || !(quantity > 0)) return;
  addDeduction(target, lineId, id, quantity);

  const stock = stockLevels.get(id);
  (Array.isArray(stock?.requirements) ? stock.requirements : []).forEach((requirement) => {
    const requiredQty = toPositiveQty(requirement.requiredQty);
    if (!(requiredQty > 0)) return;
    addDeduction(target, lineId, requirement.productId, requiredQty * quantity);
  });
}

function addProductOwnDeduction(target: DeductionSource[], lineId: string | undefined, productId: unknown, quantity: number) {
  addDeduction(target, lineId, productId, quantity);
}

function collectLineDeductions(line: CartLine, stockLevels: Map<number, ProductStockLevel>) {
  const deductions: DeductionSource[] = [];
  const lineQty = Math.max(1, Math.floor(Number(line.quantity || 1)));

  if (line.type === 'combo') {
    (Array.isArray(line.comboSelections) ? line.comboSelections : []).forEach((selection) => {
      const ingredients = Array.isArray(selection.ingredients) ? selection.ingredients : [];
      const selectionQty = getVariantStockQuantity(selection.variant) || 1;
      if (ingredients.length) {
        addProductOwnDeduction(deductions, line.id, selection.productId, selectionQty * lineQty);
      } else {
        addProductRequirements(deductions, line.id, selection.productId, selectionQty * lineQty, stockLevels);
      }
      ingredients.forEach((ingredient) => {
        addProductRequirements(deductions, line.id, ingredient.id, toPositiveQty(ingredient.stockQuantity ?? ingredient.quantity) * lineQty, stockLevels);
      });
    });
    return deductions;
  }

  const ingredients = Array.isArray(line.ingredients) ? line.ingredients : [];
  const variantProductQty = getVariantStockQuantity(line.variant);
  const productQty = variantProductQty ? variantProductQty * lineQty : lineQty;
  if (ingredients.length) {
    addProductOwnDeduction(deductions, line.id, line.sourceId, productQty);
  } else {
    addProductRequirements(deductions, line.id, line.sourceId, productQty, stockLevels);
  }
  ingredients.forEach((ingredient) => {
    addProductRequirements(deductions, line.id, ingredient.id, toPositiveQty(ingredient.stockQuantity ?? ingredient.quantity) * lineQty, stockLevels);
  });
  (Array.isArray(line.options) ? line.options : []).forEach((option) => {
    addProductRequirements(deductions, line.id, option.targetProductId, getOptionStockQuantity(option) * lineQty, stockLevels);
  });

  return deductions;
}

export function getStockProductIdsForLines(lines: CartLine[], stockLevels: Map<number, ProductStockLevel>) {
  const ids = new Set<number>();
  (Array.isArray(lines) ? lines : []).forEach((line) => {
    collectLineDeductions(line, stockLevels).forEach((deduction) => ids.add(deduction.productId));
  });
  return Array.from(ids);
}

export function calculateCartStockLimit(
  lines: CartLine[],
  stockLevels: Map<number, ProductStockLevel>,
  targetLineId?: string | null,
): StockLimitResult {
  const totals = new Map<number, number>();
  const targetTotals = new Map<number, number>();

  (Array.isArray(lines) ? lines : []).forEach((line) => {
    collectLineDeductions(line, stockLevels).forEach((deduction) => {
      totals.set(deduction.productId, (totals.get(deduction.productId) || 0) + deduction.qty);
      if (targetLineId && deduction.lineId === targetLineId) {
        targetTotals.set(deduction.productId, (targetTotals.get(deduction.productId) || 0) + deduction.qty);
      }
    });
  });

  let remainingQty: number | null = null;
  let maxQty: number | null = null;
  const limitingProductIds: number[] = [];
  totals.forEach((requiredQty, productId) => {
    const stock = stockLevels.get(productId);
    if (!stock) return;
    if (stock.isAvailable === false || stock.canFulfill === false) {
      limitingProductIds.push(productId);
      remainingQty = remainingQty == null ? 0 : Math.min(remainingQty, 0);
      maxQty = maxQty == null ? 0 : Math.min(maxQty, 0);
      return;
    }
    if (stock.qty === null || stock.isUnlimited === true) return;
    const availableQty = Number(stock.qty);
    if (!Number.isFinite(availableQty)) return;

    const remainingForProduct = Math.floor(Math.max(0, availableQty - requiredQty));
    remainingQty = remainingQty == null ? remainingForProduct : Math.min(remainingQty, remainingForProduct);

    const targetRequiredQty = targetLineId ? Number(targetTotals.get(productId) || 0) : requiredQty;
    if (targetRequiredQty > 0) {
      const maxForProduct = Math.floor(Math.max(0, availableQty - (requiredQty - targetRequiredQty)) / targetRequiredQty);
      maxQty = maxQty == null ? maxForProduct : Math.min(maxQty, maxForProduct);
    }

    if (requiredQty > availableQty + 1e-9) limitingProductIds.push(productId);
  });

  if (limitingProductIds.length) {
    return {
      canAdd: false,
      limitingProductIds: Array.from(new Set(limitingProductIds)),
      maxQty: maxQty == null ? 0 : maxQty,
      reason: 'limit_reached',
      remainingQty: remainingQty == null ? 0 : remainingQty,
    };
  }

  return {
    canAdd: true,
    limitingProductIds: [],
    maxQty,
    reason: 'available',
    remainingQty,
  };
}
