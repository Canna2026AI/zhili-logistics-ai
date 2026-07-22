import { Writable } from 'node:stream';
import { describe, expect, it } from 'vitest';
import { createLogger, redact } from '../src';

describe('redact', () => {
  it('redacts secret fields and Chinese mobile numbers', () => {
    expect(redact({ authorization: 'Bearer secret', phone: '13926548800' })).toEqual({
      authorization: '[REDACTED]',
      phone: '139****8800',
    });
  });

  it('redacts nested secrets, phone values, and delivery addresses', () => {
    expect(
      redact({
        delivery: {
          address: '广东省深圳市南山区科技园',
          contactPhone: '13926548800',
          sessionKey: 'session-secret',
        },
      })
    ).toEqual({
      delivery: {
        address: '[REDACTED]',
        contactPhone: '139****8800',
        sessionKey: '[REDACTED]',
      },
    });
  });

  it('redacts credential-bearing environment field names', () => {
    expect(
      redact({
        DATABASE_URL: 'postgresql://user:password@localhost/zhili',
        S3_ACCESS_KEY: 'access-key',
        S3_SECRET_KEY: 'secret-key',
        ENVELOPE_MASTER_KEY: 'master-key',
      })
    ).toEqual({
      DATABASE_URL: '[REDACTED]',
      S3_ACCESS_KEY: '[REDACTED]',
      S3_SECRET_KEY: '[REDACTED]',
      ENVELOPE_MASTER_KEY: '[REDACTED]',
    });
  });

  it('preserves circular structured contexts while redacting them', () => {
    const context: Record<string, unknown> = { phone: '13926548800' };
    const tags: unknown[] = [];
    tags.push(tags);
    context.self = context;
    context.tags = tags;

    const redacted = redact(context);

    expect(redacted.phone).toBe('139****8800');
    expect(redacted.self).toBe(redacted);
    expect((redacted.tags as unknown[])[0]).toBe(redacted.tags);
  });

  it('serializes redacted structured log records', () => {
    const lines: string[] = [];
    const destination = new Writable({
      write(chunk, _encoding, callback) {
        lines.push(chunk.toString());
        callback();
      },
    });
    const logger = createLogger({ level: 'info' }, destination);

    logger.info({ authorization: 'Bearer secret', phone: '13926548800' }, 'request completed');

    expect(JSON.parse(lines[0] ?? '{}')).toMatchObject({
      authorization: '[REDACTED]',
      phone: '139****8800',
      msg: 'request completed',
    });
  });
});
