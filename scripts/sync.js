#!/usr/bin/env node
/**
 * sync.js
 *
 * Single-folder + frontmatter sync script. Replaces sync-fallback.js.
 *
 * Scans content/ for .md files with YAML frontmatter, reads site.yaml for
 * links, scans assets/ for audio tracks and text lists, then bakes
 * everything into index.html.
 *
 * Usage:
 *   node scripts/sync.js
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const root = path.resolve(__dirname, '..');
const indexPath = path.join(root, 'index.html');

let indexHtml = fs.readFileSync(indexPath, 'utf8');

// ── YAML frontmatter parser (minimal, no deps) ──
function parseFrontmatter(content) {
  const match = content.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (!match) return { meta: {}, body: content };
  const meta = {};
  const lines = match[1].split('\n');
  for (const line of lines) {
    const m = line.match(/^(\w[\w_]*)\s*:\s*(.*)$/);
    if (m) {
      let val = m[2].trim();
      // Strip quotes
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'")))
        val = val.slice(1, -1);
      // Inline YAML arrays: [a, b, c]
      if (val.startsWith('[') && val.endsWith(']')) {
        val = val.slice(1, -1).split(',').map(s => {
          s = s.trim();
          if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'")))
            s = s.slice(1, -1);
          return s;
        }).filter(Boolean);
      }
      meta[m[1]] = val;
    }
  }
  return { meta, body: match[2] };
}

// ── Parse site.yaml (minimal, handles the specific structure) ──
function parseSiteYaml(yamlStr) {
  const links = [];
  const lines = yamlStr.split('\n');
  let current = null;
  for (const line of lines) {
    if (line.match(/^\s*- label:\s*(.+)/)) {
      if (current) links.push(current);
      current = { label: line.match(/^\s*- label:\s*(.+)/)[1].trim() };
    } else if (current && line.match(/^\s+url:\s*(.+)/)) {
      let url = line.match(/^\s+url:\s*(.+)/)[1].trim();
      if ((url.startsWith('"') && url.endsWith('"')) || (url.startsWith("'") && url.endsWith("'")))
        url = url.slice(1, -1);
      current.url = url;
    } else if (current && line.match(/^\s+countdown:\s*(.+)/)) {
      current.countdown = line.match(/^\s+countdown:\s*(.+)/)[1].trim();
    }
  }
  if (current) links.push(current);
  return { links };
}

// ── Helper functions (same as old sync-fallback.js) ──
function extractField(text, field) {
  const re = new RegExp('\\*\\*' + field + ':\\*\\*\\s*(.+?)(?=\\n\\*\\*|\\n---|$)', 's');
  const m = text.match(re);
  return m ? m[1].trim() : null;
}

function mdToHtml(s) {
  if (!s) return '';
  return s
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank">$1</a>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/\[\^(\w+)\]/g, '<a class="fn-ref" href="javascript:void(0)" data-fn="fn-$1" id="fnref-$1">$1</a>');
}

function extractFootnotes(text) {
  const footnotes = {};
  const clean = text.split('\n').filter(line => {
    const m = line.match(/^\[\^(\w+)\]:\s*(.+)/);
    if (m) { footnotes[m[1]] = m[2].trim(); return false; }
    return true;
  }).join('\n');
  return { clean, footnotes };
}

function buildFootnotesHtml(footnotes) {
  const keys = Object.keys(footnotes);
  if (!keys.length) return '';
  let html = '      <div class="ac-footnotes essay-footnotes"><ol>\n';
  keys.forEach(id => {
    html += '        <li id="fn-' + id + '">' + mdToHtml(footnotes[id]) + ' <a class="fn-back" data-fn="fnref-' + id + '" title="Back to text">\u21a9</a></li>\n';
  });
  html += '      </ol></div>\n';
  return html;
}

// ── Scan content/cards/ ──
const cardFiles = {
  'sun': 'card-sun',
  'tzu': 'card-tzu',
  'gi': 'card-gi',
  'suntzu': 'card-suntzu',
  'tzugi': 'card-tzugi',
  'suntzugi': 'card-full',
};
const cardsDir = path.join(root, 'content/cards');
let changes = 0;

for (const [slug, cardId] of Object.entries(cardFiles)) {
  const cardPath = path.join(cardsDir, slug + '.md');
  if (!fs.existsSync(cardPath)) { console.log('  skip: ' + cardPath + ' not found'); continue; }
  const raw = fs.readFileSync(cardPath, 'utf8');
  const { body: section } = parseFrontmatter(raw);

  const character = extractField(section, 'Character');
  const label = extractField(section, 'Label');
  const rawBody = extractField(section, 'Body');
  const rawBodyP1 = extractField(section, 'Body Part 1');
  const rawBodyP2 = extractField(section, 'Body Part 2');
  const quote = extractField(section, 'Quote');
  const quoteAttr = extractField(section, 'Quote Attribution');
  const link = extractField(section, 'Link');
  const published = extractField(section, 'Published');
  const lastEdited = extractField(section, 'Last Edited');

  // Extract footnotes from all body fields
  const allBodyText = [rawBody, rawBodyP1, rawBodyP2].filter(Boolean).join('\n');
  const { footnotes: cardFootnotes } = extractFootnotes(allBodyText);
  const body = rawBody ? extractFootnotes(rawBody).clean : null;
  const bodyP1 = rawBodyP1 ? extractFootnotes(rawBodyP1).clean : null;
  const bodyP2 = rawBodyP2 ? extractFootnotes(rawBodyP2).clean : null;

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

  card += buildFootnotesHtml(cardFootnotes);

  if (published) {
    let dateHtml = 'published ' + published.toLowerCase();
    if (lastEdited) dateHtml += ' · last edited ' + lastEdited.toLowerCase();
    card += '      <div class="ac-date">' + dateHtml + '</div>\n';
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

// ── Helper: extract plain-text excerpt from markdown body ──
function extractExcerpt(body, maxLen) {
  const plain = body
    .replace(/\[\^(\w+)\]:\s*.+/g, '')           // strip footnote defs
    .replace(/\[\^(\w+)\]/g, '')                  // strip footnote refs
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')      // [text](url) → text
    .replace(/\*\*(.+?)\*\*/g, '$1')              // **bold** → bold
    .replace(/\*(.+?)\*/g, '$1')                  // *italic* → italic
    .replace(/#+\s*/g, '')                         // strip headings
    .replace(/\n\n+/g, ' ')                        // collapse paragraphs
    .replace(/\n/g, ' ')                           // collapse newlines
    .replace(/\s+/g, ' ')                          // normalize whitespace
    .trim();
  if (plain.length <= maxLen) return plain;
  return plain.slice(0, maxLen).replace(/\s\S*$/, '') + '…';
}

