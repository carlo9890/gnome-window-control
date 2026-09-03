// SPDX-FileCopyrightText: 2026 hko9890
// SPDX-License-Identifier: MIT
//! Workarea-relative geometry: the `place` tokens, the `tile` grid, and the
//! centring formula `center` shares with `place center`.
//!
//! All arithmetic is integer and truncating, the same as the shell arithmetic
//! it replaces, so the pixel results are identical.

use crate::fail::{Fail, Result};

#[derive(Clone, Copy, PartialEq, Eq)]
pub enum Axis {
    X,
    Y,
}

/// A workarea or window rectangle.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct Rect {
    pub x: i64,
    pub y: i64,
    pub width: i64,
    pub height: i64,
}

fn is_positive_integer(token: &str) -> bool {
    let mut chars = token.chars();
    matches!(chars.next(), Some('1'..='9')) && chars.all(|c| c.is_ascii_digit())
}

fn is_integer(token: &str) -> bool {
    let digits = token.strip_prefix('-').unwrap_or(token);
    !digits.is_empty() && digits.chars().all(|c| c.is_ascii_digit())
}

/// Resolve a WIDTH/HEIGHT token: absolute pixels, or a percentage of the
/// workarea. There is no upper clamp (150% is allowed), but a percentage that
/// floors to zero pixels is refused.
pub fn resolve_place_size(token: &str, base_size: i64, label: &str) -> Result<i64> {
    if is_positive_integer(token) {
        if let Ok(value) = token.parse::<i64>() {
            return Ok(value);
        }
    }

    if let Some(percent) = token.strip_suffix('%') {
        if !percent.is_empty() && percent.chars().all(|c| c.is_ascii_digit()) {
            if let Ok(percent) = percent.parse::<i64>() {
                let value = base_size * percent / 100;
                if value > 0 {
                    return Ok(value);
                }
                return Err(Fail::error(format!(
                    "{label} percentage resolves to 0 pixels: {token}"
                )));
            }
        }
    }

    Err(Fail::error(format!(
        "Invalid {label}: {token}. Use a positive number or percentage like 50%"
    )))
}

/// Resolve an X/Y token: absolute pixels, or an alignment keyword resolved
/// against the workarea and the window's own size.
pub fn resolve_place_position(
    token: &str,
    axis: Axis,
    workarea_pos: i64,
    workarea_size: i64,
    window_size: i64,
) -> Result<i64> {
    if is_integer(token) {
        if let Ok(value) = token.parse::<i64>() {
            return Ok(value);
        }
    }

    let start = workarea_pos;
    let center = workarea_pos + (workarea_size - window_size) / 2;
    let end = workarea_pos + workarea_size - window_size;

    match (axis, token) {
        (Axis::X, "left") => Ok(start),
        (Axis::X, "center") => Ok(center),
        (Axis::X, "right") => Ok(end),
        (Axis::Y, "top") => Ok(start),
        (Axis::Y, "center") => Ok(center),
        (Axis::Y, "bottom") => Ok(end),
        (Axis::X, _) => Err(Fail::error(format!(
            "Invalid X position: {token}. Use a number or left|center|right"
        ))),
        (Axis::Y, _) => Err(Fail::error(format!(
            "Invalid Y position: {token}. Use a number or top|center|bottom"
        ))),
    }
}

/// Resolve the four `place` tokens against a workarea, in the order the sizes
/// have to be known before the alignment keywords can use them.
///
/// The one implementation of that arithmetic: `place` applies the result and
/// `resolve-place` only reports it, so the two cannot disagree.
pub fn resolve_place_rect(tokens: [&str; 4], workarea: Rect) -> Result<Rect> {
    let width = resolve_place_size(tokens[2], workarea.width, "WIDTH")?;
    let height = resolve_place_size(tokens[3], workarea.height, "HEIGHT")?;
    let x = resolve_place_position(tokens[0], Axis::X, workarea.x, workarea.width, width)?;
    let y = resolve_place_position(tokens[1], Axis::Y, workarea.y, workarea.height, height)?;
    Ok(Rect {
        x,
        y,
        width,
        height,
    })
}

pub const TILE_USAGE: &str = "Valid positions:
  top-left, top-center, top-right
  left, center, right
  bottom-left, bottom-center, bottom-right";

