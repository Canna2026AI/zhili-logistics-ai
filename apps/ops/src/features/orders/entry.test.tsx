// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { defaultOpsOrdersPorts } from './ports';
import { opsOrdersFeatureEntry } from './entry';

describe('production orders feature entry', () => {
  it('fails closed when a composition root does not inject every port', () => {
    expect(() =>
      (opsOrdersFeatureEntry.createElement as unknown as (props?: unknown) => React.ReactElement)()
    ).toThrow(/ports/i);
  });

  it('accepts an explicitly injected complete port set', () => {
    expect(
      opsOrdersFeatureEntry.createElement({
        ports: defaultOpsOrdersPorts,
        initialPage: 'dashboard',
      }).props.ports
    ).toBe(defaultOpsOrdersPorts);
  });
});
