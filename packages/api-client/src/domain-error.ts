export interface DomainApiErrorOptions {
  status?: number;
  code?: string;
  remediation?: string;
  requestId?: string;
  details?: unknown;
  context?: Record<string, unknown>;
  cause?: unknown;
}

export class DomainApiError extends Error {
  readonly status?: number;
  readonly code?: string;
  readonly remediation?: string;
  readonly requestId?: string;
  readonly details?: unknown;
  readonly context?: Record<string, unknown>;

  constructor(message: string, options: DomainApiErrorOptions = {}) {
    super(message, { cause: options.cause });
    this.name = 'DomainApiError';
    this.status = options.status;
    this.code = options.code;
    this.remediation = options.remediation;
    this.requestId = options.requestId;
    this.details = options.details;
    this.context = options.context;
  }
}

function record(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null
    ? (value as Record<string, unknown>)
    : undefined;
}

function text(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value : undefined;
}

function number(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

export function toDomainApiError(error: unknown, response?: Response): DomainApiError {
  if (error instanceof DomainApiError) return error;
  const source = record(error);
  const message =
    text(source?.message) ??
    text(source?.detail) ??
    text(source?.title) ??
    (error instanceof Error ? error.message : undefined) ??
    'API 命令执行失败';
  return new DomainApiError(message, {
    status: response?.status || number(source?.status),
    code: text(source?.code),
    remediation: text(source?.remediation),
    requestId: text(source?.requestId),
    details: source?.details,
    context: record(source?.context),
    cause: error,
  });
}
