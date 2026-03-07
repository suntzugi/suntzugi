#!/usr/bin/env node
/**
 * auto-publish.js
 *
 * Scans content/writing/ for files with status: ready and publish_at in the past.
 * Updates frontmatter in-place: status → published, adds published_at timestamp.
 * No file moving, no content.md.
 *
 * Usage:
 *   node scripts/auto-publish.js
 */

const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const essaysDir = path.join(root, 'content/writing');
const now = new Date();
let published = 0;

if (!fs.existsSync(essaysDir)) {
  console.log('No essays directory found.');
  process.exit(0);
}

const files = fs.readdirSync(essaysDir).filter(f => f.endsWith('.md'));

for (const file of files) {
  const filePath = path.join(essaysDir, file);
  const content = fs.readFileSync(filePath, 'utf8');

  // Parse frontmatter
  const match = content.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (!match) continue;

  const fmLines = match[1].split('\n');
  const body = match[2];
  const meta = {};

  for (const line of fmLines) {
    const m = line.match(/^(\w[\w_]*)\s*:\s*(.*)$/);
    if (m) meta[m[1]] = m[2].trim();
  }

  if (meta.status !== 'ready') continue;
  if (!meta.publish_at) {
    console.log('  skip: ' + file + ' (status: ready but no publish_at)');
    continue;
  }

  const publishAt = new Date(meta.publish_at);
  if (publishAt > now) {
    console.log('  not yet: ' + file + ' (releases ' + meta.publish_at + ')');
    continue;
  }

  // Update frontmatter in-place
  const nowIso = now.toISOString();
  const newFmLines = fmLines.map(line => {
    if (line.match(/^status:\s*/)) return 'status: published';
    return line;
  });
  // Add published_at if not already present
  if (!meta.published_at) {
    // Insert published_at after publish_at line
    const idx = newFmLines.findIndex(l => l.match(/^publish_at:\s*/));
    if (idx !== -1) {
      newFmLines.splice(idx + 1, 0, 'published_at: ' + nowIso);
    } else {
      newFmLines.push('published_at: ' + nowIso);
    }
  }

  const newContent = '---\n' + newFmLines.join('\n') + '\n---\n' + body;
  fs.writeFileSync(filePath, newContent, 'utf8');
  console.log('  published: ' + file);
  published++;
}

if (published) {
  console.log('\nPublished ' + published + ' essay(s).');
} else {
  console.log('Nothing to publish.');
}
