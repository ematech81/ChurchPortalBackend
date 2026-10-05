import 'reflect-metadata';
import { INestApplication, ValidationPipe, VersioningType } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { DataSource } from 'typeorm';

// Environment must be set BEFORE AppModule is imported (config factories read process.env).
// Hard guard: these tests wipe tables — never let them point at anything but the local container.
const TEST_DB = 'postgresql://postgres:postgres@localhost:55432/kp_test';
process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = TEST_DB;
process.env.REDIS_URL = 'redis://localhost:56379';
process.env.JWT_SECRET = 'test-access-secret-0123456789';
process.env.JWT_REFRESH_SECRET = 'test-refresh-secret-9876543210';
process.env.DB_SYNCHRONIZE = 'false';
process.env.DB_RUN_MIGRATIONS = 'true';
process.env.ALLOW_DEV_OTP = 'true';
process.env.BCRYPT_ROUNDS = '4';
delete process.env.BREVO_API_KEY;
delete process.env.TERMII_API_KEY;
delete process.env.TERMII_SENDER_ID;

import { AppModule } from '../../src/app.module';
import { MailService } from '../../src/modules/mail/mail.service';
import { GlobalExceptionFilter } from '../../src/common/filters/http-exception.filter';

export const sentOtps = new Map<string, string>(); // email -> latest code

export async function createApp(): Promise<{ app: INestApplication; ds: DataSource }> {
  if (process.env.DATABASE_URL !== TEST_DB) throw new Error('Refusing to run against a non-test database');

  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(MailService)
    .useValue({
      isConfigured: true,
      sendOtp: async (email: string, code: string) => {
        sentOtps.set(email.toLowerCase(), code);
      },
    })
    .compile();

  const app = moduleRef.createNestApplication<NestExpressApplication>();
  app.set('trust proxy', 1);
  app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );
  app.useGlobalFilters(new GlobalExceptionFilter());
  await app.init();
  return { app, ds: app.get(DataSource) };
}

export async function resetDb(ds: DataSource) {
  const tables = await ds.query(
    `SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename <> 'migrations'`,
  );
  if (tables.length) {
    await ds.query(`TRUNCATE ${tables.map((t: any) => `"${t.tablename}"`).join(', ')} RESTART IDENTITY CASCADE`);
  }
}

let ipCounter = 10;
/** Each test client gets its own "IP" so rate-limit tests don't bleed into others. */
export function nextIp() {
  ipCounter += 1;
  return `10.1.${Math.floor(ipCounter / 250)}.${ipCounter % 250}`;
}

export interface Session {
  accessToken: string;
  refreshToken: string;
  user: any;
  ip: string;
}

export function api(app: INestApplication, s?: Pick<Session, 'accessToken' | 'ip'>) {
  const ip = s?.ip ?? nextIp();
  const wrap = (m: 'get' | 'post' | 'patch' | 'delete') => (url: string) => {
    const r = (request(app.getHttpServer()) as any)[m](`/v1${url}`).set('X-Forwarded-For', ip);
    return s?.accessToken ? r.set('Authorization', `Bearer ${s.accessToken}`) : r;
  };
  return { get: wrap('get'), post: wrap('post'), patch: wrap('patch'), delete: wrap('delete'), ip };
}

let emailSeq = 0;
/** Registers + verifies an account. Returns tokens for a church-less `member` user. */
export async function signUp(app: INestApplication, opts: { phone?: string; name?: string } = {}): Promise<Session> {
  emailSeq += 1;
  const email = `user${emailSeq}-${Date.now()}@test.dev`;
  const c = api(app);
  await c.post('/auth/register').send({
    firstName: opts.name ?? 'Test',
    lastName: `User${emailSeq}`,
    email,
    password: 'Passw0rd!x',
    ...(opts.phone ? { phone: opts.phone } : {}),
  }).expect(201);
  const res = await c.post('/auth/verify-otp').send({ email, code: sentOtps.get(email)! }).expect(200);
  return { ...res.body, ip: c.ip };
}

/** Full onboarding: sign up + create HQ church → Senior Pastor session. */
export async function seniorPastor(app: INestApplication, opts: { phone?: string; churchName?: string } = {}): Promise<Session & { churchId: string }> {
  const s = await signUp(app, { phone: opts.phone });
  const res = await api(app, s).post('/churches').send({ name: opts.churchName ?? 'Grace Chapel' }).expect(201);
  return { ...res.body, ip: s.ip, churchId: res.body.church.id };
}
