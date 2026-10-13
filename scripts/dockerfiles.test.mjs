import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

/** The runtime part of a Dockerfile, without the build-stage sources of the COPY lines. */
const runtime = (file) =>
  readFileSync(new URL(`../deploy/${file}`, import.meta.url), 'utf8')
    .split(/^FROM \$\{EPI_NODE_IMAGE\}\s*$/m)
    .at(-1)
    .split('\n')
    .filter((l) => l.trim() && !l.startsWith('#'))
    .map((l) => l.replace(/--from=source-build /, '').replace(/\/src\/build\//, 'build/'));

test('the source build image runs exactly like the regular image', () => {
  assert.deepEqual(runtime('Dockerfile.source'), runtime('Dockerfile'));
});
