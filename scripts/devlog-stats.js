#!/usr/bin/env node
/**
 * devlog-stats.js — Compute daily devlog statistics from git history.
 *
 * Usage:
 *   node devlog-stats.js                              # today, current repo
 *   node devlog-stats.js 2026-02-24                   # specific date
 *   node devlog-stats.js 2026-02-20 2026-02-24        # date range
 *   node devlog-stats.js --all                        # all history
 *   node devlog-stats.js --repo /path/to/repo         # different repo
 *   node devlog-stats.js --repo /path/to/repo 2026-02-24
 *   node devlog-stats.js --exclude "auto-publish|bot"  # custom exclude pattern
 *
 * Output: JSON with per-day stats, session detection, sleep estimates.
 */

const { execSync } = require('child_process');
const path = require('path');

// --- parse CLI args ---

const rawArgs = process.argv.slice(2);
let REPO = process.cwd();
let SESSION_GAP_HOURS = 3;
const SLEEP_BUFFER_MIN = 30;
let EXCLUDE_PATTERN = /auto-publish/;
const dateArgs = [];

for (let i = 0; i < rawArgs.length; i++) {
  if (rawArgs[i] === '--repo' && rawArgs[i + 1]) {
    REPO = path.resolve(rawArgs[++i]);
  } else if (rawArgs[i] === '--exclude' && rawArgs[i + 1]) {
    EXCLUDE_PATTERN = new RegExp(rawArgs[++i]);
  } else if (rawArgs[i] === '--gap' && rawArgs[i + 1]) {
    SESSION_GAP_HOURS = parseFloat(rawArgs[++i]);
  } else {
    dateArgs.push(rawArgs[i]);
  }
}

// --- helpers ---

function run(cmd) {
  try {
    return execSync(cmd, { cwd: REPO, encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 }).trim();
  } catch (e) {
    return '';
  }
}

function parseDate(str) {
  return new Date(str.replace(' ', 'T') + ':00');
}

function dayOfWeek(ds) {
  return new Date(ds + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'long' }).toLowerCase();
}

function formatTime(d) {
  return d.toTimeString().slice(0, 5);
}

function hoursBetween(a, b) {
  return Math.round(((b - a) / 3600000) * 100) / 100;
}

