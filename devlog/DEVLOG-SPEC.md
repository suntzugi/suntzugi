# Devlog Specification

System for tracking daily work on the suntzugi project. Designed for human readability and machine parseability.

## Structure

```
devlog/
  DEVLOG-SPEC.md                          ← this file
  sunlog/                                 ← contributor: sun
    2026/
      2026_sun.md                         ← yearly summary (when ready)
      02/
        2026-02_sun.md                    ← monthly summary
        weeks/
          2026-W08_sun.md                 ← weekly summary
        days/
          2026-02-20_sun.md               ← daily entry
  otherlog/                               ← another contributor would go here
    2026/
      02/
        days/
          2026-02-25_other.md
```

## Contributors

Each contributor gets their own folder under `devlog/` and a unique suffix for all filenames.

| ID | Folder | Suffix | Description |
|----|--------|--------|-------------|
| sun | `sunlog/` | `_sun` | Project creator |

To add a new contributor: create a folder `devlog/<name>log/`, use `_<name>` as the file suffix. Follow the same folder/file structure.

## Weeks

Weeks follow ISO 8601: **Monday is always day 1**. Week numbers are ISO week numbers (W01–W53). A weekly file covers Mon–Sun.

## File naming

```
Daily:    YYYY-MM-DD_<author>.md
Weekly:   YYYY-W##_<author>.md
Monthly:  YYYY-MM_<author>.md
Yearly:   YYYY_<author>.md
```

## YAML front matter (required for daily entries)

Every daily `.md` file must have YAML front matter with structured metadata:

```yaml
---
date: "2026-02-24"            # ISO date
day: tuesday                   # lowercase day of week
day_number: 5                  # sequential day count for this contributor
timezone: Europe/Paris         # IANA timezone (auto-detect from system if possible)
utc_offset: "+01:00"           # UTC offset at time of work
author: sun                    # contributor ID
commits_manual: 14             # human-initiated commits (on this calendar day)
lines_added: 472               # total lines added
lines_removed: 191             # total lines removed
tags: [mobile, theming]        # lowercase, hyphenated topic tags

# Session tracking — a "session" = continuous commits with no gap > 3h
# Use "+1" suffix for times that fall on the next calendar day
session_start: "07:12"         # actual session start (local time)
session_end: "16:34"           # actual session end — may be "+1" if crosses midnight
session_hours: 9.5             # active hours in this session
crossed_midnight: false        # true if session crossed into next calendar day

# For sessions that cross midnight, the tail commits appear on the NEXT calendar day
# but belong to THIS day's session. The next day references them:
# allnighter_tail_from: "2026-02-23"   # which day's session this tail belongs to
# allnighter_tail_end: "05:09"         # when the tail ended on this calendar day
# allnighter_tail_hours: 5.3           # hours of tail work

# For multiple sessions in one day (e.g., separated by off-repo work, not sleep):
# session_1_start, session_1_end, session_1_hours, session_1_note
# session_2_start, session_2_end, session_2_hours, session_2_note
# midday_gap: "08:13–15:46 (off-repo work)"
# midday_gap_was_sleep: false

# Sleep tracking
slept: true                    # did they sleep after this day's last session?
sleep_start: "~23:00"         # estimated sleep start (based on last commit + buffer)
sleep_end: "~07:00+1"         # estimated wake (based on next session's first commit)
sleep_hours: 8                 # estimated hours of sleep
sleep_notes: ""                # optional context
---
```

## Weekly/monthly front matter

Weekly and monthly summaries add:

```yaml
last_updated: "2026-02-24"    # date of last edit
status: in_progress            # or "complete"
allnighters: 2                 # count of allnighters in this period
```

## Markdown body format

### Daily entries

```markdown
# Mon DD, Dayname — Day N: Title

**Time:** HH:MM – HH:MM TZ (Xh)
**Commits:** N | **Lines:** +N / -N
**[All-nighter/Late session note if applicable]**

[1-2 sentence summary paragraph]

## What happened
[Bulleted list, grouped by theme with ### subheadings if needed]

## Notable
[What stands out — design decisions, breakthroughs, potential bigger ideas]
```

### Weekly entries

Include: Highlights, Arc (narrative of the week), Writing progress, What emerged, Days table with links.

### Monthly entries

Include: One-paragraph summary, Key milestones, What was built, What was written, Emerging ideas, Weeks table, Days table.

