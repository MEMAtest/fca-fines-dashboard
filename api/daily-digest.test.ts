import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import handler, { isDailyDigestAuthorised } from './daily-digest.js';
import { getDailySummary } from '../server/services/analytics.js';

const { send, clientOptions } = vi.hoisted(() => ({ send: vi.fn(), clientOptions: vi.fn() }));

vi.mock('@aws-sdk/client-ses', () => ({
  SESClient: class {
    constructor(options: unknown) {
      clientOptions(options);
    }

    send = send;
  },
  SendEmailCommand: class {
    input: unknown;

    constructor(input: unknown) {
      this.input = input;
    }
  },
}));

vi.mock('../server/services/analytics.js', () => ({
  getDailySummary: vi.fn(),
}));

const mockedGetDailySummary = vi.mocked(getDailySummary);

function request(
  method = 'GET',
  authorization?: string,
): VercelRequest {
  return {
    method,
    headers: authorization ? { authorization } : {},
  } as unknown as VercelRequest;
}

function response() {
  const result = {
    status: vi.fn(),
    json: vi.fn(),
    setHeader: vi.fn(),
  };
  result.status.mockReturnValue(result);
  result.json.mockReturnValue(result);
  return result as unknown as VercelResponse & typeof result;
}

describe('daily digest endpoint controls', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env.CRON_SECRET = 'test-cron-secret';
    process.env.AWS_ACCESS_KEY_ID = 'test-access-key';
    process.env.AWS_SECRET_ACCESS_KEY = 'test-secret-key';
    process.env.AWS_SES_REGION = 'eu-west-2';
    process.env.SES_FROM_EMAIL = 'alerts@example.com';
    process.env.DAILY_DIGEST_TO = 'owner@example.com';
    mockedGetDailySummary.mockReset();
    mockedGetDailySummary.mockResolvedValue({
      totalPageviews: 12,
      topPaths: [{ path: '/fines', hits: 8 }],
      latestNotice: null,
    });
    send.mockReset();
    send.mockResolvedValue({ MessageId: 'ses-message-1' });
    clientOptions.mockReset();
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it('sends one SES message with the configured digest recipient', async () => {
    const res = response();

    await handler(request('GET', 'Bearer test-cron-secret'), res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(mockedGetDailySummary).toHaveBeenCalledTimes(1);
    expect(send).toHaveBeenCalledTimes(1);
    expect(clientOptions).toHaveBeenCalledWith(expect.objectContaining({
      region: 'eu-west-2',
      maxAttempts: 1,
      credentials: { accessKeyId: 'test-access-key', secretAccessKey: 'test-secret-key' },
    }));
    expect(send.mock.calls[0]?.[0]).toMatchObject({
      input: {
        Source: 'alerts@example.com',
        Destination: { ToAddresses: ['owner@example.com'] },
        Message: {
          Subject: { Data: 'RegActions – daily summary', Charset: 'UTF-8' },
        },
      },
    });
  });

  it('returns a provider failure without retrying or sending a duplicate', async () => {
    send.mockRejectedValueOnce(new Error('SES unavailable'));
    const res = response();

    await handler(request('GET', 'Bearer test-cron-secret'), res);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({ success: false, error: 'SES unavailable' });
    expect(mockedGetDailySummary).toHaveBeenCalledTimes(1);
    expect(send).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['missing authorization', undefined],
    ['invalid authorization', 'Bearer wrong-secret'],
  ])('rejects %s without side effects', async (_label, authorization) => {
    const res = response();

    await handler(request('GET', authorization), res);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(mockedGetDailySummary).not.toHaveBeenCalled();
    expect(send).not.toHaveBeenCalled();
  });

  it('fails closed when CRON_SECRET is unset without side effects', async () => {
    delete process.env.CRON_SECRET;
    const res = response();

    await handler(request('GET', 'Bearer test-cron-secret'), res);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(mockedGetDailySummary).not.toHaveBeenCalled();
    expect(send).not.toHaveBeenCalled();
  });

  it('rejects non-GET methods before authentication or email work', async () => {
    const res = response();

    await handler(request('POST', 'Bearer test-cron-secret'), res);

    expect(res.setHeader).toHaveBeenCalledWith('Allow', 'GET');
    expect(res.status).toHaveBeenCalledWith(405);
    expect(mockedGetDailySummary).not.toHaveBeenCalled();
    expect(send).not.toHaveBeenCalled();
  });
});

describe('daily digest auth helper', () => {
  it('requires an exact configured secret', () => {
    expect(isDailyDigestAuthorised('Bearer expected', 'expected')).toBe(true);
    expect(isDailyDigestAuthorised('bearer expected', 'expected')).toBe(true);
    expect(isDailyDigestAuthorised('Bearer wrong', 'expected')).toBe(false);
    expect(isDailyDigestAuthorised(undefined, 'expected')).toBe(false);
    expect(isDailyDigestAuthorised('Bearer expected', undefined)).toBe(false);
  });
});
