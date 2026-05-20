//! Markdown renderer for the TUI detail pane.
//!
//! Converts markdown text into ratatui `Line` values with styled `Span`s.

use ratatui::{
    style::{Color, Modifier, Style},
    text::{Line, Span},
};

/// Render markdown content into a list of styled ratatui lines.
pub fn render_markdown(content: &str, width: u16) -> Vec<Line<'static>> {
    let mut lines: Vec<Line<'static>> = Vec::new();
    let mut in_code_block = false;
    let mut code_lang = String::new();
    let mut code_lines: Vec<String> = Vec::new();

    for raw_line in content.lines() {
        let trimmed = raw_line.trim_end();

        // --- Code block handling ---
        if trimmed.starts_with("```") {
            if in_code_block {
                // End of code block — emit box
                let block_lines = flush_code_block(&code_lang, &code_lines, width);
                lines.extend(block_lines);
                in_code_block = false;
                code_lang.clear();
                code_lines.clear();
            } else {
                // Start of code block
                in_code_block = true;
                code_lang = trimmed.trim_start_matches('`').trim().to_string();
            }
            continue;
        }

        if in_code_block {
            code_lines.push(trimmed.to_string());
            continue;
        }

        // --- Normal markdown elements ---
        let line = parse_line(trimmed, width);
        lines.push(line);
    }

    // Unclosed code block — flush remaining
    if in_code_block && !code_lines.is_empty() {
        let block_lines = flush_code_block(&code_lang, &code_lines, width);
        lines.extend(block_lines);
    }

    lines
}

/// Parse a single non-code-block line into a `Line<'static>`.
fn parse_line(text: &str, width: u16) -> Line<'static> {
    // Horizontal rule
    if text == "---" || text == "***" || text == "___" {
        let rule = "─".repeat(width.saturating_sub(2) as usize);
        return Line::from(Span::styled(rule, Style::default().fg(Color::DarkGray)));
    }

    // H1
    if let Some(rest) = text.strip_prefix("# ") {
        let header_text = format!(" ═ {}", rest);
        return Line::from(Span::styled(
            header_text,
            Style::default()
                .fg(Color::Cyan)
                .add_modifier(Modifier::BOLD),
        ));
    }

    // H2
    if let Some(rest) = text.strip_prefix("## ") {
        let header_text = format!(" — {}", rest);
        return Line::from(Span::styled(
            header_text,
            Style::default()
                .fg(Color::Yellow)
                .add_modifier(Modifier::BOLD),
        ));
    }

    // H3
    if let Some(rest) = text.strip_prefix("### ") {
        let header_text = format!("   {}", rest);
        return Line::from(Span::styled(
            header_text,
            Style::default()
                .fg(Color::White)
                .add_modifier(Modifier::BOLD),
        ));
    }

    // Blockquote
    if let Some(rest) = text.strip_prefix("> ") {
        let mut spans = vec![Span::styled(
            " │ ".to_string(),
            Style::default().fg(Color::DarkGray),
        )];
        spans.extend(parse_inline(rest));
        return Line::from(spans);
    }
    if text == ">" {
        return Line::from(Span::styled(
            " │ ".to_string(),
            Style::default().fg(Color::DarkGray),
        ));
    }

    // Task list items
    if text.starts_with("- [ ] ") || text.starts_with("* [ ] ") {
        let rest = &text[6..];
        let mut spans = vec![Span::styled(
            " ○ ".to_string(),
            Style::default().fg(Color::DarkGray),
        )];
        spans.extend(parse_inline(rest));
        return Line::from(spans);
    }
    if text.starts_with("- [x] ")
        || text.starts_with("- [X] ")
        || text.starts_with("* [x] ")
        || text.starts_with("* [X] ")
    {
        let rest = &text[6..];
        let mut spans = vec![Span::styled(
            " ✓ ".to_string(),
            Style::default().fg(Color::Green),
        )];
        spans.extend(parse_inline(rest));
        return Line::from(spans);
    }

    // Bullet list items
    if let Some(rest) = text.strip_prefix("- ").or_else(|| text.strip_prefix("* ")) {
        let mut spans = vec![Span::raw(" • ".to_string())];
        spans.extend(parse_inline(rest));
        return Line::from(spans);
    }

    // Table rows (contain | characters)
    if text.contains('|') && text.trim_start().starts_with('|') {
        // Separator row: |---|---|
        let is_separator = text
            .split('|')
            .filter(|s| !s.trim().is_empty())
            .all(|cell| cell.trim().chars().all(|c| c == '-' || c == ':'));
        if is_separator {
            let rule = "─".repeat(text.chars().count());
            return Line::from(Span::styled(rule, Style::default().fg(Color::DarkGray)));
        }

        // Regular table row
        let spans: Vec<Span<'static>> = text
            .split('|')
            .enumerate()
            .flat_map(|(i, cell)| {
                if i == 0 && cell.trim().is_empty() {
                    // Leading pipe — skip
                    return vec![];
                }
                if cell.trim().is_empty() && i > 0 {
                    return vec![];
                }
                let mut cell_spans = parse_inline(cell.trim());
                cell_spans.push(Span::raw(" │ ".to_string()));
                cell_spans
            })
            .collect();
        return Line::from(spans);
    }

    // Default: inline parsing
    let spans = parse_inline(text);
    if spans.is_empty() {
        Line::from("")
    } else {
        Line::from(spans)
    }
}

