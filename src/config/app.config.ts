import { registerAs } from '@nestjs/config';

export default registerAs('app', () => {
  const jwtSecret = process.env.JWT_SECRET;
  const jwtRefreshSecret = process.env.JWT_REFRESH_SECRET;

  // Fail at boot rather than issuing tokens signed with `undefined`.
  if (!jwtSecret || !jwtRefreshSecret) {
    throw new Error('JWT_SECRET and JWT_REFRESH_SECRET must both be set.');
  }
  if (jwtSecret === jwtRefreshSecret) {
    // Not fatal: refresh tokens carry typ=refresh and are rejected as access tokens.
    // eslint-disable-next-line no-console
    console.warn('[config] JWT_SECRET and JWT_REFRESH_SECRET are identical — use two different secrets.');
  }

  return {
    nodeEnv: process.env.NODE_ENV ?? 'development',
    isProduction: process.env.NODE_ENV === 'production',
    port: parseInt(process.env.PORT ?? '3000', 10),
    jwtSecret,
    jwtAccessExpiresIn: process.env.JWT_ACCESS_EXPIRES_IN ?? '15m',
    jwtRefreshSecret,
    jwtRefreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN ?? '30d',
    brevoApiKey: process.env.BREVO_API_KEY,
    mailFrom: process.env.MAIL_FROM ?? 'Kingdom Portal <noreply@kingdomportal.app>',
    // Only honoured when NODE_ENV !== 'production'. Lets local dev see OTPs in API responses.
    allowDevOtp: process.env.ALLOW_DEV_OTP === 'true' && process.env.NODE_ENV !== 'production',
    termiiBaseUrl: process.env.TERMII_BASE_URL ?? 'https://api.ng.termii.com/api',
    termiiApiKey: process.env.TERMII_API_KEY,
    termiiSenderId: process.env.TERMII_SENDER_ID,
  };
});