## Session and sleep detection

**Core principle:** Track work sessions, not calendar days. A session is a continuous stretch of commits with no gap > 3 hours. Sessions can cross midnight.

### How to detect sessions

1. Get all human commits (exclude auto-publish) in chronological order
2. Walk the commits. When the gap between consecutive commits exceeds 3 hours, that's a session boundary.
3. The gap between sessions = sleep (or off-repo work — use context to distinguish)

### Midnight crossings

When a session crosses midnight, it belongs to the day it STARTED on:
- **Origin day:** `session_end: "03:15+1"` and `crossed_midnight: true`
- **Next calendar day:** `allnighter_tail_from: "YYYY-MM-DD"`, `allnighter_tail_end: "03:15"`, `allnighter_tail_hours: X`

The next day's OWN session starts after the sleep that follows the tail.

### Sleep detection

Sleep = any gap > 3 hours between the end of one session and the start of the next.

- `sleep_start`: estimated from last commit + ~30min buffer
- `sleep_end`: estimated from first commit of next session
- `sleep_hours`: duration

If a midday gap > 3h is clearly NOT sleep (e.g., off-repo work during business hours), mark it:
- `midday_gap: "08:13–15:46 (off-repo work)"`
- `midday_gap_was_sleep: false`

### Body format for sessions

In the markdown body, describe each session with its actual time range:
```
**Session:** 18:38 Fri – 01:54 Sat CET (7.25h continuous, crossed midnight)
**Slept:** ~02:00–09:00 Sat (~7h)
```

For allnighter tail days:
```
**Allnighter tail:** 00:51–05:09 CET (continuation from Sunday night session)
**Slept:** ~05:30–12:00 (~6.5h)
**Session:** 12:13–15:24 CET (3.2h)
```

## Timezone handling

Always record the IANA timezone (`Europe/Paris`, `America/Los_Angeles`, etc.) and UTC offset. If a contributor travels, the timezone changes per-entry. All times in the log are **local to the contributor** at the time of work.

To auto-detect timezone in a Claude Code session:
```bash
# macOS
readlink /etc/localtime | sed 's|.*/zoneinfo/||'
# Linux
cat /etc/timezone
# UTC offset
date +%z
```

## Processing

The YAML front matter is designed for lightweight parsing. To aggregate stats:

```bash
# Extract all front matter from daily files
for f in devlog/sunlog/2026/02/days/*.md; do
  sed -n '/^---$/,/^---$/p' "$f"
done

# Quick stats with grep
grep "^commits_manual:" devlog/sunlog/2026/02/days/*_sun.md
grep "^allnighter:" devlog/sunlog/2026/02/days/*_sun.md
```

Any YAML parser (Python, JS, Ruby) can read the front matter. The markdown body is for humans.

## Automation

**`scripts/devlog-stats.js`** computes all quantitative data automatically from git history:

```bash
node scripts/devlog-stats.js                     # today
node scripts/devlog-stats.js 2026-02-24           # specific date
node scripts/devlog-stats.js 2026-02-20 2026-02-24 # date range
node scripts/devlog-stats.js --all                # all history
```

Output: JSON with per-day stats including:
- Session detection (3h gap rule, midnight crossing, allnighter tails)
- Sleep estimates (start, end, hours) with daytime-break heuristic
- Commit counts, line stats, day of week, ISO week number
- All commit messages with timestamps

**What the script handles:** sessions, sleep, commits, lines, timestamps, week numbers, timezone.
**What Claude writes:** narrative summary, "What happened" bullets, "Notable" section, themes, tags, off-repo work notes.

## For Claude Code instances

When generating a devlog entry:

1. **Run the stats script:** `node scripts/devlog-stats.js YYYY-MM-DD` — this gives you all computed data.
2. **Detect contributor:** Check which `*log/` folder exists under `devlog/`. If only `sunlog/`, you're logging for `sun`. If multiple exist, check the git user or ask.
3. **Copy YAML front matter** from the script's JSON output into the daily `.md` file.
4. **Write the narrative:** Read the commit messages from the script output. Group them by theme, write the "What happened" section with sub-headings, add "Notable" section for standout moments/ideas.
5. **Ask the user** about any off-repo work (writing, meetings, strategy) and add it under a separate heading.
6. **Update weekly/monthly:** Update `last_updated` and add the new day to tables.

Do not overwrite existing narrative content in entries — only append or update metadata.