// ── Helper: extract wiki-links [[slug]] or [[slug|text]] from body ──
function extractLinks(body) {
  const re = /\[\[([^\]|]+)(?:\|[^\]]+)?\]\]/g;
  const links = [];
  let m;
  while ((m = re.exec(body)) !== null) {
    const slug = m[1].trim();
    if (!links.includes(slug)) links.push(slug);
  }
  return links;
}

// ── Scan content/writing/ ──
const essaysDir = path.join(root, 'content/writing');
const essays = [];

if (fs.existsSync(essaysDir)) {
  const files = fs.readdirSync(essaysDir).filter(f => f.endsWith('.md'));
  for (const f of files) {
    const slug = path.basename(f, '.md');
    const raw = fs.readFileSync(path.join(essaysDir, f), 'utf8');
    const { meta, body } = parseFrontmatter(raw);

    const title = meta.title || slug;
    const status = meta.status || 'published';
    const publishAt = meta.publish_at || '';
    const publishedAt = meta.published_at || '';
    const type = meta.type || 'essay';
    const tags = Array.isArray(meta.tags) ? meta.tags : [];
    const date = meta.date || '';
    const collection = meta.collection || '';
    const url = meta.url || '';
    const excerpt = extractExcerpt(body, 200);
    const links = extractLinks(body);

    essays.push({ slug, title, status, publishAt, publishedAt, type, tags, date, collection, url, excerpt, links });
  }
}

