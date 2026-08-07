export function normalizeInteger(
  value: number | undefined,
  fallback: number,
  minimum: number,
  maximum: number,
  field: string,
): number {
  const candidate = value ?? fallback;
  if (!Number.isFinite(candidate)) {
    throw new TypeError(`${field} 必须是有限数字`);
  }
  return Math.min(maximum, Math.max(minimum, Math.trunc(candidate)));
}
