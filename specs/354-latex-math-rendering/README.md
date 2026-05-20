---
status: complete
created: 2026-03-04
priority: medium
tags:
- ui
- markdown
- latex
- math
- enhancement
created_at: 2026-03-04T08:04:37.800910861Z
updated_at: 2026-03-04T08:14:06.230725471Z
completed_at: 2026-03-04T08:14:06.230725471Z
transitions:
- status: in-progress
  at: 2026-03-04T08:11:57.898564075Z
- status: complete
  at: 2026-03-04T08:14:06.230725471Z
---

# LaTeX Math Rendering in Spec Content

## Overview

Specs often describe algorithms, formulas, or technical constraints that benefit from proper mathematical notation. Currently, LaTeX expressions like `$E = mc^2$` or `$$\sum_{i=1}^{n} x_i$$` render as plain text. Adding KaTeX-based math rendering to the markdown pipeline enables clear, professional mathematical expressions in spec content.

## Requirements

### Core
- [ ] Support inline math with single dollar delimiters: `$expression$`
- [ ] Support display/block math with double dollar delimiters: `$$expression$$`
- [ ] Render using KaTeX for fast, high-quality output
- [ ] Add `remark-math` plugin to parse math syntax in markdown AST
- [ ] Add `rehype-katex` plugin to render math nodes as KaTeX HTML
- [ ] Include KaTeX CSS stylesheet for proper rendering

### Integration
- [ ] Works alongside existing remark/rehype plugins (remarkGfm, remarkBreaks, rehypeSlug, rehypeHighlight)
- [ ] No regressions in existing markdown features (code blocks, tables, diagrams, checklists)
- [ ] Renders correctly in both light and dark themes
- [ ] LaTeX inside code blocks/inline code is NOT rendered (treated as literal text)

### Edge Cases
- [ ] Dollar signs used as currency (e.g., `$100`) should not trigger math rendering
- [ ] Escaped dollar signs (`\$`) render as literal `$`
- [ ] Invalid LaTeX gracefully shows error message inline (KaTeX default behavior)

## Non-Goals

- MathJax support (KaTeX is faster and lighter)
- LaTeX document features beyond math (e.g., `\usepackage`, environments like `\begin{document}`)
- Math editing/preview UI (WYSIWYG)
- Server-side pre-rendering of math expressions
- CLI terminal rendering of LaTeX (terminal output remains plain text)

## Technical Notes

### Implementation

The `MarkdownRenderer` component at `packages/ui/src/components/spec-detail/markdown-renderer.tsx` currently uses:
- `remark-gfm`, `remark-breaks` (remark plugins)
- `rehype-slug`, `rehype-highlight` (rehype plugins)

Adding math support requires two new plugins in the pipeline:
1. `remark-math` — parses `$...$` and `$$...$$` into math AST nodes
2. `rehype-katex` — converts math AST nodes into KaTeX-rendered HTML

```tsx
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';

// In ReactMarkdown:
remarkPlugins={[remarkGfm, remarkBreaks, remarkMath]}
rehypePlugins={[rehypeSlug, rehypeHighlight, rehypeKatex]}
```

KaTeX CSS must be imported or linked (e.g., `import 'katex/dist/katex.min.css'`).

### Dependencies

New npm packages:
- `remark-math` — remark plugin for math syntax
- `rehype-katex` — rehype plugin for KaTeX rendering
- `katex` — KaTeX library (peer dependency of rehype-katex)

### Bundle Size

KaTeX CSS + fonts add ~300KB (gzipped ~100KB). The JS is loaded only when math content is present if using dynamic imports, but static import is acceptable given KaTeX's small footprint.

## Acceptance Criteria

- Inline math `$x^2$` renders as formatted math in the spec detail view
- Block math `$$\int_0^1 f(x)\,dx$$` renders centered on its own line
- Existing specs without math render identically (no regressions)
- Dark mode: math expressions are legible with proper contrast
- Dollar currency like `$100` in normal text does not break rendering

## Dependencies

- **Extends**: [248-spec-detail-markdown-enhancements](../248-spec-detail-markdown-enhancements/) (markdown rendering pipeline)
