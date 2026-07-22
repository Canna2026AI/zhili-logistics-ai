const SENSITIVE_KEY_NAMES = new Set([
  'authorization',
  'databaseurl',
  'redisurl',
  'cookie',
  'password',
  'secret',
  'token',
  'apikey',
  'accesskey',
  's3accesskey',
  's3secretkey',
  'sessionkey',
  'envelopemasterkey',
]);

const ADDRESS_KEY_PATTERN = /(?:address|addr|street|location|地址)/i;
const CHINESE_MOBILE_PATTERN = /(?<!\d)(1[3-9]\d)\d{4}(\d{4})(?!\d)/g;
const COOKIE_HEADER_PATTERN = /\b(cookie)\b\s*([:=])[^\r\n]*/gi;
const SENSITIVE_MESSAGE_PATTERN =
  /\b(authorization|cookie|password|secret|token|api[ _-]?key|access[ _-]?key|session[ _-]?key|envelope[ _-]?master[ _-]?key)\b\s*([:=])(\s*)(?:Bearer\s+)?[^\s,;]+/gi;
const ADDRESS_MESSAGE_PATTERN = /\b(address|addr|street|location)\b\s*([:=])\s*[^,;\n]+|地址\s*([:=])\s*[^,;\n]+/gi;

export const redactedValue = '[REDACTED]';

export function redact<T>(value: T): T {
  return redactValue(value, undefined, new WeakMap<object, unknown>()) as T;
}

function redactValue(value: unknown, key: string | undefined, seen: WeakMap<object, unknown>): unknown {
  if (key && isSensitiveKey(key)) {
    return redactedValue;
  }

  if (key && ADDRESS_KEY_PATTERN.test(key) && typeof value === 'string') {
    return redactedValue;
  }

  if (typeof value === 'string') {
    return redactMessage(value);
  }

  if (Array.isArray(value)) {
    const existing = seen.get(value);
    if (existing) {
      return existing;
    }

    const clone: unknown[] = [];
    seen.set(value, clone);
    for (const item of value) {
      clone.push(redactValue(item, undefined, seen));
    }
    return clone;
  }

  if (!isPlainRecord(value)) {
    return value;
  }

  const existing = seen.get(value);
  if (existing) {
    return existing;
  }

  const clone: Record<string, unknown> = {};
  seen.set(value, clone);
  for (const [childKey, childValue] of Object.entries(value)) {
    clone[childKey] = redactValue(childValue, childKey, seen);
  }
  return clone;
}

function redactMessage(value: string): string {
  return value
    .replace(COOKIE_HEADER_PATTERN, '$1$2 [REDACTED]')
    .replace(SENSITIVE_MESSAGE_PATTERN, '$1$2$3[REDACTED]')
    .replace(ADDRESS_MESSAGE_PATTERN, (match, latinKey, latinSeparator, chineseSeparator) => {
      if (latinKey) {
        return `${latinKey}${latinSeparator} ${redactedValue}`;
      }
      return `地址${chineseSeparator} ${redactedValue}`;
    })
    .replace(CHINESE_MOBILE_PATTERN, '$1****$2');
}

function isSensitiveKey(key: string): boolean {
  return SENSITIVE_KEY_NAMES.has(key.replace(/[^a-z0-9]/gi, '').toLowerCase());
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== 'object') {
    return false;
  }

  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}
