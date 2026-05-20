---
status: complete
created: 2026-03-20
priority: high
tags:
- cli
- tui
- ux
- rust
- ratatui
created_at: 2026-03-20T10:00:00Z
updated_at: 2026-03-23T09:30:33.492093709Z
completed_at: 2026-03-23T09:30:33.492093709Z
transitions:
- status: in-progress
  at: 2026-03-23T09:15:43.374716043Z
- status: complete
  at: 2026-03-23T09:30:33.492093709Z
---

# TUI Sidebar Navigation & Scroll Improvements

> **Status**: planned · **Priority**: high · **Created**: 2026-03-20

## Overview

The TUI sidebar lacks feature parity with the web UI for navigating specs. The web UI provides sorting, multi-criteria filtering, and a collapsible tree view — the TUI sidebar is a flat list with no sorting or filter controls. Additionally, there are UX bugs: the sidebar loses its active-item highlight when focus moves to the detail pane, scrolling propagates to the outer terminal (tmux) when hitting list boundaries, and the sidebar scroll position resets unexpectedly.

**Goal**: Bring the TUI sidebar to web-UI parity for sort/filter/tree, fix focus highlight persistence, and contain scroll events within pane boundaries.

## Problems

1. **No sort/filter controls in sidebar** — the web UI offers sort (by id, title, priority, updated), status/priority/tag filters, and a settings menu. The TUI sidebar has none of these; only `/` search exists.
2. **Active-item highlight disappears** — when the user presses `l`/`Enter` to focus the detail pane, the selected spec in the sidebar loses its visual highlight, making it hard to know which spec is being viewed.
3. **Sidebar scroll position not fixed** — scrolling the detail pane can inadvertently affect the sidebar, and the sidebar doesn't maintain a stable viewport when switching focus.
4. **Scroll propagation to outer terminal** — when the sidebar or detail pane reaches the top/bottom boundary, continued scroll events leak to the parent terminal (e.g. tmux), causing unexpected scrollback or pane switching.

## Design

### 1. Sort & Filter Controls

Add a filter/sort header bar above the sidebar spec list:

```
┌─ Specs (42) ──────────────┐
│ Sort: [priority ↓]  [⚙]  │
│ Filter: status:planned ×  │
├───────────────────────────┤
│ ▲ 369 Terminal UI (TUI)   │
│   370 TUI UX Enhancements │
│ ...                       │
```

**Sort options** (cycle with `s` key):
- ID descending (default)
- ID ascending
- Priority descending
- Title alphabetical
- Updated descending

**Filter** (press `f` to open filter popup):
- Status multi-select (draft, planned, in-progress, complete, archived)
- Priority multi-select (critical, high, medium, low)
- Tag multi-select (searchable list)
- Show/hide archived toggle

Active filters shown as chips below the sort bar. `F` clears all filters.

**State**: `SortOption` enum and `FilterState` struct in `app.rs`. Filters compose — active status + priority + tag filters are AND'd together. The existing `/` search remains and applies on top of filters.

### 2. Tree View (Expand/Collapse)

Add a hierarchy mode toggled with `t` key:

```
┌─ Specs (tree) ────────────┐
│ ▼ 100 Parent Spec         │
│   ├─ 101 Child Spec A     │
│   └─ 102 Child Spec B     │
│ ▼ 200 Another Parent      │
│   ├─ 201 Sub-spec         │
│   │  └─ 202 Nested        │
│   └─ 203 Sub-spec B       │
│ ▶ 300 Collapsed Parent    │
│   350 Standalone Spec     │
```

- Parent-child relationships derived from spec `parent` field (already in `SpecInfo`)
- `▼` expanded, `▶` collapsed prefixes on parent nodes
- `Enter`/`Space` on a parent toggles expand/collapse
- `z` collapses all, `Z` expands all
- Indentation: 2 chars per nesting level, tree lines (`├─`, `└─`, `│`) for visual hierarchy
- Standalone specs (no parent, no children) shown at root level without tree prefix
- Sorting applies within each tree level
- Filters prune the tree but keep ancestor nodes visible (dimmed) if a descendant matches

