import { NotFoundException } from '@nestjs/common';

export interface ParsedResourceAction<Action extends string> {
  readonly resourceId: string;
  readonly action: Action;
}

export function parseResourceActionSegment<const Action extends string>(
  segment: string,
  allowedActions: readonly Action[]
): ParsedResourceAction<Action> {
  const separator = segment.lastIndexOf(':');
  const resourceId = separator > 0 ? segment.slice(0, separator) : '';
  const action = separator > 0 ? segment.slice(separator + 1) : '';

  if (
    resourceId === '' ||
    resourceId.includes(':') ||
    action === '' ||
    !allowedActions.some((allowed) => allowed === action)
  ) {
    throw new NotFoundException();
  }

  return { resourceId, action: action as Action };
}

export function selectRouteVariant<const Variant extends string>(
  segment: string,
  allowedVariants: readonly Variant[]
): Variant {
  const variant = allowedVariants.find((allowed) => allowed === segment);
  if (variant === undefined) throw new NotFoundException();
  return variant;
}
