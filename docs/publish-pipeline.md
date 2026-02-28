# Suntzugi Publish Pipeline

## Architecture

Single-folder + frontmatter system. All content lives in `content/` with YAML frontmatter for metadata. No file moving between folders, no middleman manifest. The `sync.js` build step reads frontmatter and bakes everything into `index.html`.

## Essay States

| State | Frontmatter | Behavior |
|-------|------------|----------|
| **Draft** | `status: draft` | Shows under "currently being written" with flower. Click shows popup. |
| **Ready** | `status: ready` + `publish_at: <ISO>` | Shows under "soon to be released" with countdown. Click shows popup. Auto-transitions when countdown hits 0. |
| **Published** | `status: published` + `published_at: <ISO>` | Shows under "published". Click opens essay in reading mode. |

## Folder Structure

```
content/                    ← things with identity + lifecycle
  cards/
    sun.md
    tzu.md
    gi.md
    suntzu.md
    tzugi.md
    suntzugi.md
  essays/
    my-time-has-come.md

assets/                     ← raw material (no lifecycle)
  text/
    amor.txt
    paciencia.txt
  images/
  audio/
    bgm/
  chraist/

site.yaml                   ← site config (links, display order)
scripts/
  sync.js                   ← build step: content → HTML
  auto-publish.js            ← updates frontmatter in-place
  watch.js                   ← file watcher for live editing
```

## Frontmatter Schema

### Cards

```yaml
---
title: Sun
type: card
status: published
---
[card body — uses **Field:** format]
```

### Essays

```yaml
---
title: My Time Has Come
type: essay
status: draft
publish_at: 2026-03-16T05:55:00-08:00
published_at:
---
[essay body text]
```

- `status`: `draft`, `ready`, or `published`
- `publish_at`: ISO 8601 timestamp — required for `status: ready`
- `published_at`: set automatically by `auto-publish.js` when publishing

## site.yaml

Structured data for links displayed on the site.

```yaml
links:
  - label: Twitter
    url: https://x.com/suntzugi
  - label: Neodore (stealth)
    url: "#neodore"
    countdown: 2026-03-16T05:55:00-08:00
```

## Writing an Essay

Create `content/essays/my-essay.md` with frontmatter:

```yaml
---
title: My Essay
type: essay
status: draft
---
Your essay body here. Paragraphs separated by blank lines.

**Bold text** and *italic text* work. So do [links](https://example.com).
```

## Publishing Workflow

### 1. Write the draft
Create `content/essays/my-essay.md` with `status: draft`.

### 2. Schedule for publishing
When ready, update frontmatter:
```yaml
status: ready
publish_at: 2026-03-16T05:55:00-08:00
```

### 3. Auto-publish (automated)
GitHub Actions workflow (`.github/workflows/scheduled-release.yml`) runs every 15 minutes:
- Runs `scripts/auto-publish.js` — updates frontmatter: `status: published`, adds `published_at`
- Runs `scripts/sync.js` — rebuilds HTML
- Commits and pushes if anything changed

Manual trigger: `gh workflow run "Scheduled Release"`

## Build Step (sync.js)

`node scripts/sync.js` reads all sources and bakes into `index.html`:
- Card content from `content/cards/*.md`
- Essay lists (draft/ready/published) from `content/essays/*.md` frontmatter
- Links from `site.yaml`
- Audio tracks from `assets/audio/bgm/` filenames
- Text lists from `assets/text/*.txt`
- Last-updated timestamp

The pre-commit hook runs sync automatically before every commit.

## Timestamp Format (ISO 8601)

```
YYYY-MM-DDTHH:MM:SS+/-HH:MM
```

Common timezone offsets:
- **San Francisco (PST):** `-08:00` (winter) / `-07:00` (summer/PDT)
- **Spain (CET):** `+01:00` (winter) / `+02:00` (summer/CEST)
- **UTC:** `+00:00`

## Quick Reference: Slug Rules

The slug is the .md filename (without extension):
- `my-time-has-come.md` → slug: `my-time-has-come`
- Use lowercase, hyphens for spaces, no special characters
