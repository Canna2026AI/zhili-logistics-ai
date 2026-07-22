import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('workspace test isolation', () => {
  it('excludes sibling Git worktrees from root-scoped API integration discovery', async () => {
    const packageJson = JSON.parse(
      await readFile(resolve(import.meta.dirname, '../package.json'), 'utf8')
    ) as { scripts?: Record<string, string> };

    expect(packageJson.scripts?.['test:integration']).toContain("--exclude '**/.worktrees/**'");
  });
});
