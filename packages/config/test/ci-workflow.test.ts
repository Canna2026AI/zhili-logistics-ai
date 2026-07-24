import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const workflow = readFileSync(
  resolve(import.meta.dirname, '../../../.github/workflows/ci.yml'),
  'utf8'
);

describe('GitHub CI resource scheduling', () => {
  it('caps Turbo test process trees without weakening Vitest timeouts', () => {
    expect(workflow).toContain('      - run: pnpm test --concurrency=2\n');
    expect(workflow).not.toMatch(/pnpm test.*(?:testTimeout|test-timeout)/);
  });
});
