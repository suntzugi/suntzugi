#!/usr/bin/env node
/**
 * stats.js — Project size and performance benchmarks.
 *
 * Prints a snapshot of the project's vital stats: file counts, line counts,
 * file sizes, and runtime request count. Can compare against a git ref
 * to show deltas.
 *
 * Usage:
 *   node scripts/stats.js              # current stats
 *   node scripts/stats.js --compare HEAD~5   # compare against a ref
 *   node scripts/stats.js --compare 2226a0f  # compare against a specific commit
 *   node scripts/stats.js --json             # output as JSON
 *   node scripts/stats.js --log              # append snapshot to devlog/stats.jsonl
 *
 * The --log flag is called automatically by the pre-commit hook,
 * building a time series of stats over every commit.
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const root = path.resolve(__dirname, '..');
const args = process.argv.slice(2);
const compareRef = args.includes('--compare') ? args[args.indexOf('--compare') + 1] : null;
const jsonMode = args.includes('--json');
const logMode = args.includes('--log');

function run(cmd) {
  try {
    return execSync(cmd, { cwd: root, encoding: 'utf8' }).trim();
  } catch (e) {
    return '';
  }
}

function getStats(ref) {
  const isWorktree = !ref;
  const stats = {};

  if (isWorktree) {
    // Current working tree stats
    const indexPath = path.join(root, 'index.html');
    const indexContent = fs.readFileSync(indexPath, 'utf8');
    stats.index_html_bytes = Buffer.byteLength(indexContent, 'utf8');
    stats.index_html_lines = indexContent.split('\n').length;

    // Count script blocks
    stats.script_blocks = (indexContent.match(/<script>/g) || []).length;

    // Total text file lines
    const textExts = /\.(html|js|md|css|yaml|yml|txt|json)$/;
    const allFiles = run('git ls-files').split('\n').filter(f => textExts.test(f));
    stats.text_files = allFiles.length;
    stats.total_files = run('git ls-files').split('\n').filter(Boolean).length;

    let totalLines = 0;
    for (const f of allFiles) {
      try {
        const content = fs.readFileSync(path.join(root, f), 'utf8');
        totalLines += content.split('\n').length;
      } catch (e) {}
    }
    stats.total_lines = totalLines;

    // Content files
    const contentFiles = allFiles.filter(f => f.startsWith('content/') || f === 'site.yaml' || f.startsWith('assets/text/'));
    let contentBytes = 0;
    for (const f of contentFiles) {
      try {
        contentBytes += fs.statSync(path.join(root, f)).size;
      } catch (e) {}
    }
    stats.content_bytes = contentBytes;

    // Build scripts
    const scriptFiles = ['scripts/sync.js', 'scripts/auto-publish.js', 'scripts/watch.js'];
    let scriptLines = 0;
    for (const f of scriptFiles) {
      try {
        scriptLines += fs.readFileSync(path.join(root, f), 'utf8').split('\n').length;
      } catch (e) {}
    }
    stats.build_script_lines = scriptLines;

    // Runtime HTTP requests (count fetch calls in index.html that run on page load)
    // index.html itself is always 1, then count non-essay fetch() calls
    const fetchCalls = (indexContent.match(/fetch\(['"]/g) || []).length;
    // loadEssay fetch is on-click, not page load — subtract 1
    const essayFetch = /fetch\('content\/essays\//.test(indexContent) ? 1 : 0;
    stats.runtime_requests = 1 + fetchCalls - essayFetch; // 1 for index.html itself

  } else {
    // Stats from a git ref
    const indexContent = run(`git show ${ref}:index.html`);
    if (!indexContent) return null;
    stats.index_html_bytes = Buffer.byteLength(indexContent, 'utf8');
    stats.index_html_lines = indexContent.split('\n').length;
    stats.script_blocks = (indexContent.match(/<script>/g) || []).length;

    const textExts = /\.(html|js|md|css|yaml|yml|txt|json)$/;
    const allFilesRaw = run(`git ls-tree -r --name-only ${ref}`);
    if (!allFilesRaw) return null;
    const allFiles = allFilesRaw.split('\n').filter(Boolean);
    const textFiles = allFiles.filter(f => textExts.test(f));
    stats.text_files = textFiles.length;
    stats.total_files = allFiles.length;

    let totalLines = 0;
    for (const f of textFiles) {
      const content = run(`git show "${ref}:${f}"`);
      if (content) totalLines += content.split('\n').length;
    }
    stats.total_lines = totalLines;

    // Content files — detect old vs new structure
    const hasContent = allFiles.some(f => f.startsWith('content/'));
    const contentPatterns = hasContent
      ? [/^content\//, /^site\.yaml$/, /^assets\/text\//]
      : [/^texts\//, /^site\.yaml$/];
    const contentFiles = allFiles.filter(f => contentPatterns.some(p => p.test(f)) && textExts.test(f));
    let contentBytes = 0;
    for (const f of contentFiles) {
      const content = run(`git show "${ref}:${f}"`);
      if (content) contentBytes += Buffer.byteLength(content, 'utf8');
    }
    stats.content_bytes = contentBytes;

    // Build scripts
    const scriptCandidates = ['scripts/sync.js', 'scripts/sync-fallback.js', 'scripts/auto-publish.js', 'scripts/watch.js'];
    let scriptLines = 0;
    for (const f of scriptCandidates) {
      if (!allFiles.includes(f)) continue;
      const content = run(`git show "${ref}:${f}"`);
      if (content) scriptLines += content.split('\n').length;
    }
    stats.build_script_lines = scriptLines;

    const fetchCalls = (indexContent.match(/fetch\(['"]/g) || []).length;
    const essayFetch = /fetch\(['"](?:content\/essays|texts\/published|texts\/ready)/.test(indexContent) ? 1 : 0;
    stats.runtime_requests = 1 + fetchCalls - essayFetch;
  }

  return stats;
}

function formatBytes(b) {
  if (b >= 1024 * 1024) return (b / 1024 / 1024).toFixed(1) + ' MB';
  if (b >= 1024) return (b / 1024).toFixed(1) + ' KB';
  return b + ' B';
}

function formatDelta(before, after, unit, invert) {
  const diff = after - before;
  const pct = before ? ((diff / before) * 100).toFixed(1) : '—';
  const sign = diff > 0 ? '+' : '';
  const arrow = diff === 0 ? '  ' : (diff < 0 ? (invert ? ' ↑' : ' ↓') : (invert ? ' ↓' : ' ↑'));
  return `${sign}${diff}${unit} (${sign}${pct}%)${arrow}`;
}

// ── Main ──
const current = getStats(null);

if (logMode) {
  const logPath = path.join(root, 'devlog/stats.jsonl');
  const commitHash = run('git rev-parse --short HEAD');
  const commitMsg = run('git log -1 --format="%s"');
  const entry = {
    timestamp: new Date().toISOString(),
    commit: commitHash,
    message: commitMsg,
    ...current,
  };
  fs.appendFileSync(logPath, JSON.stringify(entry) + '\n', 'utf8');
  process.exit(0);
}

if (compareRef) {
  const before = getStats(compareRef);
  if (!before) {
    console.error('Could not read stats from ref: ' + compareRef);
    process.exit(1);
  }

  if (jsonMode) {
    console.log(JSON.stringify({ before, after: current, ref: compareRef }, null, 2));
    process.exit(0);
  }

  const refLabel = run(`git log -1 --format="%h %s" ${compareRef}`);
  console.log('Comparing against: ' + refLabel);
  console.log('');
  console.log('Metric                    Before          After           Delta');
  console.log('─'.repeat(78));
  console.log(`index.html size           ${formatBytes(before.index_html_bytes).padEnd(16)}${formatBytes(current.index_html_bytes).padEnd(16)}${formatDelta(before.index_html_bytes, current.index_html_bytes, ' bytes', true)}`);
  console.log(`index.html lines          ${String(before.index_html_lines).padEnd(16)}${String(current.index_html_lines).padEnd(16)}${formatDelta(before.index_html_lines, current.index_html_lines, '', true)}`);
  console.log(`Total lines (text)        ${String(before.total_lines).padEnd(16)}${String(current.total_lines).padEnd(16)}${formatDelta(before.total_lines, current.total_lines, '', true)}`);
  console.log(`Total files               ${String(before.total_files).padEnd(16)}${String(current.total_files).padEnd(16)}${formatDelta(before.total_files, current.total_files, '', true)}`);
  console.log(`Text/code files           ${String(before.text_files).padEnd(16)}${String(current.text_files).padEnd(16)}${formatDelta(before.text_files, current.text_files, '')}`);
  console.log(`Content files size        ${formatBytes(before.content_bytes).padEnd(16)}${formatBytes(current.content_bytes).padEnd(16)}${formatDelta(before.content_bytes, current.content_bytes, ' bytes', true)}`);
  console.log(`Build script lines        ${String(before.build_script_lines).padEnd(16)}${String(current.build_script_lines).padEnd(16)}${formatDelta(before.build_script_lines, current.build_script_lines, '')}`);
  console.log(`Script blocks             ${String(before.script_blocks).padEnd(16)}${String(current.script_blocks).padEnd(16)}${formatDelta(before.script_blocks, current.script_blocks, '')}`);
  console.log(`Runtime HTTP requests     ${String(before.runtime_requests).padEnd(16)}${String(current.runtime_requests).padEnd(16)}${formatDelta(before.runtime_requests, current.runtime_requests, '', true)}`);

} else {
  if (jsonMode) {
    console.log(JSON.stringify(current, null, 2));
    process.exit(0);
  }

  console.log('Suntzugi Project Stats');
  console.log('─'.repeat(40));
  console.log(`index.html:          ${formatBytes(current.index_html_bytes)} (${current.index_html_lines} lines)`);
  console.log(`Total lines (text):  ${current.total_lines}`);
  console.log(`Total files:         ${current.total_files} (${current.text_files} text/code)`);
  console.log(`Content files:       ${formatBytes(current.content_bytes)}`);
  console.log(`Build scripts:       ${current.build_script_lines} lines`);
  console.log(`Script blocks:       ${current.script_blocks}`);
  console.log(`Runtime requests:    ${current.runtime_requests}`);
  console.log('');
  console.log('Tip: use --compare <ref> to see deltas');
  console.log('  e.g. node scripts/stats.js --compare HEAD~10');
  console.log('  e.g. node scripts/stats.js --compare 2226a0f');
}