/// Parse inline markdown elements (bold, code, links) into `Span`s.
pub fn parse_inline(text: &str) -> Vec<Span<'static>> {
    let mut spans: Vec<Span<'static>> = Vec::new();
    let chars: Vec<char> = text.chars().collect();
    let len = chars.len();
    let mut i = 0;
    let mut current = String::new();

    while i < len {
        // Inline code: `...`
        if chars[i] == '`' {
            if !current.is_empty() {
                spans.push(Span::raw(current.clone()));
                current.clear();
            }
            i += 1;
            let start = i;
            while i < len && chars[i] != '`' {
                i += 1;
            }
            let code: String = chars[start..i].iter().collect();
            spans.push(Span::styled(
                code,
                Style::default().fg(Color::Green).bg(Color::DarkGray),
            ));
            if i < len {
                i += 1; // skip closing `
            }
            continue;
        }

        // Bold: **...**
        if i + 1 < len && chars[i] == '*' && chars[i + 1] == '*' {
            if !current.is_empty() {
                spans.push(Span::raw(current.clone()));
                current.clear();
            }
            i += 2;
            let start = i;
            while i + 1 < len && !(chars[i] == '*' && chars[i + 1] == '*') {
                i += 1;
            }
            let bold_text: String = chars[start..i].iter().collect();
            spans.push(Span::styled(
                bold_text,
                Style::default().add_modifier(Modifier::BOLD),
            ));
            if i + 1 < len {
                i += 2; // skip closing **
            }
            continue;
        }

        // Link: [text](url)
        if chars[i] == '[' {
            // Find closing ]
            let bracket_start = i + 1;
            let mut j = bracket_start;
            while j < len && chars[j] != ']' {
                j += 1;
            }
            if j < len && j + 1 < len && chars[j + 1] == '(' {
                // Found [text]( — now find )
                let paren_start = j + 2;
                let mut k = paren_start;
                while k < len && chars[k] != ')' {
                    k += 1;
                }
                if k < len {
                    // Valid link
                    if !current.is_empty() {
                        spans.push(Span::raw(current.clone()));
                        current.clear();
                    }
                    let link_text: String = chars[bracket_start..j].iter().collect();
                    spans.push(Span::styled(link_text, Style::default().fg(Color::Cyan)));
                    i = k + 1; // skip past )
                    continue;
                }
            }
        }

        current.push(chars[i]);
        i += 1;
    }

    if !current.is_empty() {
        spans.push(Span::raw(current));
    }

    spans
}

/// Flush a collected code block into bordered box lines.
fn flush_code_block(lang: &str, code_lines: &[String], width: u16) -> Vec<Line<'static>> {
    let inner_width = width.saturating_sub(4) as usize;
    let mut result: Vec<Line<'static>> = Vec::new();

    // Top border: ┌─ lang ─┐
    let lang_label = if lang.is_empty() {
        String::new()
    } else {
        format!(" {} ", lang)
    };
    let dashes_total = inner_width.saturating_sub(lang_label.chars().count());
    let dashes_left = dashes_total / 2;
    let dashes_right = dashes_total - dashes_left;
    let top = format!(
        "┌{}{}{}┐",
        "─".repeat(dashes_left),
        lang_label,
        "─".repeat(dashes_right)
    );
    result.push(Line::from(Span::styled(
        top,
        Style::default().fg(Color::DarkGray),
    )));

    // Code lines
    for line in code_lines {
        let padded = format!(
            "│ {:<width$} │",
            line,
            width = inner_width.saturating_sub(2)
        );
        result.push(Line::from(Span::styled(
            padded,
            Style::default().fg(Color::Green),
        )));
    }

    // Bottom border: └──────┘
    let bottom = format!("└{}┘", "─".repeat(inner_width));
    result.push(Line::from(Span::styled(
        bottom,
        Style::default().fg(Color::DarkGray),
    )));

    result
}

#[cfg(test)]
mod tests {
    use super::*;

    fn spans_text(spans: &[Span]) -> String {
        spans.iter().map(|s| s.content.as_ref()).collect()
    }

    fn lines_text(lines: &[Line]) -> String {
        lines
            .iter()
            .map(|l| spans_text(&l.spans))
            .collect::<Vec<_>>()
            .join("\n")
    }

    #[test]
    fn test_h1_renders_with_prefix_no_hash() {
        let lines = render_markdown("# Hello World", 80);
        assert_eq!(lines.len(), 1);
        let text = spans_text(&lines[0].spans);
        assert!(text.contains("Hello World"));
        assert!(!text.contains('#'));
        assert!(text.contains('═'));
    }

