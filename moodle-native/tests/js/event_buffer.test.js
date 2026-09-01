import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';
import { test } from 'node:test';
import assert from 'node:assert/strict';

const path = new URL('../../plugins/local/proctoring/amd/src/event_buffer.js', import.meta.url);

async function loadBuffer() {
  const source = await readFile(path, 'utf8');
  let module;
  runInNewContext(source, {define: (dependencies, factory) => { module = factory(); }});
  return module;
}

test('event buffer preserves order when the first delivery fails', async () => {
  const bufferModule = await loadBuffer();
  const calls = [];
  let shouldFail = true;
  const buffer = bufferModule.create(9, async (events) => {
    calls.push(events.map((event) => event.clienteventid));
    if (shouldFail) {
      shouldFail = false;
      throw new Error('offline');
    }
  });

  buffer.push({clienteventid: 'one', type: 'face_absent', occurredat: 1});
  buffer.push({clienteventid: 'two', type: 'camera_interrupted', occurredat: 2});
  await assert.rejects(buffer.flush(), {message: 'offline'});
  await buffer.flush();

  assert.equal(JSON.stringify(calls), JSON.stringify([['one', 'two'], ['one', 'two']]));
  assert.equal(buffer.size(), 0);
});
