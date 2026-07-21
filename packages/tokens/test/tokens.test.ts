import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const cssPath = fileURLToPath(new URL('../src/styles.css', import.meta.url));

describe('design tokens', () => {
  const css = readFileSync(cssPath, 'utf8');

  it('locks the approved B palette and shell geometry', () => {
    expect(css).toContain('--zl-color-nav: #1f2937');
    expect(css).toContain('--zl-color-surface: #ffffff');
    expect(css).toContain('--zl-color-primary: #0f766e');
    expect(css).toContain('--zl-sidebar-width: 224px');
    expect(css).toContain('--zl-topbar-height: 48px');
    expect(css).toContain('--zl-tabbar-height: 36px');
  });

  it('does not introduce decorative gradients', () => {
    expect(css).not.toMatch(/linear-gradient|radial-gradient|conic-gradient/i);
  });
});
