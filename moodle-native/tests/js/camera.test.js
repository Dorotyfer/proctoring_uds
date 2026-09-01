import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';
import { test } from 'node:test';
import assert from 'node:assert/strict';

const path = new URL('../../plugins/local/proctoring/amd/src/camera.js', import.meta.url);

async function loadCamera(overrides = {}) {
  const source = await readFile(path, 'utf8');
  let module;
  const context = {
    define: (dependencies, factory) => {
      module = factory();
    },
    navigator: overrides.navigator,
    document: overrides.document
  };
  runInNewContext(source, context);
  return module;
}

test('camera request normalizes permission denial', async () => {
  const camera = await loadCamera({
    navigator: {
      mediaDevices: {
        getUserMedia: async () => {
          throw new Error('Permission denied');
        }
      }
    }
  });

  await assert.rejects(camera.request(), {message: 'camera_denied'});
});

test('camera capture returns a jpeg only when video has dimensions', async () => {
  const calls = [];
  const camera = await loadCamera({
    document: {
      createElement: () => ({
        width: 0,
        height: 0,
        getContext: () => ({drawImage: (...args) => calls.push(args)}),
        toDataURL: () => 'data:image/jpeg;base64,capture'
      })
    }
  });

  assert.equal(camera.captureJpeg({videoWidth: 0, videoHeight: 0}), null);
  assert.equal(camera.captureJpeg({videoWidth: 640, videoHeight: 480}), 'data:image/jpeg;base64,capture');
  assert.equal(calls.length, 1);
});
