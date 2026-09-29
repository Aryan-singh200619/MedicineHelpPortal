const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const pkgPath = path.join(__dirname, '..', 'package.json');
const packageJson = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));

test('backend exposes a start script for the app server', () => {
  assert.ok(packageJson.scripts && packageJson.scripts.start, 'Missing start script');
  assert.match(packageJson.scripts.start, /node\s+server\.js/i, 'Start script should run server.js');
});