/// Resolve a 4x2 grid cell into pixels.
///
/// Cell size floors, so a workarea width that is not divisible by four leaves a
/// remainder at the right edge instead of stretching the last column.
pub fn resolve_tile_geometry(position: &str, workarea: Rect) -> Result<Rect> {
    let cell_w = workarea.width / 4;
    let cell_h = workarea.height / 2;

    let (start_col, end_col, start_row, end_row) = match position {
        "top-left" => (0, 0, 0, 0),
        "top-center" => (1, 2, 0, 0),
        "top-right" => (3, 3, 0, 0),
        "left" => (0, 0, 0, 1),
        "center" => (1, 2, 0, 1),
        "right" => (3, 3, 0, 1),
        "bottom-left" => (0, 0, 1, 1),
        "bottom-center" => (1, 2, 1, 1),
        "bottom-right" => (3, 3, 1, 1),
        _ => {
            return Err(Fail::error(format!(
                "Invalid position: {position}\n{TILE_USAGE}"
            )))
        }
    };

    Ok(Rect {
        x: workarea.x + cell_w * start_col,
        y: workarea.y + cell_h * start_row,
        width: cell_w * (end_col - start_col + 1),
        height: cell_h * (end_row - start_row + 1),
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    // Expected values are hardcoded known-good results, not recomputed from the
    // implementation's own formula. They are the same numbers the bash suite
    // pinned in tests/test-logic.sh.

    #[test]
    fn place_size_literal_and_percentage() {
        assert_eq!(resolve_place_size("800", 1920, "Width").unwrap(), 800);
        assert_eq!(resolve_place_size("50%", 1920, "Width").unwrap(), 960);
        assert_eq!(resolve_place_size("100%", 1080, "Height").unwrap(), 1080);
        assert_eq!(resolve_place_size("33%", 1000, "Width").unwrap(), 330);
        assert_eq!(resolve_place_size("150%", 1000, "Width").unwrap(), 1500);
    }

    #[test]
    fn place_size_rejects_zero_and_garbage() {
        for token in ["0%", "1%", "abc", "0", "-5", "50 %", "%"] {
            let base = if token == "1%" { 10 } else { 1920 };
            assert!(
                resolve_place_size(token, base, "Width").is_err(),
                "expected {token} to be refused"
            );
        }
    }

    #[test]
    fn place_size_messages() {
        let err = resolve_place_size("0%", 1920, "Width").unwrap_err();
        assert_eq!(err.to_string(), "Width percentage resolves to 0 pixels: 0%");
        let err = resolve_place_size("abc", 1920, "Width").unwrap_err();
        assert_eq!(
            err.to_string(),
            "Invalid Width: abc. Use a positive number or percentage like 50%"
        );
    }

    #[test]
    fn place_position_literals_and_keywords() {
        let x = |t: &str, size| resolve_place_position(t, Axis::X, 0, 1920, size).unwrap();
        assert_eq!(
            resolve_place_position("100", Axis::X, 0, 1920, 800).unwrap(),
            100
        );
        assert_eq!(
            resolve_place_position("-50", Axis::X, 0, 1920, 800).unwrap(),
            -50
        );
        assert_eq!(
            resolve_place_position("left", Axis::X, 10, 1920, 800).unwrap(),
            10
        );
        assert_eq!(x("center", 800), 560);
        assert_eq!(x("right", 800), 1120);

        let y = |t: &str| resolve_place_position(t, Axis::Y, 27, 1053, 600).unwrap();
        assert_eq!(y("top"), 27);
        assert_eq!(y("center"), 253);
        assert_eq!(y("bottom"), 480);
    }

    #[test]
    fn place_position_window_larger_than_workarea_goes_negative() {
        assert_eq!(
            resolve_place_position("right", Axis::X, 0, 800, 1000).unwrap(),
            -200
        );
        assert_eq!(
            resolve_place_position("center", Axis::X, 0, 800, 1000).unwrap(),
            -100
        );
        assert_eq!(
            resolve_place_position("bottom", Axis::Y, 27, 600, 1000).unwrap(),
            -373
        );
    }

    #[test]
    fn place_position_rejects_wrong_keyword_for_the_axis() {
        let err = resolve_place_position("middle", Axis::X, 0, 1920, 800).unwrap_err();
        assert_eq!(
            err.to_string(),
            "Invalid X position: middle. Use a number or left|center|right"
        );
        let err = resolve_place_position("sideways", Axis::Y, 0, 1080, 600).unwrap_err();
        assert_eq!(
            err.to_string(),
            "Invalid Y position: sideways. Use a number or top|center|bottom"
        );
        // top/bottom belong to Y, left/right to X; neither crosses over.
        assert!(resolve_place_position("top", Axis::X, 0, 1920, 800).is_err());
        assert!(resolve_place_position("left", Axis::Y, 0, 1080, 600).is_err());
    }

    #[test]
    fn place_rect_resolves_all_four_tokens_together() {
        // Sample workarea (0, 27, 1920, 1053), the same one the tile cases use.
        let wa = Rect {
            x: 0,
            y: 27,
            width: 1920,
            height: 1053,
        };

        // Half width, full height, centred. The alignment needs the resolved
        // SIZE, so a wrong order here would centre against the wrong width.
        assert_eq!(
            resolve_place_rect(["center", "top", "50%", "100%"], wa).unwrap(),
            Rect {
                x: 480,
                y: 27,
                width: 960,
                height: 1053
            }
        );
        // Pixels and keywords mix, and bottom-right lands flush with the edges.
        assert_eq!(
            resolve_place_rect(["right", "bottom", "800", "600"], wa).unwrap(),
            Rect {
                x: 1120,
                y: 480,
                width: 800,
                height: 600
            }
        );
        // A negative X is a coordinate, not an error.
        assert_eq!(
            resolve_place_rect(["-50", "100", "33%", "50%"], wa).unwrap(),
            Rect {
                x: -50,
                y: 100,
                width: 633,
                height: 526
            }
        );
    }

    #[test]
    fn place_rect_reports_the_first_bad_token() {
        let wa = Rect {
            x: 0,
            y: 0,
            width: 1920,
            height: 1080,
        };
        // Sizes resolve before positions, so a bad WIDTH wins over a bad X.
        let err = resolve_place_rect(["sideways", "top", "abc", "100%"], wa).unwrap_err();
        assert_eq!(
            err.to_string(),
            "Invalid WIDTH: abc. Use a positive number or percentage like 50%"
        );
        let err = resolve_place_rect(["sideways", "top", "50%", "100%"], wa).unwrap_err();
        assert_eq!(
            err.to_string(),
            "Invalid X position: sideways. Use a number or left|center|right"
        );
    }

    #[test]
    fn tile_grid_pixels() {
        // Sample workarea (0, 27, 1920, 1053): cell_w=480, cell_h=526.
        let wa = Rect {
            x: 0,
            y: 27,
            width: 1920,
            height: 1053,
        };
        let cell = |p| resolve_tile_geometry(p, wa).unwrap();
        assert_eq!(
            cell("top-left"),
            Rect {
                x: 0,
                y: 27,
                width: 480,
                height: 526
            }
        );
        assert_eq!(
            cell("top-right"),
            Rect {
                x: 1440,
                y: 27,
                width: 480,
                height: 526
            }
        );
        assert_eq!(
            cell("center"),
            Rect {
                x: 480,
                y: 27,
                width: 960,
                height: 1052
            }
        );
        assert_eq!(
            cell("bottom-right"),
            Rect {
                x: 1440,
                y: 553,
                width: 480,
                height: 526
            }
        );
        assert_eq!(
            cell("top-center"),
            Rect {
                x: 480,
                y: 27,
                width: 960,
                height: 526
            }
        );
        assert_eq!(
            cell("left"),
            Rect {
                x: 0,
                y: 27,
                width: 480,
                height: 1052
            }
        );
        assert_eq!(
            cell("right"),
            Rect {
                x: 1440,
                y: 27,
                width: 480,
                height: 1052
            }
        );
        assert_eq!(
            cell("bottom-left"),
            Rect {
                x: 0,
                y: 553,
                width: 480,
                height: 526
            }
        );
        assert_eq!(
            cell("bottom-center"),
            Rect {
                x: 480,
                y: 553,
                width: 960,
                height: 526
            }
        );
    }

    #[test]
    fn tile_grid_floors_cells_and_leaves_a_remainder() {
        // Workarea width 1001 is not divisible by 4: cell_w floors to 250 and
        // the grid leaves a 1px remainder at the right edge.
        let wa = Rect {
            x: 0,
            y: 0,
            width: 1001,
            height: 1000,
        };
        assert_eq!(
            resolve_tile_geometry("top-left", wa).unwrap(),
            Rect {
                x: 0,
                y: 0,
                width: 250,
                height: 500
            }
        );
        assert_eq!(
            resolve_tile_geometry("top-right", wa).unwrap(),
            Rect {
                x: 750,
                y: 0,
                width: 250,
                height: 500
            }
        );
    }

    #[test]
    fn tile_rejects_an_unknown_position() {
        let wa = Rect {
            x: 0,
            y: 0,
            width: 1920,
            height: 1080,
        };
        let err = resolve_tile_geometry("nowhere", wa).unwrap_err();
        assert!(err.to_string().starts_with("Invalid position: nowhere\n"));
        assert!(err.to_string().contains("bottom-center"));
    }

    #[test]
    fn every_position_the_usage_text_names_resolves() {
        let wa = Rect {
            x: 0,
            y: 27,
            width: 1920,
            height: 1053,
        };
        for position in TILE_USAGE
            .lines()
            .skip(1)
            .flat_map(|line| line.split(',').map(str::trim))
        {
            assert!(resolve_tile_geometry(position, wa).is_ok(), "{position}");
        }
    }
}
