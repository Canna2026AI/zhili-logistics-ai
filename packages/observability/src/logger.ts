import pino, {
  type DestinationStream,
  type Logger,
  type LoggerOptions,
  type LogFn,
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

export function createLogger(options: LoggerOptions = {}, destination?: DestinationStream): Logger {
  const {
    formatters: suppliedFormatters,
    hooks: suppliedHooks,
    serializers: suppliedSerializers,
    ...pinoOptions
  } = options;

  return pino(
    {
      ...pinoOptions,
      serializers: { ...suppliedSerializers, ...redactingSerializers },
      hooks: {
        ...suppliedHooks,
        logMethod(args, method, level) {
          const redactedArgs = args.map((argument) =>
            typeof argument === 'string' ? redact(argument) : argument
          ) as Parameters<LogFn>;

          if (suppliedHooks?.logMethod) {
            suppliedHooks.logMethod.call(this, redactedArgs, method, level);
            return;
          }

          method.apply(this, redactedArgs);
        },
      },
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
