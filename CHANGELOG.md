# Markdown Content Search Changelog

## [Search & Performance Overhaul] - 2026-07-20

- In-memory index with incremental (mtime) cache; queries no longer re-read the disk on every keystroke
- Live search bar with multi-keyword AND matching over content, title and filename
- Relevance ranking and frecency sorting (frequently opened files float up)
- Detail preview: highlighted match excerpt on top + full document below
- Open the matched line directly in VS Code (`vscode://` deep link); match line number shown in the list
- New actions: Copy Path / Copy Content / Copy Excerpt, Show in Finder, Open with configured editor
- New preferences: File Extensions, Max Results, Editor App
- Remembers the detail pane toggle

## [Initial Version] - 2023-06-14
