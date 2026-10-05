/**
 * Copies only the listed keys from an untrusted body. Used where a full DTO would be
 * impractical (wide forms like members) — it blocks mass assignment of fields such as
 * churchId, id, role or createdById. Unknown keys are silently dropped, not rejected,
 * so older app builds keep working.
 */
export function pick<T extends object = Record<string, unknown>>(
  src: unknown,
  keys: readonly string[],
): Partial<T> {
  const out: Record<string, unknown> = {};
  if (!src || typeof src !== 'object') return out as Partial<T>;
  for (const k of keys) {
    const v = (src as Record<string, unknown>)[k];
    if (v !== undefined) out[k] = v;
  }
  return out as Partial<T>;
}
