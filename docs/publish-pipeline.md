# Suntzugi Publish Pipeline

## Essay States

| State | Status tag | Location | Behavior |
|-------|-----------|----------|----------|
| **Draft** | `{status:draft}` | `texts/drafts/` | Shows under "currently being written" with countdown. Click shows popup. |
| **Ready to publish** | `{status:ready}` | `texts/ready-to-publish/` | Shows under "soon to be released" with countdown. Click opens essay in reading mode. Auto-transitions to published when countdown hits 0. |
| **Published** | *(no status tag)* | `texts/essays/` | Shows under "published" with date+time. Click opens essay in reading mode. |

## File Structure

```
texts/
  drafts/              # Drafts being written
    my-essay.md
  ready-to-publish/    # Finished, waiting for scheduled time
    my-essay.md
  essays/              # Published
    my-essay.md
```

## Writing an Essay (.md format)

```markdown
# Essay Title

Written: February 22, 2026
Last edited: February 22, 2026
Scheduled: February 22, 2026 at 08:17 PST

Your essay body goes here. Paragraphs are separated by blank lines.

**Bold text** and *italic text* work. So do [links](https://example.com).
```

- `Written:` and `Last edited:` appear in the essay footer
- `Scheduled:` is stripped from display (informational only in the .md file)

## Adding an Entry to content.md

All entries go in the `## Essays` section of `texts/suntzugi/content.md`.

### Format

```
- [Title](#slug) {date:Month Day, Year} {status:STATE} {countdown:ISO-TIMESTAMP}
```

### Timestamp Format (ISO 8601)

```
YYYY-MM-DDTHH:MM:SS+/-HH:MM
```

Common timezone offsets:
- **San Francisco (PST):** `-08:00` (winter) / `-07:00` (summer/PDT)
- **Spain (CET):** `+01:00` (winter) / `+02:00` (summer/CEST)
- **UTC:** `+00:00`

### Examples

Draft:
```
- [My Essay](#my-essay) {date:February 22, 2026} {status:draft} {countdown:2026-02-22T08:17:00-08:00}
```

Ready to publish (auto-publishes at countdown time):
```
- [My Essay](#my-essay) {date:February 22, 2026} {status:ready} {countdown:2026-02-22T08:17:00-08:00}
```

Published (remove status tag, countdown optional):
```
- [My Essay](#my-essay) {date:February 22, 2026}
```

## Publishing Workflow

### 1. Write the draft
Create `texts/drafts/my-essay.md` and add a `{status:draft}` entry in content.md.

### 2. Schedule for publishing
When the essay is ready:
- Move the .md file from `texts/drafts/` to `texts/ready-to-publish/`
- Change `{status:draft}` to `{status:ready}` in content.md
- Set the `{countdown:...}` to your desired publish time

### 3. After auto-publish triggers
The countdown reaches 0 and the essay visually moves to "published" on screen. Then:
- Move the .md file from `texts/ready-to-publish/` to `texts/essays/`
- Remove `{status:ready}` and `{countdown:...}` from content.md
- Commit and push

### Hardcoded Fallback (index.html)
For entries that must work without content.md loading (file:// protocol), update the hardcoded HTML in `index.html`:
- `readyBlock` / `readyList` for ready entries
- `draftsBlock` / `draftsList` for draft entries
- `essayFallback` object for inline essay content

## Quick Reference: Slug Rules
The slug is derived from the `#anchor` in the link. It must match the .md filename:
- `[My Essay](#my-essay)` -> file must be `my-essay.md`
- Use lowercase, hyphens for spaces, no special characters
