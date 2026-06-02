export function formatPrice(value: number) {
  return `${Math.round(value).toLocaleString('ru-RU')} ₽`;
}
