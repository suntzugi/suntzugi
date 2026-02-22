#!/usr/bin/env node
/**
 * sync-fallback.js
 *
 * Scans essay folders and content.md, then patches the hardcoded HTML
 * fallback in index.html to match. The folders are the source of truth
 * for essays — just drop a .md file in the right folder:
 *
 *   texts/drafts/          → status: draft
 *   texts/ready-to-publish/ → status: ready
 *   texts/essays/           → published (no status)
 *
 * Each .md file should have this header:
 *
 *   # Title
 *   Written: Month Day, Year
 *   Last edited: Month Day, Year
 *   Countdown: 2026-02-22T08:17:00-08:00   (optional, ISO 8601)
 *
 * Usage:
 *   node scripts/sync-fallback.js
 */

const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const contentPath = path.join(root, 'texts/suntzugi/content.md');
const indexPath = path.join(root, 'index.html');

let contentMd = fs.readFileSync(contentPath, 'utf8');
let indexHtml = fs.readFileSync(indexPath, 'utf8');

// ── Parse content.md sections ──
function parseSections(md) {
  const sections = {};
  const blocks = md.split(/^## /m).slice(1);
  for (const block of blocks) {
    const lines = block.split('\n');
    const heading = lines[0].trim();
    const body = lines.slice(1).join('\n');
    sections[heading] = body;
  }
  return sections;
}

function extractField(text, field) {
  const re = new RegExp('\\*\\*' + field + ':\\*\\*\\s*(.+?)(?=\\n\\n\\*\\*|\\n---|$)', 's');
  const m = text.match(re);
  return m ? m[1].trim() : null;
}

function mdToHtml(s) {
  if (!s) return '';
  return s
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank">$1</a>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>');
}

// ── Scan essay folders ──
function scanEssayFolder(dir, status) {
  const fullDir = path.join(root, dir);
  if (!fs.existsSync(fullDir)) return [];
  const files = fs.readdirSync(fullDir).filter(f => f.endsWith('.md'));
  return files.map(f => {
    const slug = path.basename(f, '.md');
    const md = fs.readFileSync(path.join(fullDir, f), 'utf8');
    const lines = md.split('\n');

    let title = slug;
    let written = '';
    let countdown = '';

    for (const line of lines) {
      const tm = line.match(/^#\s+(.+)/);
      if (tm) { title = tm[1].trim(); continue; }
      const wm = line.match(/^Written:\s*(.+)/i);
      if (wm) { written = wm[1].trim(); continue; }
      const cm = line.match(/^Countdown:\s*(.+)/i);
      if (cm) { countdown = cm[1].trim(); continue; }
      // Stop parsing header once we hit body text
      if (line.match(/^Last edited:/i) || line.trim() === '') continue;
      if (line.match(/^Scheduled:/i)) continue;
      break;
    }

    return { slug, title, date: written, status, countdown };
  });
}

const essays = [
  ...scanEssayFolder('texts/essays', null),
  ...scanEssayFolder('texts/ready-to-publish', 'ready'),
  ...scanEssayFolder('texts/drafts', 'draft'),
];

console.log('Found ' + essays.length + ' essay(s):');
essays.forEach(e => console.log('  ' + (e.status || 'published') + ': ' + e.title + ' (' + e.slug + ')'));

// ── Update content.md Essays section ──
let essayLines = essays.map(e => {
  let line = '- [' + e.title + '](#' + e.slug + ')';
  if (e.date) line += ' {date:' + e.date + '}';
  if (e.status) line += ' {status:' + e.status + '}';
  if (e.countdown) line += ' {countdown:' + e.countdown + '}';
  return line;
}).join('\n');

// Replace the Essays section in content.md
contentMd = contentMd.replace(
  /(## Essays\n)\n[\s\S]*?(\n---)/,
  '$1\n' + essayLines + '\n$2'
);
fs.writeFileSync(contentPath, contentMd, 'utf8');
console.log('\nUpdated content.md Essays section.');

// Re-parse after update
const sections = parseSections(contentMd);
let changes = 0;

// ── Sync card fallbacks in HTML ──
const cardMap = {
  'Card 1: Sun (孫)': 'card-sun',
  'Card 2: Tzu (子)': 'card-tzu',
  'Card 3: Gi (龜)': 'card-gi',
  'Card 4: SunTzu (孫子)': 'card-suntzu',
  'Card 5: Tzugi (継ぎ · 子龜)': 'card-tzugi',
  'Card 6: Suntzugi (Full)': 'card-full',
};

for (const [sectionName, cardId] of Object.entries(cardMap)) {
  const section = sections[sectionName];
  if (!section) { console.log('  skip: section "' + sectionName + '" not found'); continue; }

  const character = extractField(section, 'Character');
  const label = extractField(section, 'Label');
  const body = extractField(section, 'Body');
  const bodyP1 = extractField(section, 'Body Part 1');
  const bodyP2 = extractField(section, 'Body Part 2');
  const quote = extractField(section, 'Quote');
  const quoteAttr = extractField(section, 'Quote Attribution');
  const link = extractField(section, 'Link');

  // Find the card block using div-depth counting
  const openTag = '<div class="anno-card" id="' + cardId + '">';
  const startIdx = indexHtml.indexOf(openTag);
  if (startIdx === -1) { console.log('  skip: card element "' + cardId + '" not found in HTML'); continue; }

  let depth = 1;
  let i = startIdx + openTag.length;
  while (i < indexHtml.length && depth > 0) {
    if (indexHtml.startsWith('<div', i)) depth++;
    else if (indexHtml.startsWith('</div>', i)) { depth--; if (depth === 0) break; }
    i++;
  }
  const endIdx = i + '</div>'.length;
  const original = indexHtml.slice(startIdx, endIdx);

  // Build replacement card HTML
  let card = openTag + '\n      <div class="ac-top">\n';
  card += '        <span class="ac-char">' + (character || '') + '</span>\n';
  card += '        <span class="ac-label">' + (label || '') + '</span>\n';
  card += '      </div>\n';

  if (bodyP1 && bodyP2) {
    card += '      <div class="ac-body">\n        ' + mdToHtml(bodyP1) + '\n      </div>\n';
    card += '      <div class="ac-sep"></div>\n';
    card += '      <div class="ac-body">\n        ' + mdToHtml(bodyP2) + '\n      </div>\n';
  } else if (body) {
    const paragraphs = body.split(/\n\n+/);
    paragraphs.forEach((p, idx) => {
      const style = idx > 0 ? ' style="margin-top:.4rem"' : '';
      card += '      <div class="ac-body"' + style + '>\n        ' + mdToHtml(p) + '\n      </div>\n';
    });
  }

  if (quote) {
    card += '      <div class="ac-quote">\n';
    card += '        ' + mdToHtml(quote) + '\n';
    if (quoteAttr) {
      card += '        <span class="attr">— ' + mdToHtml(quoteAttr) + '</span>\n';
    }
    card += '      </div>\n';
  }

  if (link) {
    card += '      <div class="ac-body" style="margin-top:.5rem">\n';
    card += '        ' + mdToHtml(link) + '\n';
    card += '      </div>\n';
  }

  card += '    </div>';

  if (card !== original) {
    indexHtml = indexHtml.slice(0, startIdx) + card + indexHtml.slice(endIdx);
    changes++;
    console.log('  updated: ' + cardId);
  } else {
    console.log('  unchanged: ' + cardId);
  }
}

// ── Sync essay list fallbacks in HTML ──
const drafts = essays.filter(e => e.status === 'draft');
const ready = essays.filter(e => e.status === 'ready');

// Sync draftsList
if (drafts.length) {
  const draftLis = drafts.map(d => {
    let li = '        <li data-draft><a href="#" data-essay="' + d.slug + '">' + d.title + '</a>';
    if (d.countdown) li += ' <span class="countdown" data-target="' + d.countdown + '"></span>';
    li += '</li>';
    return li;
  }).join('\n');
  indexHtml = indexHtml.replace(
    /(<ul class="reading-link-list" id="draftsList">)[\s\S]*?(<\/ul>)/,
    '$1\n' + draftLis + '\n      $2'
  );
  // Make sure draftsBlock is visible
  indexHtml = indexHtml.replace(
    /(<div class="reading-block" id="draftsBlock")(\s+style="display:none")?(>)/,
    '$1$3'
  );
  console.log('  updated: draftsList (' + drafts.length + ' entries)');
  changes++;
} else {
  indexHtml = indexHtml.replace(
    /(<ul class="reading-link-list" id="draftsList">)[\s\S]*?(<\/ul>)/,
    '$1$2'
  );
  indexHtml = indexHtml.replace(
    /(<div class="reading-block" id="draftsBlock")(?:\s+style="display:none")?(>)/,
    '$1 style="display:none"$2'
  );
}

// Sync readyList
if (ready.length) {
  const readyLis = ready.map(r => {
    let li = '        <li data-ready data-pub-time="' + r.countdown + '"><a href="#" data-essay="' + r.slug + '">' + r.title + '</a>';
    if (r.countdown) li += ' <span class="countdown" data-target="' + r.countdown + '"></span>';
    li += '</li>';
    return li;
  }).join('\n');
  indexHtml = indexHtml.replace(
    /(<div class="reading-block" id="readyBlock")(?:\s+style="display:none")?(>)/,
    '$1$2'
  );
  indexHtml = indexHtml.replace(
    /(<ul class="reading-link-list" id="readyList">)[\s\S]*?(<\/ul>)/,
    '$1\n' + readyLis + '\n      $2'
  );
  console.log('  updated: readyList (' + ready.length + ' entries)');
  changes++;
} else {
  indexHtml = indexHtml.replace(
    /(<div class="reading-block" id="readyBlock")(?:\s+style="display:none")?(>)/,
    '$1 style="display:none"$2'
  );
  indexHtml = indexHtml.replace(
    /(<ul class="reading-link-list" id="readyList">)[\s\S]*?(<\/ul>)/,
    '$1$2'
  );
}

// ── Sync audio tracks from audio/bgm/ folder ──
const bgmDir = path.join(root, 'audio/bgm');
if (fs.existsSync(bgmDir)) {
  const mp3s = fs.readdirSync(bgmDir).filter(f => f.endsWith('.mp3')).sort();
  if (mp3s.length) {
    // Parse filenames (Title_Artist.mp3)
    const tracks = mp3s.map(f => {
      const name = f.replace(/\.mp3$/, '');
      const sep = name.indexOf('_');
      if (sep === -1) return { title: name, artist: 'Unknown', file: f };
      return { title: name.substring(0, sep), artist: name.substring(sep + 1), file: f };
    });

    // Update content.md Audio Tracks table
    let table = '| # | Title | Artist |\n|---|-------|--------|\n';
    tracks.forEach((t, i) => {
      table += '| ' + (i + 1) + ' | ' + t.title + ' | ' + t.artist + ' |\n';
    });
    contentMd = fs.readFileSync(contentPath, 'utf8'); // Re-read after essay update
    contentMd = contentMd.replace(
      /(## Audio Tracks\n)\n[\s\S]*?(\n---)/,
      '$1\n' + table + '$2'
    );
    fs.writeFileSync(contentPath, contentMd, 'utf8');
    console.log('  updated: Audio Tracks (' + tracks.length + ' tracks from audio/bgm/)');

    // Update hardcoded tracks array in index.html
    const trackStrings = mp3s.map(f => "    '" + f.replace(/'/g, "\\'") + "'").join(',\n');
    indexHtml = indexHtml.replace(
      /let tracks = \[\n[\s\S]*?\];/,
      'let tracks = [\n' + trackStrings + ',\n  ];'
    );
    console.log('  updated: hardcoded tracks array in HTML');
    changes++;
  }
}

// ── Stamp last-updated date + time (Paris) ──
const now = new Date();
const paris = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Europe/Paris',
  day: '2-digit', month: '2-digit', year: 'numeric',
  hour: '2-digit', minute: '2-digit', hour12: false,
}).formatToParts(now);
const pp = {};
paris.forEach(p => { pp[p.type] = p.value; });
const dateStr = pp.day + '/' + pp.month + '/' + pp.year + ' · ' + pp.hour + ':' + pp.minute + ' Paris';
indexHtml = indexHtml.replace(
  /(<span class="tooltip-text" id="lastUpdated">)last updated: [^<]*/,
  '$1last updated: ' + dateStr
);
console.log('  stamped: last updated ' + dateStr);

fs.writeFileSync(indexPath, indexHtml, 'utf8');
console.log('\n' + (changes ? changes + ' HTML section(s) updated.' : 'No HTML changes needed.'));
