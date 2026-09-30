import dayjs from 'dayjs';
import { CURRENCY_SYMBOL } from './constants.js';

/**
 * Formats a monetary amount into a clean currency string with 2 decimal places.
 * Note: Never perform float math in the UI; display server-computed values directly.
 * @param {number|string|null|undefined} amount
 * @returns {string}
 */
export function formatCurrency(amount) {
  if (amount === null || amount === undefined || isNaN(Number(amount))) {
    return '—';
  }
  const num = Number(amount);
  return `${CURRENCY_SYMBOL}${num.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

/**
 * Formats date/timestamp using dayjs.
 * @param {string|Date|null|undefined} date
 * @param {string} format
 * @returns {string}
 */
export function formatDate(date, format = 'YYYY-MM-DD HH:mm') {
  if (!date) return '—';
  const parsed = dayjs(date);
  return parsed.isValid() ? parsed.format(format) : '—';
}

/**
 * Formats raw enum codes (e.g. 'purchase_order', 'draft') into user-friendly title strings.
 * @param {string} value
 * @returns {string}
 */
export function formatEnumLabel(value) {
  if (!value) return '';
  return value
    .split('_')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');
}
