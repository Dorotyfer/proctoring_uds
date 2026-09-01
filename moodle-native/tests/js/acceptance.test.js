import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import assert from 'node:assert/strict';

const root = new URL('../../', import.meta.url);

test('native delivery includes installation, privacy and capability documentation', async () => {
  const files = [
    'docs/installation.md',
    'docs/configuration.md',
    'docs/privacy.md',
    'docs/feature-matrix.md',
    'tests/behat/proctoring_native.feature',
    'tests/behat/steps/proctoring_steps.php'
  ];
  await Promise.all(files.map(async (file) => {
    const source = await readFile(new URL(file, root), 'utf8');
    assert.ok(source.length > 100, `${file} should contain delivery guidance`);
  }));
});

test('delivery documentation states native Moodle ownership and the PHP test limitation', async () => {
  const readme = await readFile(new URL('README.md', root), 'utf8');
  const matrix = await readFile(new URL('docs/feature-matrix.md', root), 'utf8');
  assert.match(readme, /sin depender de la API Node\.js externa/i);
  assert.match(readme, /vendor\/bin\/phpunit/);
  assert.match(matrix, /Moodle nativo/);
  assert.match(matrix, /Safe Exam Browser|extensi[oó]n/i);
});
