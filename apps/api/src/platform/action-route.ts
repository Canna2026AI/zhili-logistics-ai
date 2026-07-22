export const INTERNAL_ACTION_ROUTE_SEGMENT = '__zhili_action__';

const ACTION_NAME = /^[A-Za-z][A-Za-z0-9-]*$/;

export function internalActionPath(basePath: string, action: string): string {
  const base = basePath.replace(/^\/+|\/+$/g, '');
  if (
    base === '' ||
    base.split('/').includes(INTERNAL_ACTION_ROUTE_SEGMENT) ||
    !ACTION_NAME.test(action)
  ) {
    throw new Error('Invalid internal action route');
  }
  return `${base}/${INTERNAL_ACTION_ROUTE_SEGMENT}/${action}`;
}

export function rewriteColonActionUrl(url: string): string {
  const queryStart = url.indexOf('?');
  const path = queryStart === -1 ? url : url.slice(0, queryStart);
  const query = queryStart === -1 ? '' : url.slice(queryStart);
  const segments = path.split('/');

  if (segments.includes(INTERNAL_ACTION_ROUTE_SEGMENT)) {
    return `/__invalid_internal_action_route__${query}`;
  }

  const rewritten = segments.flatMap((segment) => {
    const separator = segment.lastIndexOf(':');
    if (separator <= 0 || separator === segment.length - 1) return [segment];
    const base = segment.slice(0, separator);
    const action = segment.slice(separator + 1);
    return ACTION_NAME.test(action) ? [base, INTERNAL_ACTION_ROUTE_SEGMENT, action] : [segment];
  });

  return `${rewritten.join('/')}${query}`;
}
