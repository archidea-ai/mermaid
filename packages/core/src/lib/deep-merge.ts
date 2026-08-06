export function deepMerge<T extends object>(base: T, patch: object): T {
  const result: Record<string, unknown> = { ...(base as Record<string, unknown>) };

  for (const [key, patchValue] of Object.entries(patch as Record<string, unknown>)) {
    if (patchValue === undefined) continue;

    const baseValue = result[key];
    result[key] =
      isPlainObject(baseValue) && isPlainObject(patchValue)
        ? deepMerge(baseValue, patchValue)
        : patchValue;
  }

  return result as T;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}
