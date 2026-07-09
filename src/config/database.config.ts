import { registerAs } from '@nestjs/config';

export default registerAs('database', () => ({
  url: process.env.DATABASE_URL,
  host: process.env.DATABASE_HOST ?? 'localhost',
  port: parseInt(process.env.DATABASE_PORT ?? '5432', 10),
  name: process.env.DATABASE_NAME ?? 'church_saas',
  user: process.env.DATABASE_USER ?? 'postgres',
  password: process.env.DATABASE_PASSWORD ?? 'postgres',
}));
