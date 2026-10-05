/**
 * Nigerian-aware phone helpers. Members and users store phones in whatever format
 * the form produced ("0803…", "+234 803…", "803…"), so lookups must compare
 * digits-only variants rather than raw strings.
 */

const digitsOnly = (p: string) => p.replace(/\D/g, '');

/** Digits in international form without '+', e.g. "2348031234567". Non-NG numbers are returned as bare digits. */
export function toInternationalDigits(phone: string): string {
  const d = digitsOnly(phone);
  if (d.startsWith('234') && d.length === 13) return d;
  if (d.startsWith('0') && d.length === 11) return `234${d.slice(1)}`;
  if (d.length === 10) return `234${d}`;
  return d;
}

/** "+2348031234567" — the format SMS gateways expect. */
export function toE164(phone: string): string {
  return `+${toInternationalDigits(phone)}`;
}

/**
 * Every digits-only spelling of a number that may be stored in the DB.
 * Returns [] for input with no digits, so callers can refuse to query
 * (an empty/undefined filter would otherwise match arbitrary rows).
 */
export function phoneDigitVariants(phone: string | null | undefined): string[] {
  if (!phone) return [];
  const intl = toInternationalDigits(phone);
  if (!intl || intl.length < 7) return [];
  const variants = new Set<string>([intl, digitsOnly(phone)]);
  if (intl.startsWith('234') && intl.length === 13) {
    variants.add(`0${intl.slice(3)}`);
    variants.add(intl.slice(3));
  }
  return [...variants];
}

/** SQL expression that strips a phone column down to digits. */
export const sqlDigits = (column: string) => `regexp_replace(${column}, '\\D', '', 'g')`;
