// SPDX-FileCopyrightText: 2026 hko9890
// SPDX-License-Identifier: MIT
//! move, resize, move-resize, place, tile and center.

use crate::commands::{not_found, report};
use crate::fail::{Fail, Result};
use crate::geometry::{self, Axis, Rect, TILE_USAGE};
use crate::model::{self, Ctx};
use crate::selector;

const PLACE_USAGE: &str = "Usage: wctl place <WINDOW> <X> <Y> <WIDTH> <HEIGHT>
X:      number or left|center|right
Y:      number or top|center|bottom
WIDTH:  positive number or percentage like 50%
HEIGHT: positive number or percentage like 100%";

fn tile_usage() -> String {
    format!("Usage: wctl tile <WINDOW> <position>\n{TILE_USAGE}")
}

/// Parse a signed pixel coordinate.
fn coordinate(token: &str, label: &str) -> Result<i32> {
    let digits = token.strip_prefix('-').unwrap_or(token);
    let looks_numeric = !digits.is_empty() && digits.chars().all(|c| c.is_ascii_digit());
    if !looks_numeric {
        return Err(Fail::error(format!("{label} coordinate must be a number")));
    }
    token
        .parse::<i32>()
        .map_err(|_| Fail::error(format!("{label} coordinate must be a number")))
}

/// Parse a pixel extent. Zero is refused: the bash guard was `^[1-9][0-9]*$`.
fn extent(token: &str, label: &str) -> Result<i32> {
    let positive = token.starts_with(|c: char| c.is_ascii_digit() && c != '0')
        && token.chars().all(|c| c.is_ascii_digit());
    if !positive {
        return Err(Fail::error(format!("{label} must be a positive number")));
    }
    token
        .parse::<i32>()
        .map_err(|_| Fail::error(format!("{label} must be a positive number")))
}

/// The workarea of the monitor the window is on.
fn workarea_for(ctx: &mut Ctx, window: &model::Window) -> Result<Rect> {
    let monitor = model::number(window, "monitor_index") as i32;
    let (x, y, width, height) = ctx.bus.get_workarea(monitor)?;
    Ok(Rect {
        x: x as i64,
        y: y as i64,
        width: width as i64,
        height: height as i64,
    })
}

fn as_i32(value: i64) -> i32 {
    value.clamp(i32::MIN as i64, i32::MAX as i64) as i32
}

pub fn move_window(ctx: &mut Ctx, args: &[String]) -> Result<()> {
    let (id, shift) = selector::resolve(ctx, 2, "Usage: wctl move <WINDOW> <X> <Y>", args)?;
    let x = coordinate(&args[shift], "X")?;
    let y = coordinate(&args[shift + 1], "Y")?;

    let ok = ctx.bus.call_bool("Move", &(id, x, y))?;
    report(ok, "Window moved", not_found(id))
}

pub fn resize(ctx: &mut Ctx, args: &[String]) -> Result<()> {
    let (id, shift) =
        selector::resolve(ctx, 2, "Usage: wctl resize <WINDOW> <WIDTH> <HEIGHT>", args)?;
    let width = extent(&args[shift], "Width")?;
    let height = extent(&args[shift + 1], "Height")?;

    let ok = ctx.bus.call_bool("Resize", &(id, width, height))?;
    report(ok, "Window resized", not_found(id))
}

pub fn move_resize(ctx: &mut Ctx, args: &[String]) -> Result<()> {
    let usage = "Usage: wctl move-resize <WINDOW> <X> <Y> <WIDTH> <HEIGHT>";
    let (id, shift) = selector::resolve(ctx, 4, usage, args)?;
    let x = coordinate(&args[shift], "X")?;
    let y = coordinate(&args[shift + 1], "Y")?;
    let width = extent(&args[shift + 2], "Width")?;
    let height = extent(&args[shift + 3], "Height")?;

    let ok = ctx
        .bus
        .call_bool("MoveResize", &(id, x, y, width, height))?;
    report(ok, "Window moved and resized", not_found(id))
}

pub fn place(ctx: &mut Ctx, args: &[String]) -> Result<()> {
    let (id, shift) = selector::resolve(ctx, 4, PLACE_USAGE, args)?;
    let rest = &args[shift..];
    if rest.len() != 4 {
        return Err(Fail::error(PLACE_USAGE));
    }

    let window = ctx.window_by_id(id)?;
    let workarea = workarea_for(ctx, &window)?;

    let width = geometry::resolve_place_size(&rest[2], workarea.width, "WIDTH")?;
    let height = geometry::resolve_place_size(&rest[3], workarea.height, "HEIGHT")?;
    let x = geometry::resolve_place_position(&rest[0], Axis::X, workarea.x, workarea.width, width)?;
    let y =
        geometry::resolve_place_position(&rest[1], Axis::Y, workarea.y, workarea.height, height)?;

    let ok = ctx.bus.call_bool(
        "MoveResize",
        &(id, as_i32(x), as_i32(y), as_i32(width), as_i32(height)),
    )?;
    report(ok, "Window placed", not_found(id))
}

pub fn tile(ctx: &mut Ctx, args: &[String]) -> Result<()> {
    let usage = tile_usage();
    let (id, shift) = selector::resolve(ctx, 1, &usage, args)?;
    let position = args[shift].clone();

    let window = ctx.window_by_id(id)?;
    let workarea = workarea_for(ctx, &window)?;
    let cell = geometry::resolve_tile_geometry(&position, workarea)?;

    let ok = ctx.bus.call_bool(
        "MoveResize",
        &(
            id,
            as_i32(cell.x),
            as_i32(cell.y),
            as_i32(cell.width),
            as_i32(cell.height),
        ),
    )?;
    report(ok, &format!("Window tiled to {position}"), not_found(id))
}

pub fn center(ctx: &mut Ctx, args: &[String]) -> Result<()> {
    let usage = "Usage: wctl center <WINDOW> [horizontal|vertical|both]";
    let (id, shift) = selector::resolve(ctx, 0, usage, args)?;
    let axis = args.get(shift).map(String::as_str).unwrap_or("both");

    let (axis, message) = match axis {
        "h" | "horizontal" => ("horizontal", "Window centered horizontally"),
        "v" | "vertical" => ("vertical", "Window centered vertically"),
        "both" | "" => ("both", "Window centered"),
        other => {
            return Err(Fail::error(format!(
                "Invalid axis: {other}. Must be 'horizontal', 'vertical', or 'both'"
            )))
        }
    };

    let window = ctx.window_by_id(id)?;
    let (win_x, win_y, win_w, win_h) = model::frame_rect(&window);
    let workarea = workarea_for(ctx, &window)?;

    // Centring is the workarea-relative "center" token, so it reuses the one
    // implementation of that formula. Size is preserved, so this is a Move.
    let mut x = win_x;
    let mut y = win_y;
    if axis == "horizontal" || axis == "both" {
        x = geometry::resolve_place_position("center", Axis::X, workarea.x, workarea.width, win_w)?;
    }
    if axis == "vertical" || axis == "both" {
        y = geometry::resolve_place_position(
            "center",
            Axis::Y,
            workarea.y,
            workarea.height,
            win_h,
        )?;
    }

    let ok = ctx.bus.call_bool("Move", &(id, as_i32(x), as_i32(y)))?;
    report(ok, message, not_found(id))
}
