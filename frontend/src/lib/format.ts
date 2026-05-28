/**
 * Format a quantity for display. Supports up to 3 decimal places to match the
 * backend `decimal(12,3)` precision. Trailing zeros are stripped so common
 * values render cleanly: 5.0 → "5", 2.50 → "2.5", 0.125 → "0.125".
 *
 * Use `STEP_QTY` as the `step` attribute on number inputs to allow fractional
 * entry while keeping browser validation aligned with backend precision.
 */
export const STEP_QTY = '0.001';
export const MAX_DECIMALS = 3;

export function formatQty(value: number | string | null | undefined): string {
  if (value === null || value === undefined || value === '') return '0';
  const n = typeof value === 'string' ? Number(value) : value;
  if (!Number.isFinite(n)) return '0';
  // Round to MAX_DECIMALS, then strip trailing zeros.
  const fixed = n.toFixed(MAX_DECIMALS);
  return fixed.replace(/\.?0+$/, '') || '0';
}
