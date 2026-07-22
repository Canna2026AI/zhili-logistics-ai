import { describe, expect, it } from 'vitest';
import { loadEnv, loadWorkerEnv } from '../src';

const validEnv = {
  DATABASE_URL: 'postgresql://localhost/zhili',
  REDIS_URL: 'redis://localhost:6379',
  S3_ENDPOINT: 'https://storage.example.com',
  S3_ACCESS_KEY: 'access-key',
  S3_SECRET_KEY: 'secret-key',
  SESSION_KEY: 'session-key',
  ENVELOPE_MASTER_KEY: 'envelope-key',
};

const validWorkerEnv = {
  ...validEnv,
  WORKER_DATABASE_URL: 'postgresql://zhili_worker_login@localhost/zhili',
};

describe('loadEnv', () => {
  it.each(Object.keys(validEnv))('rejects startup when %s is absent', (missingKey) => {
    const source = { ...validEnv };
    delete source[missingKey as keyof typeof validEnv];

    expect(() => loadEnv(source)).toThrow(missingKey);
  });

  it('keeps non-secret operational defaults safe', () => {
    expect(loadEnv(validEnv)).toMatchObject({
      NODE_ENV: 'production',
      PORT: 3000,
      LOG_LEVEL: 'info',
    });
  });
});

describe('loadWorkerEnv', () => {
  it('requires only the independent worker database URL, not the API URL', () => {
    const workerOnlyEnv: Record<string, string> = { ...validWorkerEnv };
    delete workerOnlyEnv.DATABASE_URL;

    expect(() => loadWorkerEnv(validEnv)).toThrow('WORKER_DATABASE_URL');
    expect(loadWorkerEnv(workerOnlyEnv).WORKER_DATABASE_URL).toBe(
      validWorkerEnv.WORKER_DATABASE_URL
    );
  });
});
