import { HttpException, type ArgumentsHost, type ExceptionFilter } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { FastifyReply } from 'fastify';
import { createLogger } from '@zhili/observability';
import type { RequestContext } from './request-context';

export interface ProblemLogger {
  error(context: unknown, message?: string): void;
}

export interface ProblemDetailsBody {
  readonly code: string;
  readonly detail: string;
  readonly remediation: string;
  readonly requestId: string;
}

interface ProblemDefinition {
  readonly code: string;
  readonly detail: string;
  readonly remediation: string;
}

const PROBLEMS: Readonly<Record<number, ProblemDefinition>> = {
  400: {
    code: 'BAD_REQUEST',
    detail: 'The request is invalid.',
    remediation: 'Correct the request and retry.',
  },
  401: {
    code: 'UNAUTHORIZED',
    detail: 'Authentication is required.',
    remediation: 'Sign in again and retry the request.',
  },
  403: {
    code: 'FORBIDDEN',
    detail: 'The authenticated principal cannot perform this action.',
    remediation: 'Request the required permission from a tenant administrator.',
  },
  404: {
    code: 'NOT_FOUND',
    detail: 'The resource was not found in the caller data scope.',
    remediation: 'Check the identifier and current data scope before retrying.',
  },
  409: {
    code: 'CONFLICT',
    detail: 'The request conflicts with current server state.',
    remediation: 'Refresh current state and retry with a new request intent if needed.',
  },
  412: {
    code: 'PRECONDITION_FAILED',
    detail: 'A request precondition failed.',
    remediation: 'Refresh the resource and retry with its latest version.',
  },
  413: {
    code: 'PAYLOAD_TOO_LARGE',
    detail: 'The request payload is too large.',
    remediation: 'Reduce the payload size and retry.',
  },
  422: {
    code: 'UNPROCESSABLE_ENTITY',
    detail: 'The request failed semantic validation.',
    remediation: 'Correct the validation errors and retry.',
  },
  429: {
    code: 'RATE_LIMITED',
    detail: 'Too many requests were received.',
    remediation: 'Wait for the retry interval before trying again.',
  },
  500: {
    code: 'INTERNAL_ERROR',
    detail: 'The service could not complete the request.',
    remediation: 'Retry later and provide the request ID if the failure persists.',
  },
};

export class ProblemFilter implements ExceptionFilter {
  constructor(private readonly logger: ProblemLogger = createLogger({ name: 'zhili-api' })) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    const request = http.getRequest<{
      headers?: Record<string, string | readonly string[] | undefined>;
      requestContext?: RequestContext;
    }>();
    const reply = http.getResponse<FastifyReply>();
    const requestId =
      request.requestContext?.requestId ?? requestIdFromRequestHeaders(request.headers ?? {});
    const problem = mapExceptionToProblem(exception, requestId);

    if (!(exception instanceof HttpException)) {
      this.logger.error(
        { exception: allowlistedExceptionDiagnostic(exception), requestId },
        'Unhandled request exception'
      );
    }

    reply
      .status(problem.status)
      .header('content-type', 'application/problem+json')
      .header('x-request-id', requestId)
      .send(problem.body);
  }
}

export function mapExceptionToProblem(
  exception: unknown,
  requestId: string
): { readonly body: ProblemDetailsBody; readonly status: number } {
  const known = exception instanceof HttpException;
  const candidateStatus = known ? exception.getStatus() : 500;
  const status = PROBLEMS[candidateStatus] ? candidateStatus : 500;
  const fallback = PROBLEMS[status] ?? PROBLEMS[500]!;
  const supplied = known && status !== 500 ? problemFields(exception.getResponse()) : {};

  return {
    status,
    body: {
      code: supplied.code ?? fallback.code,
      detail: supplied.detail ?? fallback.detail,
      remediation: supplied.remediation ?? fallback.remediation,
      requestId,
    },
  };
}

function problemFields(value: string | object): Partial<ProblemDefinition> {
  if (typeof value === 'string') return { detail: value };
  if (!isRecord(value)) return {};
  return {
    code: typeof value.code === 'string' ? value.code : undefined,
    detail:
      typeof value.detail === 'string'
        ? value.detail
        : typeof value.message === 'string'
          ? value.message
          : undefined,
    remediation: typeof value.remediation === 'string' ? value.remediation : undefined,
  };
}

function requestIdFromRequestHeaders(
  headers: Record<string, string | readonly string[] | undefined>
): string {
  const supplied = headers['x-request-id'];
  return typeof supplied === 'string' && supplied.trim() !== '' ? supplied : randomUUID();
}

function allowlistedExceptionDiagnostic(exception: unknown): Readonly<Record<string, string>> {
  if (exception instanceof Error) return { type: 'Error' };
  if (exception === null) return { type: 'null' };
  return { type: typeof exception };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
