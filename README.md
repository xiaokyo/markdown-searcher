# Raycast Markdown Searcher

Search the content, title and filename of local Markdown files, right from Raycast.

## Features

- Multi-folder scan with in-memory index + incremental (mtime) cache — fast repeat launches
- Live search bar (type to search); multiple keywords are matched with AND
- Matches content, title and filename; relevance ranking (title > filename > content, then hit count)
- Detail preview: match excerpt on top (rendered, highlighted) + full document below
- Jump to the matched line in VS Code via `vscode://` deep link; match line number shown in the list
- Actions: Open File / Open in VS Code (at match) / Open with configured editor / Show in Finder / Copy Path / Copy Content / Copy Excerpt
- Frequently opened files float to the top (frecency); remembers the detail pane toggle
- Regex exclude filter

## Preferences

- **Markdown Folders** — folder paths, comma separated (required)
- **Exclude File or Path Regexp** — comma separated
- **File Extensions** — default `md,markdown`
- **Max Results** — default `200`
- **Editor App** — app name/path for the "Open with Editor" action
