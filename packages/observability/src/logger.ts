import pino, {
  type DestinationStream,
  type Logger,
  type LoggerOptions,
  type SerializerFn,
} from 'pino';
import { redact } from './redaction';

const SERIALIZED_KEYS = [
  'authorization',
  'cookie',
  'password',
  'secret',
  'token',
  'apiKey',
  'accessKey',
  'sessionKey',
  'envelopeMasterKey',
  'phone',
  'mobile',
  'address',
] as const;

const redactingSerializers = Object.fromEntries(
  SERIALIZED_KEYS.map((key) => [key, redactSerializer(key)])
) as Record<string, SerializerFn>;

export function createLogger(
  options: LoggerOptions = {},
  destination?: DestinationStream
): Logger {
  const { formatters: suppliedFormatters, serializers: suppliedSerializers, ...pinoOptions } = options;

  return pino(
    {
      ...pinoOptions,
      serializers: { ...suppliedSerializers, ...redactingSerializers },
      formatters: {
        ...suppliedFormatters,
        bindings(bindings) {
          const formatted = suppliedFormatters?.bindings?.(bindings) ?? bindings;
          return redact(formatted);
        },
        log(object) {
          const formatted = suppliedFormatters?.log?.(object) ?? object;
          return redact(formatted);
        },
      },
    },
    destination
  );
}

function redactSerializer(key: string): SerializerFn {
  return (value: unknown) => redact({ [key]: value })[key];
}

export type { Logger } from 'pino';