console.log('Found ' + essays.length + ' essay(s):');
essays.forEach(e => console.log('  ' + e.status + ': ' + e.title + ' (' + e.slug + ')'));

// ── Generate content-index.json ──
const contentIndex = {
  generated: new Date().toISOString(),
  items: essays.map(e => ({
    slug: e.slug,
    title: e.title,
    type: e.type,
    status: e.status,
    date: e.date,
    tags: e.tags,
    collection: e.collection,
    url: e.url,
    publish_at: e.publishAt,
    published_at: e.publishedAt,
    excerpt: e.excerpt,
    links: e.links,
  })),
};
const indexJsonPath = path.join(root, 'content-index.json');
fs.writeFileSync(indexJsonPath, JSON.stringify(contentIndex, null, 2) + '\n', 'utf8');
console.log('  wrote: content-index.json (' + contentIndex.items.length + ' items)');

const drafts = essays.filter(e => e.status === 'draft');
const ready = essays.filter(e => e.status === 'ready');
const published = essays.filter(e => e.status === 'published');

// Sync draftsList
if (drafts.length) {
  const draftLis = drafts.map(d => {
    let li = '        <li data-draft><a href="#" data-essay="' + d.slug + '">' + d.title + '</a>';
    li += ' <span class="draft-flor"></span>';
    li += '</li>';
    return li;
  }).join('\n');
  indexHtml = indexHtml.replace(
    /(<ul class="reading-link-list" id="draftsList">)[\s\S]*?(<\/ul>)/,
    '$1\n' + draftLis + '\n      $2'
  );
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
    let li = '        <li data-ready data-pub-time="' + r.publishAt + '"><a href="#" data-essay="' + r.slug + '">' + r.title + '</a>';
    if (r.publishAt) li += ' <span class="countdown" data-target="' + r.publishAt + '"></span>';
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

// Sync publishedList
if (published.length) {
  const pubLis = published.map(p => {
    // External URL, local PDF, or internal essay
    const pdfPath = path.join(root, p.slug + '.pdf');
    let li;
    if (p.url) {
      li = '        <li><a href="' + p.url + '" target="_blank">' + p.title + '</a>';
      li += ' <span class="content-type-badge">' + p.type + '</span>';
      if (p.date) li += ' <span class="essay-date">' + p.date + '</span>';
    } else if (fs.existsSync(pdfPath)) {
      li = '        <li><a href="' + p.slug + '.pdf" target="_blank">' + p.title + '.pdf</a>';
      li += ' <span class="content-type-badge">' + p.type + '</span>';
      if (p.date) li += ' <span class="essay-date">' + p.date + '</span>';
    } else {
      li = '        <li><a href="#" data-essay="' + p.slug + '">' + p.title + '</a>';
      if (p.publishedAt) li += ' <span class="essay-date">' + p.publishedAt + '</span>';
    }
    li += '</li>';
    return li;
  }).join('\n');
  indexHtml = indexHtml.replace(
    /(<div class="reading-block" id="publishedBlock")(?:\s+style="display:none")?(>)/,
    '$1$2'
  );
  indexHtml = indexHtml.replace(
    /(<ul class="reading-link-list" id="publishedList">)[\s\S]*?(<\/ul>)/,
    '$1\n' + pubLis + '\n      $2'
  );
  console.log('  updated: publishedList (' + published.length + ' entries)');
  changes++;
} else {
  indexHtml = indexHtml.replace(
    /(<div class="reading-block" id="publishedBlock")(?:\s+style="display:none")?(>)/,
    '$1 style="display:none"$2'
  );
  indexHtml = indexHtml.replace(
    /(<ul class="reading-link-list" id="publishedList">)[\s\S]*?(<\/ul>)/,
    '$1$2'
  );
}

// ── Sync links from site.yaml ──
const siteYamlPath = path.join(root, 'site.yaml');
if (fs.existsSync(siteYamlPath)) {
  const yamlStr = fs.readFileSync(siteYamlPath, 'utf8');
  const site = parseSiteYaml(yamlStr);

  if (site.links.length) {
    const linkLis = site.links.map(l => {
      const isMailto = l.url.startsWith('mailto:');
      const isHash = l.url === '#' || l.url.startsWith('#');
      const target = (!isMailto && !isHash) ? ' target="_blank"' : '';
      const neodoreAttr = l.url === '#neodore' ? ' data-neodore' : '';
      let html = '        <li><a href="' + l.url + '"' + target + neodoreAttr + '>' + l.label + '</a>';
      if (l.countdown) html += ' <span class="countdown" data-target="' + l.countdown + '"></span>';
      html += '</li>';
      return html;
    }).join('\n');

    // Find the links block — it's a reading-block without an id, with label "links"
    const linksBlockRe = /(<div class="reading-block">\s*<div class="reading-section-label">links<\/div>\s*<ul class="reading-link-list">)[\s\S]*?(<\/ul>)/;
    if (linksBlockRe.test(indexHtml)) {
      indexHtml = indexHtml.replace(linksBlockRe, '$1\n' + linkLis + '\n      $2');
      console.log('  updated: links (' + site.links.length + ' entries)');
      changes++;
    }
  }
}

// ── Sync audio tracks from assets/audio/bgm/ ──
const bgmDir = path.join(root, 'assets/audio/bgm');
if (fs.existsSync(bgmDir)) {
  const mp3s = fs.readdirSync(bgmDir).filter(f => f.endsWith('.mp3')).sort();
  if (mp3s.length) {
    const trackStrings = mp3s.map(f => "    '" + f.replace(/'/g, "\\'") + "'").join(',\n');
    indexHtml = indexHtml.replace(
      /let tracks = \[\n[\s\S]*?\];/,
      'let tracks = [\n' + trackStrings + ',\n  ];'
    );
    console.log('  updated: hardcoded tracks array (' + mp3s.length + ' tracks)');
    changes++;
  }
}

// ── Sync txt_lists from assets/text/ ──
const txtDir = path.join(root, 'assets/text');
if (fs.existsSync(txtDir)) {
  const txtFiles = fs.readdirSync(txtDir).filter(f => f.endsWith('.txt')).sort();
  const listsObj = {};
  for (const file of txtFiles) {
    const key = file.replace(/\.txt$/, '');
    const lines = fs.readFileSync(path.join(txtDir, file), 'utf8')
      .split('\n').map(l => l.trim()).filter(Boolean);
    if (lines.length) listsObj[key] = lines;
  }

  let objStr = '{\n';
  for (const [key, lines] of Object.entries(listsObj)) {
    const entries = lines.map(l => "    '" + l.replace(/'/g, "\\'") + "'").join(',\n');
    objStr += '  ' + key + ': [\n' + entries + ',\n  ],\n';
  }
  objStr += '}';
  const re = /(var txt_lists = )\{[\s\S]*?\};/;
  const replacement = '$1' + objStr + ';';
  if (re.test(indexHtml)) {
    const updated = indexHtml.replace(re, replacement);
    if (updated !== indexHtml) {
      indexHtml = updated;
      const total = Object.values(listsObj).reduce((s, a) => s + a.length, 0);
      console.log('  updated: txt_lists (' + Object.keys(listsObj).length + ' lists, ' + total + ' entries)');
      changes++;
    } else {
      console.log('  unchanged: txt_lists');
    }
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
