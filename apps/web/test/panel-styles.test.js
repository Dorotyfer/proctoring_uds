import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { expect, it } from 'vitest';

const styles = readFileSync(resolve(process.cwd(), 'app/styles.css'), 'utf8');

it('defines the panel visual system and global scrollbar baseline', () => {
  expect(styles).toContain('--panel-accent: #0b7772;');
  expect(styles).toContain('--panel-signal: #b85c3d;');
  expect(styles).toContain('scrollbar-color: var(--scrollbar-thumb) var(--scrollbar-track);');
  expect(styles).toContain('@media (prefers-reduced-motion: reduce)');
});

it('keeps panel navigation actions visually separated', () => {
  expect(styles).toMatch(/\.button-row\s*\{[\s\S]*?display:\s*flex;[\s\S]*?gap:\s*14px;/);
});
