#!/usr/bin/env node
/**
 * auto-publish.js
 *
 * Checks content.md for {status:ready} essays whose countdown has passed.
 * For each: moves the .md from ready-to-publish/ to published/, and strips
 * {status:ready} + {countdown:...} tags from the content.md line.
 *
 * Usage:
 *   node scripts/auto-publish.js
 */

const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const contentPath = path.join(root, 'texts/suntzugi/content.md');
const readyDir = path.join(root, 'texts/ready-to-publish');
const essaysDir = path.join(root, 'texts/published');

const now = new Date();
let contentMd = fs.readFileSync(contentPath, 'utf8');

// Match essay lines with {status:ready} and {countdown:...}
const readyRe = /^- \[.+?\]\(#(.+?)\).*\{status:ready\}.*\{countdown:([^}]+)\}/;
const lines = contentMd.split('\n');
let published = 0;

for (let i = 0; i < lines.length; i++) {
  const m = lines[i].match(readyRe);
  if (!m) continue;

  const slug = m[1];
  const countdown = new Date(m[2]);

  if (countdown > now) {
    console.log('  not yet: ' + slug + ' (releases ' + m[2] + ')');
    continue;
  }

  // Move the file
  const src = path.join(readyDir, slug + '.md');
  const dest = path.join(essaysDir, slug + '.md');

  if (!fs.existsSync(src)) {
    console.log('  skip: ' + slug + '.md not found in ready-to-publish/');
    continue;
  }

  if (!fs.existsSync(essaysDir)) fs.mkdirSync(essaysDir, { recursive: true });
  fs.renameSync(src, dest);
  console.log('  moved: ' + slug + '.md → texts/published/');

  // Strip {status:ready} and {countdown:...} from the line
  lines[i] = lines[i]
    .replace(/\s*\{status:ready\}/, '')
    .replace(/\s*\{countdown:[^}]+\}/, '');

  published++;
}

if (published) {
  fs.writeFileSync(contentPath, lines.join('\n'), 'utf8');
  console.log('\nPublished ' + published + ' essay(s).');
} else {
  console.log('Nothing to publish.');
}
