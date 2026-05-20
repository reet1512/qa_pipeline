//! Table of Contents overlay for the detail pane.

use ratatui::{
    buffer::Buffer,
    layout::Rect,
    style::{Modifier, Style},
    text::{Line, Span},
    widgets::{Block, Borders, Clear, Paragraph, Widget},
};

use super::app::App;
use super::theme;

pub fn render(area: Rect, buf: &mut Buffer, app: &App) {
    let overlay_width = 52.min(area.width.saturating_sub(4));
    // Content lines: 1 blank top + toc entries + 1 blank bottom + 1 hint
    let content_height = (app.detail_toc.len() as u16 + 4).min(area.height.saturating_sub(4));
    let overlay_height = content_height + 2; // borders

    let x = (area.width.saturating_sub(overlay_width)) / 2;
    let y = (area.height.saturating_sub(overlay_height)) / 2;
    let overlay_area = Rect::new(x, y, overlay_width, overlay_height);

    Clear.render(overlay_area, buf);

    let block = Block::default()
        .title(" Contents ")
        .borders(Borders::ALL)
        .border_style(theme::border_focused_style());
    let inner = block.inner(overlay_area);
    block.render(overlay_area, buf);

    let current_section = app.current_toc_section();
    let mut lines: Vec<Line> = Vec::new();

    lines.push(Line::from(""));

    for (i, &(_, level, ref text)) in app.detail_toc.iter().enumerate() {
        let is_selected = i == app.toc_selected;
        let is_current = i == current_section;

        let indent = if level == 3 { "   " } else { " " };
        let marker = if is_current { "▶" } else { " " };

        let base_style = if is_selected {
            theme::selected_style()
        } else {
            Style::default()
        };

        let marker_style = if is_current && !is_selected {
            base_style.add_modifier(Modifier::BOLD)
        } else {
            base_style
        };

        lines.push(Line::from(vec![
            Span::styled(format!("{}{} ", indent, marker), marker_style),
            Span::styled(text.clone(), base_style),
        ]));
    }

    lines.push(Line::from(""));
    lines.push(Line::from(Span::styled(
        " [j/k] navigate  [Enter] jump  [Esc/T] close",
        theme::dimmed_style(),
    )));

    let paragraph = Paragraph::new(lines);
    paragraph.render(inner, buf);
}

#[cfg(test)]
mod tests {
    use super::super::app::App;
    use super::*;
    use ratatui::backend::TestBackend;
    use ratatui::Terminal;

    fn buffer_text(buf: &ratatui::buffer::Buffer) -> String {
        buf.content().iter().map(|c| c.symbol()).collect()
    }

    #[test]
    fn test_toc_overlay_renders() {
        let mut app = App::empty_for_test();
        app.detail_toc = vec![
            (0, 2, "Overview".to_string()),
            (5, 2, "Problems".to_string()),
            (10, 3, "Sub section".to_string()),
        ];

        let backend = TestBackend::new(60, 20);
        let mut terminal = Terminal::new(backend).unwrap();

        terminal
            .draw(|frame| {
                render(frame.area(), frame.buffer_mut(), &app);
            })
            .unwrap();

        let buf_str = buffer_text(terminal.backend().buffer());
        assert!(buf_str.contains("Contents"));
        assert!(buf_str.contains("Overview"));
        assert!(buf_str.contains("Problems"));
    }
}