function dateStr(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function isoWeek(ds) {
  const d = new Date(ds + 'T12:00:00');
  d.setDate(d.getDate() + 3 - ((d.getDay() + 6) % 7));
  const yearStart = new Date(d.getFullYear(), 0, 4);
  yearStart.setDate(yearStart.getDate() + 3 - ((yearStart.getDay() + 6) % 7));
  return Math.round((d - yearStart) / 604800000) + 1;
}

function getTimezone() {
  try {
    const tz = execSync("readlink /etc/localtime | sed 's|.*/zoneinfo/||'", { encoding: 'utf8' }).trim();
    if (tz) return tz;
  } catch (_) {}
  try { return execSync('cat /etc/timezone', { encoding: 'utf8' }).trim(); } catch (_) {}
  return 'Unknown';
}

function getUtcOffset() {
  const o = new Date().getTimezoneOffset();
  const s = o <= 0 ? '+' : '-';
  return `${s}${String(Math.floor(Math.abs(o) / 60)).padStart(2, '0')}:${String(Math.abs(o) % 60).padStart(2, '0')}`;
}

function repoName() {
  return path.basename(REPO);
}

// --- git data ---

function getCommits(since, until) {
  const cmd = `git log --format="%ad|%H|%s" --date=format:"%Y-%m-%d %H:%M"` +
    (since ? ` --after="${since} 00:00"` : '') +
    (until ? ` --before="${until} 23:59:59"` : '') +
    ' --reverse';
  const raw = run(cmd);
  if (!raw) return [];
  return raw.split('\n').filter(Boolean).map(line => {
    const [datetime, hash, ...msgParts] = line.split('|');
    const msg = msgParts.join('|');
    return { datetime, hash, msg, isAuto: EXCLUDE_PATTERN.test(msg), date: parseDate(datetime) };
  });
}

function getLineStats(since, until) {
  const cmd = `git log --numstat --format="COMMIT|%ad|%s" --date=format:"%Y-%m-%d %H:%M"` +
    (since ? ` --after="${since} 00:00"` : '') +
    (until ? ` --before="${until} 23:59:59"` : '') +
    ' --reverse';
  const raw = run(cmd);
  if (!raw) return {};
  const perDay = {};
  let currentDay = null, currentIsAuto = false;
  raw.split('\n').forEach(line => {
    if (line.startsWith('COMMIT|')) {
      const parts = line.split('|');
      currentDay = parts[1].split(' ')[0];
      currentIsAuto = EXCLUDE_PATTERN.test(parts[2] || '');
      if (!perDay[currentDay]) perDay[currentDay] = { added: 0, removed: 0 };
    } else if (line.trim() && currentDay && !currentIsAuto) {
      const [a, d] = line.split('\t');
      if (a !== '-') perDay[currentDay].added += parseInt(a) || 0;
      if (d !== '-') perDay[currentDay].removed += parseInt(d) || 0;
    }
  });
  return perDay;
}

// --- session detection ---

function detectSessions(humanCommits) {
  if (!humanCommits.length) return [];
  const sessions = [];
  let cur = { start: humanCommits[0], end: humanCommits[0], commits: [humanCommits[0]] };
  for (let i = 1; i < humanCommits.length; i++) {
    if (hoursBetween(cur.end.date, humanCommits[i].date) > SESSION_GAP_HOURS) {
      sessions.push(cur);
      cur = { start: humanCommits[i], end: humanCommits[i], commits: [humanCommits[i]] };
    } else {
      cur.end = humanCommits[i];
      cur.commits.push(humanCommits[i]);
    }
  }
  sessions.push(cur);
  return sessions;
}

// --- assign sessions to calendar days ---

function initDay() { return { sessions: [], allnighter_tail: null, commits: [], sleeps: [] }; }

function assignToDays(sessions) {
  const days = {};
  sessions.forEach((session, idx) => {
    const startDay = dateStr(session.start.date);
    const endDay = dateStr(session.end.date);
    const startTime = formatTime(session.start.date);
    const endTime = formatTime(session.end.date);
    const hours = hoursBetween(session.start.date, session.end.date);
    const crossesMidnight = startDay !== endDay;

    if (!days[startDay]) days[startDay] = initDay();
    if (crossesMidnight && !days[endDay]) days[endDay] = initDay();

    days[startDay].sessions.push({
      start: startTime,
      end: crossesMidnight ? endTime + '+1' : endTime,
      hours, crossed_midnight: crossesMidnight, commit_count: session.commits.length,
    });

    if (crossesMidnight) {
      const tailCommits = session.commits.filter(c => dateStr(c.date) === endDay);
      days[endDay].allnighter_tail = {
        from: startDay, end: endTime,
        hours: tailCommits.length > 1 ? hoursBetween(tailCommits[0].date, tailCommits[tailCommits.length - 1].date) : 0,
        commits: tailCommits.length,
      };
    }

    session.commits.forEach(c => {
      const d = dateStr(c.date);
      if (!days[d]) days[d] = initDay();
      days[d].commits.push(c);
    });

    if (idx < sessions.length - 1) {
      const next = sessions[idx + 1];
      const gapH = hoursBetween(session.end.date, next.start.date);
      const sleepStart = new Date(session.end.date.getTime() + SLEEP_BUFFER_MIN * 60000);
      const sleepH = Math.round((gapH - SLEEP_BUFFER_MIN / 60) * 10) / 10;
      const endHour = session.end.date.getHours();
      const startHour = next.start.date.getHours();
      const isDaytimeGap = gapH < 8 && endHour >= 8 && endHour <= 20 && startHour >= 8 && startHour <= 20;
      const isSleep = gapH >= SESSION_GAP_HOURS && !isDaytimeGap;

      if (days[startDay]) {
        days[startDay].sleeps.push({
          gap_hours: gapH,
          sleep_start: isSleep ? '~' + formatTime(sleepStart) : null,
          sleep_end: isSleep ? '~' + formatTime(next.start.date) : null,
          sleep_hours: isSleep && sleepH > 0 ? sleepH : 0,
          is_sleep: isSleep, is_daytime_break: isDaytimeGap,
          next_session_day: dateStr(next.start.date),
        });
      }
    }
  });
  return days;
}

// --- build output ---

function buildDayReport(day, data, lineStats, dayNumber) {
  const ls = lineStats[day] || { added: 0, removed: 0 };
  const manual = data.commits.filter(c => !c.isAuto);
  const report = {
    date: day, day: dayOfWeek(day), day_number: dayNumber, iso_week: isoWeek(day),
    timezone: getTimezone(), utc_offset: getUtcOffset(), repo: repoName(),
    commits_manual: manual.length, commits_auto: data.commits.length - manual.length,
    lines_added: ls.added, lines_removed: ls.removed,
  };

  if (data.sessions.length === 1) {
    const s = data.sessions[0];
    Object.assign(report, { session_start: s.start, session_end: s.end, session_hours: s.hours, crossed_midnight: s.crossed_midnight });
  } else if (data.sessions.length > 1) {
    data.sessions.forEach((s, i) => {
      report[`session_${i + 1}_start`] = s.start;
      report[`session_${i + 1}_end`] = s.end;
      report[`session_${i + 1}_hours`] = s.hours;
    });
    if (data.sessions.length === 2) {
      report.midday_gap = `${data.sessions[0].end.replace('+1', '')}–${data.sessions[1].start}`;
    }
  }

  if (data.allnighter_tail) {
    Object.assign(report, {
      allnighter_tail_from: data.allnighter_tail.from, allnighter_tail_end: data.allnighter_tail.end,
      allnighter_tail_hours: data.allnighter_tail.hours, allnighter_tail_commits: data.allnighter_tail.commits,
    });
  }

  // Sleep
  const realSleeps = (data.sleeps || []).filter(s => s.is_sleep);
  const dayBreaks = (data.sleeps || []).filter(s => s.is_daytime_break);
  if (dayBreaks.length > 0) {
    dayBreaks.forEach((b, i) => {
      const k = dayBreaks.length === 1 ? 'midday_gap' : `midday_gap_${i + 1}`;
      report[k + '_hours'] = b.gap_hours;
      report[k + '_was_sleep'] = false;
    });
  }
  if (realSleeps.length > 0) {
    const sleep = realSleeps[realSleeps.length - 1];
    Object.assign(report, { slept: true, sleep_start: sleep.sleep_start, sleep_end: sleep.sleep_end, sleep_hours: sleep.sleep_hours, gap_to_next_hours: sleep.gap_hours });
    if (realSleeps.length > 1) {
      const mid = realSleeps[0];
      Object.assign(report, { mid_sleep_start: mid.sleep_start, mid_sleep_end: mid.sleep_end, mid_sleep_hours: mid.sleep_hours });
    }
  } else if (dayBreaks.length > 0) {
    report.slept = 'no (daytime breaks only)';
  } else if (!data.sleeps.length) {
    report.slept = null; report.sleep_notes = 'No next session data';
  } else {
    report.slept = false;
  }

  if (manual.length > 0) {
    report.first_commit = { time: formatTime(manual[0].date), msg: manual[0].msg };
    report.last_commit = { time: formatTime(manual[manual.length - 1].date), msg: manual[manual.length - 1].msg };
    report.all_commit_messages = manual.map(c => ({ time: formatTime(c.date), msg: c.msg }));
  }
  return report;
}

// --- main ---

function main() {
  let since = null, until = null;
  if (dateArgs.includes('--all')) {
    // no filters
  } else if (dateArgs.length === 2) {
    since = dateArgs[0]; until = dateArgs[1];
  } else if (dateArgs.length === 1) {
    since = dateArgs[0]; until = dateArgs[0];
  } else {
    since = dateStr(new Date()); until = since;
  }

  let extSince = since, extUntil = until;
  if (since) { const d = new Date(since + 'T12:00:00'); d.setDate(d.getDate() - 1); extSince = dateStr(d); }
  if (until) { const d = new Date(until + 'T12:00:00'); d.setDate(d.getDate() + 1); extUntil = dateStr(d); }

  const allCommits = getCommits(extSince, extUntil);
  const humanCommits = allCommits.filter(c => !c.isAuto);
  const lineStats = getLineStats(extSince, extUntil);

  if (!humanCommits.length) {
    console.log(JSON.stringify({ error: 'No human commits found', repo: repoName(), since, until }, null, 2));
    process.exit(0);
  }

  const sessions = detectSessions(humanCommits);
  const dayData = assignToDays(sessions);
  const targetDays = Object.keys(dayData).filter(d => (!since || d >= since) && (!until || d <= until)).sort();

  const reports = {};
  targetDays.forEach(day => {
    const allDaysRaw = run(`git log --format="%ad" --date=format:"%Y-%m-%d" --reverse --before="${day} 23:59:59"`);
    const uniqueDays = [...new Set(allDaysRaw.split('\n').filter(Boolean))];
    reports[day] = buildDayReport(day, dayData[day], lineStats, uniqueDays.indexOf(day) + 1 || null);
  });

  console.log(JSON.stringify({
    generated: new Date().toISOString(), repo: repoName(),
    timezone: getTimezone(), utc_offset: getUtcOffset(),
    range: { since, until }, sessions_detected: sessions.length,
    session_gap_threshold_hours: SESSION_GAP_HOURS, days: reports,
  }, null, 2));
}

main();