    #[test]
    fn test_h2_renders_with_prefix_no_hash() {
        let lines = render_markdown("## Sub Heading", 80);
        assert_eq!(lines.len(), 1);
        let text = spans_text(&lines[0].spans);
        assert!(text.contains("Sub Heading"));
        assert!(!text.contains('#'));
        assert!(text.contains('—'));
    }

    #[test]
    fn test_bold_no_asterisks() {
        let spans = parse_inline("Hello **world** end");
        let text = spans_text(&spans);
        assert_eq!(text, "Hello world end");
        assert!(!text.contains('*'));
        // Bold span should have BOLD modifier
        let bold_span = spans.iter().find(|s| s.content == "world").unwrap();
        assert!(bold_span.style.add_modifier.contains(Modifier::BOLD));
    }

    #[test]
    fn test_bullet_item() {
        let lines = render_markdown("- item one", 80);
        assert_eq!(lines.len(), 1);
        let text = spans_text(&lines[0].spans);
        assert!(text.contains('•'));
        assert!(text.contains("item one"));
        assert!(!text.starts_with("- "));
    }

    #[test]
    fn test_star_bullet_item() {
        let lines = render_markdown("* another item", 80);
        let text = spans_text(&lines[0].spans);
        assert!(text.contains('•'));
        assert!(text.contains("another item"));
    }

    #[test]
    fn test_task_unchecked() {
        let lines = render_markdown("- [ ] do something", 80);
        let text = spans_text(&lines[0].spans);
        assert!(text.contains('○'));
        assert!(text.contains("do something"));
    }

    #[test]
    fn test_task_checked() {
        let lines = render_markdown("- [x] done thing", 80);
        let text = spans_text(&lines[0].spans);
        assert!(text.contains('✓'));
        assert!(text.contains("done thing"));
    }

    #[test]
    fn test_inline_code() {
        let spans = parse_inline("Use `cargo build` now");
        let text = spans_text(&spans);
        assert_eq!(text, "Use cargo build now");
        // The code span should have green fg
        let code_span = spans.iter().find(|s| s.content == "cargo build").unwrap();
        assert_eq!(code_span.style.fg, Some(Color::Green));
    }

    #[test]
    fn test_blockquote() {
        let lines = render_markdown("> important note", 80);
        let text = spans_text(&lines[0].spans);
        assert!(text.contains('│'));
        assert!(text.contains("important note"));
    }

    #[test]
    fn test_horizontal_rule() {
        let lines = render_markdown("---", 10);
        let text = spans_text(&lines[0].spans);
        // Should be all ─ chars
        assert!(text.chars().all(|c| c == '─'));
    }

    #[test]
    fn test_link_shows_text_only() {
        let spans = parse_inline("[click here](https://example.com)");
        let text = spans_text(&spans);
        assert_eq!(text, "click here");
        assert!(!text.contains("https://"));
        let link_span = &spans[0];
        assert_eq!(link_span.style.fg, Some(Color::Cyan));
    }

    #[test]
    fn test_code_block() {
        let md = "```rust\nfn main() {}\n```";
        let lines = render_markdown(md, 40);
        let text = lines_text(&lines);
        assert!(text.contains("rust"));
        assert!(text.contains("fn main() {}"));
        assert!(text.contains('┌'));
        assert!(text.contains('└'));
    }

    #[test]
    fn test_code_block_no_lang() {
        let md = "```\nsome code\n```";
        let lines = render_markdown(md, 40);
        let text = lines_text(&lines);
        assert!(text.contains("some code"));
        assert!(text.contains('┌'));
    }

    #[test]
    fn test_table_separator_row() {
        let md = "| --- | --- |";
        let lines = render_markdown(md, 40);
        let text = spans_text(&lines[0].spans);
        assert!(text.chars().all(|c| c == '─'));
    }

    #[test]
    fn test_table_content_row() {
        let md = "| Foo | Bar |";
        let lines = render_markdown(md, 40);
        let text = spans_text(&lines[0].spans);
        assert!(text.contains("Foo"));
        assert!(text.contains("Bar"));
    }

    #[test]
    fn test_empty_line() {
        // An empty string has no lines per str::lines() — renders 0 lines
        let lines = render_markdown("", 80);
        assert_eq!(lines.len(), 0);
    }

    #[test]
    fn test_blank_line_in_content() {
        // A single blank line (empty line in multi-line content)
        let lines = render_markdown("hello\n\nworld", 80);
        assert_eq!(lines.len(), 3); // "hello", "", "world"
    }

    #[test]
    fn test_multiline() {
        let md = "# Title\n\nSome text\n\n## Section\n\n- item";
        let lines = render_markdown(md, 80);
        let text = lines_text(&lines);
        assert!(text.contains("Title"));
        assert!(text.contains("Some text"));
        assert!(text.contains("Section"));
        assert!(text.contains('•'));
    }

    #[test]
    fn test_parse_inline_plain_text() {
        let spans = parse_inline("plain text");
        assert_eq!(spans_text(&spans), "plain text");
    }

    #[test]
    fn test_parse_inline_mixed() {
        let spans = parse_inline("Hello **bold** and `code` end");
        let text = spans_text(&spans);
        assert_eq!(text, "Hello bold and code end");
    }
}
