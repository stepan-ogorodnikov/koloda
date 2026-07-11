# Markdown Writing Guide

How to write markdown in this repository.
Applies to agent guides, specs, READMEs, and other `.md` files.

Editors in this project often disable soft wrap.
Long lines are hard to read and hard to review in diffs.
Write for that constraint.

## Line Length

Prefer lines that fit on a typical editor width without wrapping.
Aim for roughly **120 characters or fewer** per line of prose.
If a line is longer, split the sentence or rephrase.

Do not pad or hard-wrap mid-phrase just to hit a number.
Split on sentence or clause boundaries instead.

## One Sentence Per Line

Each sentence starts on a new line.

This makes diffs cleaner.
It improves readability when soft wrap is off.
It makes it obvious when a sentence has grown too long.

Keep sentences short.
One idea per sentence.
If a sentence needs a comma, consider splitting it.

Blank lines still separate paragraphs and sections as usual.

### Example

Bad:

```md
A conversation is unread when its most recent run has finished and the user has not yet opened it since the run finished, and the indicator is cleared when the user opens the conversation.
```

Good:

```md
A conversation is unread when its most recent run has finished and the user has not yet opened it since the run finished.
The indicator is cleared when the user opens the conversation.
```

## Lists and Headings

- Keep list items short.
- Prefer one sentence per list item.
- If an item needs more, use nested bullets or a following paragraph.
- Headings stay on their own line.
- Do not put the section body on the same line as the heading.

## Tables

Tables are allowed when they are the clearest shape (maps, checklists of columns).
Keep cells short.
If a cell needs a long explanation, link to a section or split into a list instead of a wide table.

Wide tables are the main exception to the line-length rule.
Still prefer narrow columns over paragraphs inside cells.

## Code and Paths

Fenced code blocks may exceed the prose line limit when the code requires it.
Do not reflow code just to satisfy markdown width.

Inline paths and identifiers are fine.
Prefer a short clause around them rather than a long run-on sentence.

## Links

Prefer reference-style or short inline links when a long URL would blow past the line limit.
Readable link text matters more than packing the full URL into the paragraph.

## Scope

Follow this guide for new markdown and when you substantially edit existing markdown.
Do not churn old files solely to rewrap lines unless the change is already touching that prose.
