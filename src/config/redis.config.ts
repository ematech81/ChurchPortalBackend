import { registerAs } from '@nestjs/config';

/**
 * ioredis only parses a URL when it is passed as a string, not as `{ url }`,
 * so split REDIS_URL into discrete connection options. TLS is enabled only for
 * rediss:// URLs (Upstash), never for local redis://.
 */
export function parseRedisUrl(raw: string) {
  const u = new URL(raw);
  return {
    host: u.hostname,
    port: u.port ? parseInt(u.port, 10) : 6379,
    username: u.username ? decodeURIComponent(u.username) : undefined,
    password: u.password ? decodeURIComponent(u.password) : undefined,
    tls: u.protocol === 'rediss:' ? {} : undefined,
    // Required by BullMQ for blocking commands on worker connections
    maxRetriesPerRequest: null as null,
  };
}

export default registerAs('redis', () => ({
  url: process.env.REDIS_URL ?? 'redis://localhost:6379',
}));
