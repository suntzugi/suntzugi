#!/usr/bin/env node
/**
 * watch.js — Auto-syncs HTML fallback whenever essay files or content.md change.
 *
 * Usage:
 *   node scripts/watch.js
 *
 * Watches:
 *   texts/drafts/
 *   texts/ready-to-publish/
 *   texts/essays/
 *   texts/suntzugi/content.md
 *
 * On any change, runs the sync-fallback script automatically.
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const syncScript = path.join(__dirname, 'sync-fallback.js');

const watchPaths = [
  path.join(root, 'texts/drafts'),
  path.join(root, 'texts/ready-to-publish'),
  path.join(root, 'texts/essays'),
  path.join(root, 'texts/suntzugi/content.md'),
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
    if (!p.endsWith('.md')) fs.mkdirSync(p, { recursive: true });
  }
}

// Start watchers
for (const p of watchPaths) {
  if (!fs.existsSync(p)) continue;
  fs.watch(p, { recursive: false }, onChange);
}

console.log('Watching for essay changes... (Ctrl+C to stop)');
runSync(); // Initial sync
