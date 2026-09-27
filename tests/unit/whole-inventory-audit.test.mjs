// Static audit: nothing on a normal path reads the whole inventory.
//
// The patterns below either load every record (`completeItems`,
// `withFullInventory`) or compute over the loaded window as if it were the
// inventory (`liveItems().filter`, `state.items.reduce` …). Each remaining use
// is listed with the reason it is allowed; a new one fails this test until it
// is either replaced by a repository query/aggregate or justified here.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const PATTERN = /completeItems\(|withFullInventory\(|liveItems\(\)\.(reduce|filter|sort|map|find|length)|state\.items\.(filter|sort|reduce|map|find)/;

const ALLOWED = {
  'src/repository.js': 'the repository itself: the window, trash and the load-everything primitive',
  'src/inventory-load.js': 'defines withFullInventory',
  'src/views/manage.js': 'XLSX / JSON export (bounded by EXPORT_LIMITS; CSV above it) and the memory adapter\'s Trash ensure',
  'src/views/home.js': 'the memory adapter\'s ensure and its identifier fallback — never taken with the device engine',
  'src/query.js': 'the memory adapter (cloud backend only)',
  'src/exporting.js': 'the JSON export, after its caller loaded the inventory',
  'src/navigation.js': 'only for a backend that keeps no aggregate (cloud)',
  'src/restore.js': 'the legacy JSON restore, bounded by its file-size limit',
  'src/device-upload.js': 'uploading a device inventory to the cloud (disabled in 1.0)',
};

function files(dir) {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? files(path) : path.endsWith('.js') ? [path] : [];
  });
}

test('no screen or service reads the whole inventory outside the allowed places', () => {
  const offenders = [];
  for (const file of files('src')) {
    const lines = readFileSync(file, 'utf8').split('\n');
    lines.forEach((line, index) => {
      if (/^\s*(\/\/|\*)/.test(line)) return;
      if (PATTERN.test(line) && !ALLOWED[file]) offenders.push(`${file}:${index + 1}: ${line.trim()}`);
    });
  }
  assert.deepEqual(offenders, []);
});

test('the Overview, Assistant, health and insights never touch the window', () => {
  for (const file of ['src/views/overview.js', 'src/views/assistant.js', 'src/insights.js', 'src/health.js', 'src/views/detail.js', 'src/views/backup-reminder.js']) {
    const text = readFileSync(file, 'utf8');
    assert.ok(!/liveItems\(|state\.items|completeItems|withFullInventory/.test(text.replace(/^\s*(\/\/|\*).*$/gm, '')), file);
  }
});
