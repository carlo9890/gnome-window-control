// SPDX-FileCopyrightText: 2026 hko9890
// SPDX-License-Identifier: MIT
//! Column-aligned tables, matching the `column -t -s '\t'` layout the bash
//! client piped its rows through.
//!
//! Every column except the last is padded to the widest cell in that column and
//! followed by two spaces; the last column is emitted unpadded. Widths are
//! measured in terminal cells, not bytes, so CJK and emoji titles line up the
//! same way `column` lines them up.

use unicode_width::UnicodeWidthStr;

/// Replace control characters, line and paragraph separators and bidirectional
/// controls with a visible placeholder.
///
/// Window titles are arbitrary client-supplied strings: X11 WM_NAME and Wayland
/// xdg_toplevel titles can hold a newline or a tab. Emitted verbatim, a newline
/// splits the row in two, so `wctl list | wc -l` over-counts and anything
/// reading the first field of each line gets a fragment of a title where a
/// window ID should be. The bash client never had this problem because jq's
/// @tsv escaped these before `column` saw them. `unicode_width` also scores
/// control characters as zero, so the padding is wrong even when the row
/// survives -- replacing them with one printable character fixes both.
///
/// A line or paragraph separator breaks the row in some terminals, and a
/// bidirectional control (U+202E RIGHT-TO-LEFT OVERRIDE, say) makes a
/// bidi-capable terminal draw the rest of the row reversed, so the columns
/// after a title can show values the window chose.
pub(crate) fn sanitize(cell: &str) -> String {
    if !cell.chars().any(is_unsafe) {
        return cell.to_string();
    }
    cell.chars()
        .map(|c| if is_unsafe(c) { '?' } else { c })
        .collect()
}

fn is_unsafe(c: char) -> bool {
    c.is_control()
        || matches!(
            c,
            '\u{2028}'
                | '\u{2029}'
                | '\u{061C}'
                | '\u{200E}'
                | '\u{200F}'
                | '\u{202A}'..='\u{202E}'
                | '\u{2066}'..='\u{2069}'
        )
}

/// Render rows as an aligned table. Rows may have different lengths; a missing
/// cell counts as empty.
pub fn render(rows: &[Vec<String>]) -> String {
    let rows: Vec<Vec<String>> = rows
        .iter()
        .map(|row| row.iter().map(|cell| sanitize(cell)).collect())
        .collect();

    let columns = rows.iter().map(Vec::len).max().unwrap_or(0);
    let mut widths = vec![0usize; columns];
    for row in &rows {
        for (index, cell) in row.iter().enumerate() {
            widths[index] = widths[index].max(cell.width());
        }
    }

    let mut out = String::new();
    for row in &rows {
        let last = row.len().saturating_sub(1);
        for (index, cell) in row.iter().enumerate() {
            if index == last {
                out.push_str(cell);
            } else {
                out.push_str(cell);
                let pad = widths[index].saturating_sub(cell.width());
                out.extend(std::iter::repeat_n(' ', pad + 2));
            }
        }
        out.push('\n');
    }
    out
}

/// Truncate to `limit` characters, appending "..." when it had to cut.
///
/// Counted in characters, not bytes, because the bash client used jq's string
/// length and slice, which are both codepoint based.
pub fn truncate(text: &str, limit: usize, keep: usize) -> String {
    if text.chars().count() > limit {
        let head: String = text.chars().take(keep).collect();
        format!("{head}...")
    } else {
        text.to_string()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn control_characters_never_break_a_row() {
        // A window title is arbitrary client-supplied text. Emitted verbatim, a
        // newline splits the row, so `wctl list | wc -l` over-counts and the
        // first field of the extra line is a title fragment, not a window ID.
        let rows = vec![
            vec!["ID".to_string(), "TITLE".to_string()],
            vec!["12".to_string(), "one\ntwo".to_string()],
        ];
        let rendered = render(&rows);
        assert_eq!(rendered, "ID  TITLE\n12  one?two\n");
        assert_eq!(rendered.lines().count(), 2);
    }

    #[test]
    fn tabs_and_carriage_returns_are_replaced_too() {
        let rows = vec![vec!["a\tb".to_string(), "c\rd".to_string()]];
        assert_eq!(render(&rows), "a?b  c?d\n");
    }

    #[test]
    fn a_title_cannot_forge_a_line_or_reach_the_terminal() {
        assert_eq!(
            sanitize("evil\nClass:     forged\x1b[31mRED\x1b[0m"),
            "evil?Class:     forged?[31mRED?[0m"
        );
    }

    #[test]
    fn a_title_cannot_reorder_the_columns_after_it() {
        assert_eq!(
            sanitize("a\u{202E}b\u{2066}c\u{2069}d\u{200F}e\u{061C}f\u{2028}g\u{2029}h"),
            "a?b?c?d?e?f?g?h"
        );
        // Characters that only look unusual stay.
        assert_eq!(
            sanitize("caf\u{e9} \u{05e9}\u{05dc}\u{05d5}\u{05dd}"),
            "caf\u{e9} \u{05e9}\u{05dc}\u{05d5}\u{05dd}"
        );
    }

    #[test]
    fn ordinary_rows_pad_to_the_widest_cell() {
        let rows = vec![
            vec!["ID".to_string(), "T".to_string()],
            vec!["1234".to_string(), "x".to_string()],
        ];
        assert_eq!(render(&rows), "ID    T\n1234  x\n");
    }
}
