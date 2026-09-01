import { existsSync } from 'node:fs';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const testDirectory = path.dirname(fileURLToPath(import.meta.url));
const pluginDirectory = path.resolve(testDirectory, '..', '..', 'plugins');

test('native Moodle plugin metadata exists', () => {
  assert.equal(existsSync(path.join(pluginDirectory, 'local', 'proctoring', 'version.php')), true);
  assert.equal(existsSync(path.join(pluginDirectory, 'quizaccess', 'proctoring', 'version.php')), true);
});
