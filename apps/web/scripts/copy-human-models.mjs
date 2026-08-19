import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const appDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = path.join(appDirectory, 'node_modules', '@vladmandic', 'human', 'models');
const destination = path.join(appDirectory, 'public', 'models');
const browserBundleSource = path.join(appDirectory, 'node_modules', '@vladmandic', 'human', 'dist', 'human.esm.js');
const browserBundleDestination = path.join(appDirectory, 'generated', 'human.esm.js');

await fs.mkdir(path.dirname(destination), { recursive: true });
await fs.rm(destination, { force: true, recursive: true });
await fs.cp(source, destination, { recursive: true });
await fs.mkdir(path.dirname(browserBundleDestination), { recursive: true });
await fs.copyFile(browserBundleSource, browserBundleDestination);
