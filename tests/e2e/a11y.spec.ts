import { expect, test } from '@playwright/test';
import axe from 'axe-core';

interface AxeViolation {
  id: string;
  impact: string | null;
  help: string;
  nodes: Array<{ html: string; target: string[] }>;
}

const surfaces = [
  ['运营端', 'http://127.0.0.1:4100'],
  ['客户门户', 'http://127.0.0.1:4101'],
  ['PDA', 'http://127.0.0.1:4102'],
  ['平台端', 'http://127.0.0.1:4103'],
  ['官网', 'http://127.0.0.1:4104'],
] as const;

test('五端首屏没有严重或致命的浏览器级 axe 问题', async ({ page }) => {
  for (const [name, url] of surfaces) {
    await page.setViewportSize(
      name === 'PDA' ? { width: 390, height: 844 } : { width: 1440, height: 900 }
    );
    await page.goto(url);
    await page.addScriptTag({ content: axe.source });

    const violations = await page.evaluate(async () => {
      const axeRuntime = (
        globalThis as typeof globalThis & {
          axe: {
            run: (
              context: Document,
              options: { runOnly: { type: string; values: string[] } }
            ) => Promise<{ violations: AxeViolation[] }>;
          };
        }
      ).axe;
      const result = await axeRuntime.run(document, {
        runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa'] },
      });
      return result.violations.filter(
        (violation) => violation.impact === 'critical' || violation.impact === 'serious'
      );
    });

    expect(violations, `${name} axe violations`).toEqual([]);
  }
});
