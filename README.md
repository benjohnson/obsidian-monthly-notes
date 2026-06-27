# Monthly Notes

An [Obsidian](https://obsidian.md) plugin to create or open this month's note with a single click.

This project attempts to replicate the features of the [core Daily Note plugin](https://obsidian.md/help/plugins/daily-notes) without adding additional features. Many of the other similar plugins add tons of complexity. We're trying for small and simple.

## Usage

- Click the **calendar** ribbon icon, or
- Run the **Open monthly note** command from the command palette.

If this month's note already exists, it opens. Otherwise it's created (along with its folder, if needed) and opened.

## Settings

- **Date format** — how notes are named. Pick a preset or a [custom moment.js format](https://momentjs.com/docs/#/displaying/format/) (default: `YYYY-MM`).
- **New file location** — the folder new notes are placed in.
- **Template file location** — a note to use as a template for new monthly notes.

### Template variables

Templates support the following placeholders:

| Variable | Replaced with |
| --- | --- |
| `{{title}}` | the note's name |
| `{{date}}` | current date (`YYYY-MM-DD`) |
| `{{time}}` | current time (`HH:mm`) |

`{{date}}` and `{{time}}` accept an optional [moment.js format](https://momentjs.com/docs/#/displaying/format/) after a colon — e.g. `{{date:dddd}}` → `Tuesday`, `{{time:h:mm A}}` → `2:30 PM`.

## Development

```bash
bun install
bun run dev    # build and watch
bun test       # run tests
bun run build  # production build
```
