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

/// Render rows as an aligned table. Rows may have different lengths; a missing
/// cell counts as empty.
pub fn render(rows: &[Vec<String>]) -> String {
    let columns = rows.iter().map(Vec::len).max().unwrap_or(0);
    let mut widths = vec![0usize; columns];
    for row in rows {
        for (index, cell) in row.iter().enumerate() {
            widths[index] = widths[index].max(cell.width());
        }
    }

    let mut out = String::new();
    for row in rows {
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
