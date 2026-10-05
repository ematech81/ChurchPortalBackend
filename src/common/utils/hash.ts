/**
 * bcrypt work factor. 12 in production. Tests may lower it via BCRYPT_ROUNDS for speed,
 * but production never goes below 10 regardless of the variable.
 */
const requested = parseInt(process.env.BCRYPT_ROUNDS ?? '12', 10);
export const BCRYPT_ROUNDS =
  process.env.NODE_ENV === 'production'
    ? Math.max(10, Number.isFinite(requested) ? requested : 12)
    : Number.isFinite(requested) && requested >= 4 ? requested : 12;
