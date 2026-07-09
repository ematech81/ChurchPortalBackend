import { registerAs } from '@nestjs/config';

export default registerAs('app', () => ({
  nodeEnv: process.env.NODE_ENV ?? 'development',
  port: parseInt(process.env.PORT ?? '3000', 10),
  jwtSecret: process.env.JWT_SECRET,
  jwtAccessExpiresIn: process.env.JWT_ACCESS_EXPIRES_IN ?? '15m',
  jwtRefreshSecret: process.env.JWT_REFRESH_SECRET,
  jwtRefreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN ?? '30d',
  smtpHost: process.env.SMTP_HOST,
  smtpPort: parseInt(process.env.SMTP_PORT ?? '587', 10),
  smtpUser: process.env.SMTP_USER,
  smtpPass: process.env.SMTP_PASS,
  mailFrom: process.env.MAIL_FROM ?? 'Kingdom Portal <noreply@kingdomportal.app>',
}));
