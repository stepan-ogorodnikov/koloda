# Media

## Scope

Covers images in card content: how the user inserts them, which files are accepted, and where they show.
What rendered markdown may contain in general is in CARDS.md (§Rendered Markdown).
Card content, adding, and editing cards are in CARDS.md.
Audio and video are not supported.

## What it is

A card can show images.
The user inserts an image into a markdown field while adding or editing a card.
The app keeps its own copy of the image.
The image shows without a network connection and does not change when the original file changes or disappears.
The field's text holds a short reference to that copy, written as a markdown image.

## Core model

- **Image** — a picture the app stored from a file the user inserted
- **Image reference** — the markdown image in a field's text that points at a stored image
- **Alt text** — the text an image reference carries; it shows wherever the image cannot

### Relationships

- Identical files are stored once; inserting the same file again reuses the stored image.
- A stored image never changes after it is stored.
- An image reference works in any card's markdown field, including one it was copied into.
- Text fields do not offer image insertion.

## Inserting Images

Only markdown fields offer image insertion, in the add-card dialog and on the card details view.

The user can:

- paste image data, such as a screenshot or an image copied in a browser
- drop one or more image files onto the field
- pick one or more image files with the field's insert image button

Each accepted image is stored, and its reference is inserted at the cursor, replacing any selected text.
Images inserted together keep the order they were pasted, dropped, or picked, one per line.
The cursor ends up after the last inserted reference.

The alt text of a dropped or picked image is its file name without the extension.
A pasted image gets empty alt text.

The clipboard can hold an image together with other content, as when a browser copies an image from a page.
Then the image is inserted and the rest is ignored.
Pasting plain text and dropping files that are not images behave as in any text field.

An image is stored when it is inserted, before the card is saved.

## Formats and Size

Accepted formats:

- PNG
- JPEG
- GIF
- WebP
- AVIF

The format is recognized from the file's contents, never from its name.
SVG images are not accepted.
An image can be at most 5 MB.

A rejected file shows an error on that field and inserts nothing.
The error says whether the format is not accepted or the file is too large.
When several files are inserted together, the accepted ones are inserted and an error shows for the rest.

The app stores the original file unchanged; it does not resize or recompress it.

## Where Images Show

An image reference shows its image in card preview and in lessons.
While the image loads, its place stays empty.
If the stored image is missing or cannot be read, the alt text shows instead.

Elsewhere the reference does not show an image:

- In the card editor and the cards table, it shows as the raw text of the field.
- In assistant messages, it shows its alt text.

Showing an image never contacts another site and works offline.
Other images follow CARDS.md (§Rendered Markdown).
