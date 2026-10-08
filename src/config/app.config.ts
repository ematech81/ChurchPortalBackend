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
    // Brevo silently drops mail from unverified senders, so the default is the verified one.
    mailFrom: process.env.MAIL_FROM ?? 'Kingdom Portal <nwankwolivinus95@gmail.com>',
    // Only honoured when NODE_ENV !== 'production'. Lets local dev see OTPs in API responses.
    allowDevOtp: process.env.ALLOW_DEV_OTP === 'true' && process.env.NODE_ENV !== 'production',
    // Where the public web app is hosted (no trailing slash). Event registration links are built from it.
    publicWebUrl: (process.env.PUBLIC_WEB_URL ?? '').replace(/\/+$/, ''),
    smsProvider: process.env.SMS_PROVIDER ?? 'bulksms',
    bulksmsBaseUrl: (process.env.BULKSMS_BASE_URL ?? 'https://www.bulksmsnigeria.com/api/v2').replace(/\/+$/, ''),
    bulksmsApiToken: process.env.BULKSMS_API_TOKEN,
    bulksmsSenderId: process.env.BULKSMS_SENDER_ID,
    // Wording matters: the promotional route rejects text that reads like an OTP (BSNG-2013). {code} is replaced.
    smsOtpTemplate: process.env.SMS_OTP_TEMPLATE ?? 'Kingdom Portal sign-in: {code}. Valid for 10 minutes.',
  };
});
