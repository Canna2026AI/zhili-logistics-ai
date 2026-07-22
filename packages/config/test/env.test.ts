import { describe, expect, it } from 'vitest';
import { loadEnv } from '../src';

describe('loadEnv', () => {
  it('rejects startup when DATABASE_URL is absent', () => {
    expect(() => loadEnv({ NODE_ENV: 'production' })).toThrow('DATABASE_URL');
  });

  it('keeps non-secret operational defaults safe', () => {
    expect(
      loadEnv({
        DATABASE_URL: 'postgresql://localhost/zhili',
        REDIS_URL: 'redis://localhost:6379',
        S3_ENDPOINT: 'https://storage.example.com',
        S3_ACCESS_KEY: 'access-key',
        S3_SECRET_KEY: 'secret-key',
        SESSION_KEY: 'session-key',
        ENVELOPE_MASTER_KEY: 'envelope-key',
      })
    ).toMatchObject({
      NODE_ENV: 'production',
      PORT: 3000,
      LOG_LEVEL: 'info',
    });
  });
});
