import { HttpException, HttpStatus } from '@nestjs/common';

export class PreconditionRequiredException extends HttpException {
  constructor(message = 'If-Match must be a strong version ETag') {
    super(
      {
        code: 'PRECONDITION_FAILED',
        detail: message,
        remediation: 'Refresh the resource and retry with its latest strong ETag.',
      },
      HttpStatus.PRECONDITION_FAILED
    );
  }
}

export function parseStrongEtag(value: string | undefined): number {
  const match = /^"([1-9][0-9]*)"$/.exec(value ?? '');
  if (!match) throw new PreconditionRequiredException();
  const version = Number(match[1]);
  if (!Number.isSafeInteger(version)) throw new PreconditionRequiredException();
  return version;
}
