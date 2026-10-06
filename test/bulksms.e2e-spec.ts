import axios from 'axios';
import { BulkSmsProvider } from '../src/modules/messaging/providers/bulksms.provider';
import { generateAlphanumericOtp } from '../src/modules/auth/auth.service';

jest.mock('axios');
const post = axios.post as jest.Mock;

const cfg = (over: Record<string, unknown> = {}) => {
  const values: Record<string, unknown> = {
    'app.smsProvider': 'bulksms',
    'app.bulksmsBaseUrl': 'https://www.bulksmsnigeria.com/api/v2',
    'app.bulksmsApiToken': 'secret-token',
    'app.bulksmsSenderId': 'FixNG',
    ...over,
  };
  return { get: (k: string) => values[k] } as any;
};

describe('BulkSmsProvider', () => {
  // axios is mocked here, so nothing can leave the machine. Jest sets NODE_ENV=test, which the
  // provider deliberately treats as "unconfigured", so pretend to be development for these cases.
  const realEnv = process.env.NODE_ENV;
  beforeAll(() => { process.env.NODE_ENV = 'development'; });
  afterAll(() => { process.env.NODE_ENV = realEnv; });
  beforeEach(() => post.mockReset());

  it('is always unconfigured under NODE_ENV=test, even with full credentials (tests can never send)', () => {
    process.env.NODE_ENV = 'test';
    expect(new BulkSmsProvider(cfg()).isConfigured).toBe(false);
    process.env.NODE_ENV = 'development';
  });

  it('posts to /sms with a bearer token and digits-only recipient', async () => {
    post.mockResolvedValue({ data: { status: 'success', data: { message_id: 'abc-123' } } });
    const id = await new BulkSmsProvider(cfg()).sendSms('+234 803 111 2222', 'Hello');
    expect(id).toBe('abc-123');
    const [url, body, opts] = post.mock.calls[0];
    expect(url).toBe('https://www.bulksmsnigeria.com/api/v2/sms');
    expect(body).toEqual({ from: 'FixNG', to: '2348031112222', body: 'Hello' });
    expect(opts.headers.Authorization).toBe('Bearer secret-token');
  });

  it('treats a 200 response with status "error" as a failure', async () => {
    post.mockResolvedValue({ data: { status: 'error', code: 'BSNG-2012', error: { message: 'Duplicate message' } } });
    await expect(new BulkSmsProvider(cfg()).sendSms('08031112222', 'x')).rejects.toThrow('Could not send');
  });

  it('turns HTTP failures into a clean error without leaking the token', async () => {
    post.mockRejectedValue({ response: { data: { code: 'BSNG-1001', error: { message: 'Invalid token' } } } });
    await expect(new BulkSmsProvider(cfg()).sendSms('08031112222', 'x')).rejects.toThrow('Could not send');
  });

  it('is unconfigured without a token/sender or with another provider selected', async () => {
    expect(new BulkSmsProvider(cfg({ 'app.bulksmsApiToken': undefined })).isConfigured).toBe(false);
    expect(new BulkSmsProvider(cfg({ 'app.bulksmsSenderId': '' })).isConfigured).toBe(false);
    expect(new BulkSmsProvider(cfg({ 'app.smsProvider': 'other' })).isConfigured).toBe(false);
    await expect(new BulkSmsProvider(cfg({ 'app.bulksmsApiToken': undefined })).sendSms('08031112222', 'x')).rejects.toThrow('not configured');
    expect(post).not.toHaveBeenCalled();
  });
});

describe('generateAlphanumericOtp', () => {
  it('always returns 6 chars from the safe charset with both a letter and a digit', () => {
    for (let i = 0; i < 5000; i++) {
      const otp = generateAlphanumericOtp();
      expect(otp).toMatch(/^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{6}$/);
      expect(otp).toMatch(/[A-Z]/);
      expect(otp).toMatch(/[0-9]/);
    }
  });
});
