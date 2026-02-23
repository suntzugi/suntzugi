#!/usr/bin/env node
/**
 * angel-time.js
 *
 * Rounds a timestamp to the nearest "full angel number" time — all digits
 * the same (1:11, 2:22, 3:33, 4:44, 5:55, 7:77, 8:88, 9:99, 11:11, 22:22).
 * 6:66 is excluded (no 6s).
 *
 * "Impossible" times (minutes > 59) are carried: 7:77 → 08:17, 9:99 → 10:39.
 *
 * Usage:
 *   node scripts/angel-time.js                         # now, default tz America/Los_Angeles
 *   node scripts/angel-time.js "2026-02-20 18:46 -05"  # specific timestamp
 *   node scripts/angel-time.js --tz Europe/Paris        # change timezone
 *   node scripts/angel-time.js --git HEAD               # last git commit time
 *   node scripts/angel-time.js --git HEAD --file index.html  # last commit touching file
 *
 * Output: DD/MM/YYYY · HH:MM TZ_CODE
 */

const { execSync } = require('child_process');

// ── Full angel numbers (no 6s) ──
// Expressed as { displayHour, displayMin } in the "playful" notation,
// plus realMinutes (minutes from midnight) for distance calculation.
const ANGELS = [
  { h: 1, m: 11, real: 71 },       // 1:11
  { h: 2, m: 22, real: 142 },      // 2:22
  { h: 3, m: 33, real: 213 },      // 3:33
  { h: 4, m: 44, real: 284 },      // 4:44
  { h: 5, m: 55, real: 355 },      // 5:55
  // 6:66 excluded
  { h: 7, m: 77, real: 497 },      // 7:77 → 08:17
  { h: 8, m: 88, real: 568 },      // 8:88 → 09:28
  { h: 9, m: 99, real: 639 },      // 9:99 → 10:39
  { h: 11, m: 11, real: 671 },     // 11:11
  // PM mirrors (12h angel numbers in 24h)
  { h: 13, m: 11, real: 791 },     // 1:11 PM
  { h: 14, m: 22, real: 862 },     // 2:22 PM
  { h: 15, m: 33, real: 933 },     // 3:33 PM
  { h: 16, m: 44, real: 1004 },    // 4:44 PM
  { h: 17, m: 55, real: 1075 },    // 5:55 PM
  // 18:66 excluded
  { h: 19, m: 77, real: 1217 },    // 7:77 PM → 20:17
  { h: 20, m: 88, real: 1288 },    // 8:88 PM → 21:28
  { h: 21, m: 99, real: 1359 },    // 9:99 PM → 22:39
  { h: 22, m: 22, real: 1342 },    // 22:22
  { h: 23, m: 11, real: 1391 },    // 11:11 PM
].sort((a, b) => a.real - b.real);

function nearestAngel(minutesFromMidnight) {
  let best = null;
  let bestDist = Infinity;
  // Check today's angels
  for (const a of ANGELS) {
    const dist = Math.abs(a.real - minutesFromMidnight);
    if (dist < bestDist) { bestDist = dist; best = { ...a, dayOffset: 0 }; }
  }
  // Check wrapping: yesterday's last angel vs today, and today's first vs tomorrow
  const lastAngel = ANGELS[ANGELS.length - 1];
  const firstAngel = ANGELS[0];
  const distWrapBack = minutesFromMidnight + (1440 - lastAngel.real);
  if (distWrapBack < bestDist) { bestDist = distWrapBack; best = { ...lastAngel, dayOffset: -1 }; }
  const distWrapFwd = (1440 - minutesFromMidnight) + firstAngel.real;
  if (distWrapFwd < bestDist) { bestDist = distWrapFwd; best = { ...firstAngel, dayOffset: 1 }; }
  return best;
}

function formatAngelTime(date, tz) {
  // Get date parts in target timezone
  const parts = {};
  new Intl.DateTimeFormat('en-GB', {
    timeZone: tz,
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit', hour12: false,
  }).formatToParts(date).forEach(p => { parts[p.type] = p.value; });

  const hour = parseInt(parts.hour);
  const minute = parseInt(parts.minute);
  const minutesFromMidnight = hour * 60 + minute;

  const angel = nearestAngel(minutesFromMidnight);

  // Adjust date if angel is on a different day
  const adjusted = new Date(date.getTime() + angel.dayOffset * 86400000);
  const adjParts = {};
  new Intl.DateTimeFormat('en-GB', {
    timeZone: tz,
    day: '2-digit', month: '2-digit', year: 'numeric',
  }).formatToParts(adjusted).forEach(p => { adjParts[p.type] = p.value; });

  const dateStr = adjParts.day + '/' + adjParts.month + '/' + adjParts.year;

  // Format the angel time — use real clock time (carry impossible minutes)
  const realHour = Math.floor(angel.real / 60);
  const realMin = angel.real % 60;
  const timeStr = String(realHour).padStart(2, '0') + ':' + String(realMin).padStart(2, '0');

  // Get timezone abbreviation
  const tzAbbr = new Intl.DateTimeFormat('en-US', {
    timeZone: tz, timeZoneName: 'short',
  }).formatToParts(date).find(p => p.type === 'timeZoneName').value;

  return { dateStr, timeStr, tzAbbr, angel };
}

// ── CLI ──
const args = process.argv.slice(2);
let tz = 'America/Los_Angeles';
let inputDate = null;
let dateOnly = false;

for (let i = 0; i < args.length; i++) {
  if (args[i] === '--tz' && args[i + 1]) { tz = args[++i]; continue; }
  if (args[i] === '--date-only') { dateOnly = true; continue; }
  if (args[i] === '--git') {
    const ref = args[++i] || 'HEAD';
    const fileArg = (args[i + 1] === '--file') ? args[i += 2] : '';
    const cmd = 'git log -1 --format=%aI ' + ref + (fileArg ? ' -- ' + fileArg : '');
    const ts = execSync(cmd, { encoding: 'utf8' }).trim();
    if (!ts) { console.error('No git timestamp found'); process.exit(1); }
    inputDate = new Date(ts);
    continue;
  }
  if (!inputDate) inputDate = new Date(args[i]);
}

if (!inputDate) inputDate = new Date();

const result = formatAngelTime(inputDate, tz);

if (dateOnly) {
  console.log(result.dateStr);
} else {
  console.log(result.dateStr + ' · ' + result.timeStr + ' ' + result.tzAbbr);
}

// Also export for use by other scripts
if (typeof module !== 'undefined') {
  module.exports = { nearestAngel, formatAngelTime, ANGELS };
}
