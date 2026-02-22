Set up a new essay in the Suntzugi publish pipeline.

Arguments: $ARGUMENTS

Parse the arguments to extract:
- **title**: The essay title (required)
- **time**: The publish time (required) — can be natural language like "3pm SF time", "20:00 spanish time", "7:77am feb 23 PST", etc.
- **status**: Either "draft" or "ready" (default: "draft")

Then do the following:

1. **Derive the slug** from the title: lowercase, replace spaces with hyphens, strip special characters.

2. **Parse the time** into an ISO 8601 timestamp with timezone offset.
   - SF/PST = -08:00 (Nov-Mar), SF/PDT = -07:00 (Mar-Nov)
   - Spain/CET = +01:00 (Oct-Mar), Spain/CEST = +02:00 (Mar-Oct)
   - Handle playful times like "7:77am" = 8:17am (overflow minutes into hours)
   - If no date is given, assume today's date.

3. **Create the essay .md file** at:
   - `texts/drafts/{slug}.md` if status is "draft"
   - `texts/ready-to-publish/{slug}.md` if status is "ready"

   With this template:
   ```
   # {Title}

   Written: {Month Day, Year}
   Last edited: {Month Day, Year}
   Scheduled: {Month Day, Year} at {HH:MM} {TZ}

   {Leave a blank line — the user will write the body later}
   ```

4. **Add entry to `texts/suntzugi/content.md`** in the `## Essays` section (before any existing entries):
   ```
   - [{Title}](#{slug}) {date:{Month Day, Year}} {status:{status}} {countdown:{ISO-TIMESTAMP}}
   ```

5. **Update the hardcoded fallback in `index.html`**:
   - If status is "draft": add a `<li data-draft>` to `draftsList`
   - If status is "ready": add a `<li data-ready data-pub-time="...">` to `readyList`, and remove `style="display:none"` from `readyBlock` if present

6. **Show a summary** of what was created, including the formatted publish time and file paths.
