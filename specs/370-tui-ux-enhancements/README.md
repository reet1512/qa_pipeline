---
status: complete
created: '2026-03-20'
tags:
  - cli
  - tui
  - ux
  - rust
  - ratatui
priority: high
created_at: '2026-03-20T08:46:00.000000+00:00'
---

# TUI UX Enhancements

> **Status**: planned · **Priority**: high · **Created**: 2026-03-20

## Overview

The initial TUI (`lean-spec tui`) provides a working foundation but falls short of the quality bar set by the web UI and tools like lazygit or Claude Code. This spec tracks targeted UX improvements to make the TUI feel first-class: responsive layout, mouse support, readable markdown rendering, and web UI parity for key interactions.

## Problems

1. **Fixed 50/50 sidebar split** — sidebar and detail pane share equal width, wasting space on short spec lists while cramping content
2. **No mouse support** — can't click to select a spec, scroll the detail pane, or resize the split with a drag handle
3. **Raw markdown in detail pane** — `##`, `**`, `- [ ]` etc. render as literal characters; Claude Code renders markdown with visual hierarchy
4. **Missing web UI affordances** — status badges, priority indicators, tag display, dependency counts, and keyboard shortcuts discoverable via `?` are all absent or incomplete

## Design

### 1. Adjustable & Collapsible Sidebar

- Default sidebar width: **30%** (not 50%)
- `[` / `]` keys adjust sidebar width in 5% increments (min 15%, max 60%)
- `\` (backslash) or `Ctrl+B` toggles sidebar collapsed/expanded (collapsed = 0 width, full pane to detail)
- Drag handle at the split boundary responds to mouse drag to resize
- Width persists in session state (not across restarts)

### 2. Mouse Support

Enable `crossterm` mouse capture:

- **Click** a spec in the sidebar list → selects it and loads detail
- **Scroll** in sidebar → scrolls the list
- **Scroll** in detail pane → scrolls content
- **Click** drag handle → resize split (mouse down + move + release)
- **Double-click** spec → open in `$EDITOR` (same as `e` key)

### 3. Markdown Rendering in Detail Pane

Render markdown with visual styling instead of raw syntax:

| Element | Rendering |
|---------|-----------|
| `# H1` / `## H2` | Bold + color (cyan/yellow), no `#` chars |
| `**bold**` | Bold text, no `**` |
| `- item` / `* item` | `•` bullet |
| `- [ ]` / `- [x]` | `○` / `✓` with dim/green color |
| `` `code` `` | Highlighted span (dark background) |
| `> blockquote` | Dimmed + left border `│` |
| `---` horizontal rule | Full-width `─` line |
| Links `[text](url)` | Show text only (url in status bar on focus) |
| Code blocks | Bordered box with language label |

Reference: Claude Code's terminal markdown rendering style.

### 4. Web UI Parity Improvements

Port key affordances from the web UI to the TUI:

- **Status badge** — colored label next to spec title in sidebar (`planned` = blue, `in-progress` = yellow, `complete` = green, `archived` = dim)
- **Priority indicator** — icon prefix: `↑` critical, `▲` high, `—` medium, `▽` low
- **Tags** — shown as `[tag]` chips in the detail header
- **Dependency count** — sidebar shows `deps:N` when a spec has dependencies
- **Created/updated dates** — visible in detail metadata section
- **Search** — `/` search filters by title AND tags (currently title only)
- **Help overlay** — `?` shows a full keybindings reference panel (currently incomplete)
- **Status bar** — bottom bar shows: current view · spec count · selected spec id · key hints

## Plan

- [ ] Add `crossterm` mouse event handling to the event loop (`tui/mod.rs`)
- [ ] Implement sidebar width state with `[`/`]` resize and `\` collapse toggle
- [ ] Add drag-handle mouse resize
- [ ] Implement markdown renderer (`tui/markdown.rs`) with styled spans for all common elements
- [ ] Replace raw text rendering in `detail.rs` with the markdown renderer
- [ ] Add status badge coloring to sidebar spec lines (`board.rs`, `list.rs`)
- [ ] Add priority icon prefix to sidebar spec lines
- [ ] Show tags and dependency count in sidebar and detail header
- [ ] Extend search to filter by tags in addition to title
- [ ] Complete `?` help overlay with full keybindings table
- [ ] Add status bar widget at bottom of layout

## Non-Goals

- Spec editing in the TUI (use CLI `update` or editor)
- Full rich-text HTML rendering
- Persistent layout preferences across restarts (session-only)

## Test

- [ ] Sidebar collapses and expands with `\`; width adjusts with `[`/`]`
- [ ] Mouse click on spec in sidebar selects it
- [ ] Mouse scroll works in both sidebar and detail pane
- [ ] Detail pane renders `**bold**`, `## headings`, `- [ ]` checkboxes, and `` `code` `` without raw syntax characters
- [ ] Status badges show correct color per status value
- [ ] Search filters by tag (e.g. `/rust` returns rust-tagged specs)
- [ ] `?` help overlay shows complete keybindings list
- [ ] Status bar shows spec count and selected spec id
- [ ] No panics on multi-byte Unicode titles (regression: spec 370)