### 3. Persistent Sidebar Highlight

When focus moves to the detail pane (`FocusPane::Right`):
- The selected sidebar item retains a **dimmed highlight** style (e.g. `Style::default().bg(Color::DarkGray)`) instead of losing all styling
- The focused pane's selected item uses the full highlight (`theme::selected_style()`)
- This mirrors how VS Code, lazygit, and similar tools distinguish active vs inactive selection

Implementation in `list.rs` and `board.rs`: check `app.focus` when applying the selected style. If `focus == Right`, use `theme::inactive_selected_style()` instead of `theme::selected_style()`.

### 4. Scroll Containment

Prevent scroll events from propagating beyond pane boundaries:

- **Detail pane**: Clamp `detail_scroll` to `[0, max_scroll]` where `max_scroll = content_lines.saturating_sub(visible_height)`. When scroll is at boundary, consume the event (return without propagating).
- **Sidebar list**: Similarly clamp selection index. When at first/last item, consume `ScrollUp`/`ScrollDown` without propagating.
- **Mouse scroll**: In `keybindings.rs`, always consume `MouseEventKind::ScrollUp/Down` events (don't let crossterm pass them to the outer terminal). This is achieved by handling all scroll events in the match arms — no fallthrough to the default case.
- **Keyboard scroll**: `j`/`k` and arrow keys already don't propagate; ensure `PageUp`/`PageDown`/`Home`/`End` also clamp at boundaries.

Key insight: crossterm's `enable_mouse_capture()` already captures mouse events. The issue is that when our handler doesn't consume a scroll event (e.g. at boundary), it falls through, and the terminal emulator interprets it. The fix is to always return `Ok(())` from scroll handlers regardless of boundary state.

## Plan

- [x] Add `SortOption` enum and `FilterState` struct to `app.rs`
- [x] Implement sort logic — apply sort to `filtered_specs` after filtering
- [x] Implement filter popup widget (`tui/filter.rs`) with status/priority multi-select
- [x] Add sort indicator and active filter chips to sidebar header
- [x] Build tree data structure from spec parent relationships in `app.rs`
- [x] Implement tree view renderer in `list.rs` with expand/collapse, indentation, and tree lines
- [x] Add `t` keybinding to toggle tree view; `z`/`Z` for collapse/expand all
- [x] Add `theme::inactive_selected_style()` for dimmed highlight
- [x] Update `list.rs` and `board.rs` to use inactive style when `focus == Right`
- [x] Clamp detail scroll to `[0, max_scroll]` in `detail.rs`
- [x] Clamp sidebar selection at boundaries in `keybindings.rs`
- [x] Ensure all mouse scroll events are consumed (no fallthrough)
- [x] Add `PageUp`/`PageDown`/`Home`/`End` with boundary clamping

## Non-Goals

- Persistent filter/sort preferences across restarts (session-only for now)
- Drag-and-drop reordering of specs
- Inline spec editing from the sidebar
- Virtual scrolling / lazy rendering (current performance is fine for <1000 specs)

## Test

- [x] `s` key cycles through sort options; sidebar re-sorts immediately
- [x] `f` key opens filter popup; selecting status/priority filters the list
- [x] `F` clears all active filters
- [x] `t` toggles tree view; parent specs show `▼`/`▶` with correct nesting
- [x] Expand/collapse works on parent nodes; `z`/`Z` collapse/expand all
- [x] Tree view respects active filters (matched descendants keep ancestor chain visible)
- [x] Sidebar highlight persists (dimmed) when focus moves to detail pane
- [x] Scrolling past the end of detail pane does NOT scroll tmux scrollback
- [x] Scrolling past the first/last sidebar item does NOT propagate to tmux
- [x] `PageUp`/`PageDown`/`Home`/`End` work and clamp at boundaries
- [x] Sort + filter + tree view compose correctly (e.g. sort by priority in tree mode with status filter)
