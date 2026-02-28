#!/usr/bin/env node
/**
 * watch.js — Auto-syncs HTML whenever content files or site config change.
 *
 * Usage:
 *   node scripts/watch.js
 *
 * Watches:
 *   content/cards/
 *   content/essays/
 *   assets/text/
 *   assets/audio/bgm/
 *   site.yaml
 *
 * On any change, runs the sync script automatically.
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const syncScript = path.join(__dirname, 'sync.js');

const watchPaths = [
  path.join(root, 'content/cards'),
  path.join(root, 'content/essays'),
  path.join(root, 'assets/text'),
  path.join(root, 'assets/audio/bgm'),
  path.join(root, 'site.yaml'),
];

let debounce = null;

function runSync() {
  try {
    const out = execSync('node ' + JSON.stringify(syncScript), { cwd: root, encoding: 'utf8' });
    console.log('\n' + new Date().toLocaleTimeString() + ' — synced:');
    console.log(out);
  } catch (e) {
    console.error('sync error:', e.message);
  }
}

function onChange(eventType, filename) {
  if (debounce) clearTimeout(debounce);
  debounce = setTimeout(runSync, 300);
}

// Ensure directories exist
for (const p of watchPaths) {
  if (!fs.existsSync(p)) {
    if (!p.endsWith('.yaml')) fs.mkdirSync(p, { recursive: true });
  }
}

// Start watchers
for (const p of watchPaths) {
  if (!fs.existsSync(p)) continue;
  fs.watch(p, { recursive: false }, onChange);
}

console.log('Watching for content changes... (Ctrl+C to stop)');
runSync(); // Initial sync
