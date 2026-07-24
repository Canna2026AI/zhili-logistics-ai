import { HttpException, HttpStatus } from '@nestjs/common';

export class PreconditionRequiredException extends HttpException {
  constructor(
    message = 'If-Match is required for this command',
    code: 'PRECONDITION_REQUIRED' | 'PRECONDITION_INVALID' = 'PRECONDITION_REQUIRED'
  ) {
    super(
      {
        code,
        detail: message,
        remediation: 'Refresh the resource and retry with its latest strong ETag.',
      },
      HttpStatus.PRECONDITION_FAILED
    );
  }
}

export class PreconditionInvalidException extends PreconditionRequiredException {
  constructor(message = 'If-Match must be a strong positive-integer version ETag') {
    super(message, 'PRECONDITION_INVALID');
  }
}

export function parseStrongEtag(value: string | undefined): number {
  if (value === undefined) throw new PreconditionRequiredException();
  const match = /^"([1-9][0-9]*)"$/.exec(value);
  if (!match) throw new PreconditionInvalidException();
  const version = Number(match[1]);
  if (!Number.isSafeInteger(version)) throw new PreconditionInvalidException();
  return version;
}
