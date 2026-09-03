// SPDX-FileCopyrightText: 2026 hko9890
// SPDX-License-Identifier: MIT
//! move, resize, move-resize, place, tile, center and resolve-place.

use serde_json::Value;

use crate::commands::{not_found, primary_monitor, report_with, workarea_of};
use crate::fail::{Fail, Result, EXIT_REFUSED};
use crate::geometry::{self, Axis, Rect, TILE_USAGE};
use crate::model::{self, Ctx};
use crate::selector;

const PLACE_TOKENS: &str = "X:      number or left|center|right
Y:      number or top|center|bottom
WIDTH:  positive number or percentage like 50%
HEIGHT: positive number or percentage like 100%";

fn place_usage() -> String {
    format!("Usage: wctl place <WINDOW> <X> <Y> <WIDTH> <HEIGHT> [--json]\n{PLACE_TOKENS}")
}

fn resolve_place_usage() -> String {
    format!(
        "Usage: wctl resolve-place [--monitor <N>] <X> <Y> <WIDTH> <HEIGHT> [--json]\n{PLACE_TOKENS}"
    )
}

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

fn as_i32(value: i64) -> i32 {
    value.clamp(i32::MIN as i64, i32::MAX as i64) as i32
}

/// Why a geometry call came back `false`.
///
/// The extension answers `false` for a window it cannot find and for one whose
/// frame is pinned by maximize or fullscreen, and "Window not found" is wrong
/// and unactionable in the second case.
///
/// Every state named here is READ, never assumed: the window may also have gone
/// away between the call and now, or the handler may have failed for a reason
/// this client cannot see, and claiming "is maximized" for those would send the
/// caller after a state that is not there. The cache is dropped first because it
/// was filled before the failing call, so it can no longer describe the window.
/// That refetch happens only on the failure path.
fn geometry_failure(ctx: &mut Ctx, id: u64) -> Fail {
    ctx.invalidate_windows();
    let Ok(window) = ctx.window_by_id(id) else {
        return not_found(id);
    };
    let refused = |message: String| Fail::plain(message).with_code(EXIT_REFUSED);
    if model::flag(&window, "is_fullscreen") {
        return refused(format!(
            "Window {id} is fullscreen; run 'wctl unfullscreen {id}' first"
        ));
    }
    if model::flag(&window, "is_maximized") {
        return refused(format!(
            "Window {id} is maximized; run 'wctl unmaximize {id}' first"
        ));
    }
    // Tiled windows report neither flag in ListDetailed (is_maximized is only
    // true for BOTH axes) but are still refused by the extension, and so is a
    // window whose handler threw. Say what is known rather than inventing a
    // state. EXIT_REFUSED is still right for both: the window is there and did
    // not move, which is the distinction the code exists to draw.
    refused(format!(
        "Window {id} could not be moved; it may be tiled or maximized"
    ))
}

fn rect_json(rect: Rect) -> Value {
    serde_json::json!({
        "x": rect.x,
        "y": rect.y,
        "width": rect.width,
        "height": rect.height,
    })
}

/// What a placement resolved to, and the workarea it was resolved against.
///
/// This is what `--json` exists to report. A caller verifying a placement can
/// then COMPARE an observed frame against the rectangle wctl computed, instead
/// of re-deriving the percentage arithmetic itself and silently checking
/// against the wrong rectangle the day a rounding rule changes.
///
/// It is the rectangle wctl REQUESTED. Mutter still clamps to size hints, and a
/// client that quantises its own size (a terminal, to whole cells) settles a
/// few pixels off, so a comparison against it still needs a tolerance.
struct Placement {
    monitor_index: i32,
    workarea: Rect,
    target: Rect,
}

impl Placement {
    fn document(&self) -> Value {
        serde_json::json!({
            "monitor_index": self.monitor_index,
            "workarea": rect_json(self.workarea),
            "target": rect_json(self.target),
        })
    }

    fn print_plain(&self) {
        println!("Monitor:   {}", self.monitor_index);
        println!(
            "Workarea:  {}, {} ({} x {})",
            self.workarea.x, self.workarea.y, self.workarea.width, self.workarea.height
        );
        println!("Position:  {}, {}", self.target.x, self.target.y);
        println!("Size:      {} x {}", self.target.width, self.target.height);
    }

    /// The document a geometry command emits under `--json`, on either outcome.
    fn outcome(&self, id: u64, placed: bool, message: Option<&str>) -> Value {
        let mut doc = serde_json::json!({
            "window_id": id,
            "monitor_index": self.monitor_index,
            "workarea": rect_json(self.workarea),
            "target": rect_json(self.target),
            "placed": placed,
        });
        if let Some(message) = message {
            doc["message"] = Value::String(message.to_string());
        }
        doc
    }
}

/// Report a geometry command that resolved a rectangle first.
///
/// Under `--json` stdout carries a document on BOTH outcomes, so a caller never
/// has to parse an English sentence off the same stream; the exit code still
/// classifies the failure. Without it, nothing about the existing output moves.
fn report_placement(
    ctx: &mut Ctx,
    id: u64,
    placement: &Placement,
    ok: bool,
    success: &str,
    json_output: bool,
) -> Result<()> {
    if !json_output {
        return report_with(ok, success, || geometry_failure(ctx, id));
    }
    if ok {
        println!("{}", placement.outcome(id, true, None));
        return Ok(());
    }
    let failure = geometry_failure(ctx, id);
    let document = placement.outcome(id, false, Some(&failure.to_string()));
    Err(Fail::plain(document.to_string()).with_code(failure.code()))
}

/// Split `--json` out of an argument list.
///
/// The `<WINDOW>` slot shifts every positional after it, so the flag has to be
/// removed before the selector resolver runs. `info` set the precedent: it is
/// accepted on either side of the selector.
fn take_json_flag(args: &[String]) -> (bool, Vec<String>) {
    let json_output = args.iter().any(|arg| arg == "--json");
    let rest = args
        .iter()
        .filter(|arg| *arg != "--json")
        .cloned()
        .collect();
    (json_output, rest)
}

pub fn move_window(ctx: &mut Ctx, args: &[String]) -> Result<()> {
    let (id, shift) = selector::resolve(ctx, 2, "Usage: wctl move <WINDOW> <X> <Y>", args)?;
    let x = coordinate(&args[shift], "X")?;
    let y = coordinate(&args[shift + 1], "Y")?;

    let ok = ctx.bus.call_bool("Move", &(id, x, y))?;
    report_with(ok, "Window moved", || geometry_failure(ctx, id))
}

pub fn resize(ctx: &mut Ctx, args: &[String]) -> Result<()> {
    let (id, shift) =
        selector::resolve(ctx, 2, "Usage: wctl resize <WINDOW> <WIDTH> <HEIGHT>", args)?;
    let width = extent(&args[shift], "Width")?;
    let height = extent(&args[shift + 1], "Height")?;

    let ok = ctx.bus.call_bool("Resize", &(id, width, height))?;
    report_with(ok, "Window resized", || geometry_failure(ctx, id))
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
    report_with(ok, "Window moved and resized", || geometry_failure(ctx, id))
}

pub fn place(ctx: &mut Ctx, args: &[String]) -> Result<()> {
    let usage = place_usage();
    let (json_output, args) = take_json_flag(args);
    let (id, shift) = selector::resolve(ctx, 4, &usage, &args)?;
    let rest = &args[shift..];
    if rest.len() != 4 {
        return Err(Fail::error(usage));
    }

    let window = ctx.window_by_id(id)?;
    let monitor_index = model::number(&window, "monitor_index") as i32;
    let workarea = workarea_of(ctx, monitor_index)?;
    let target = geometry::resolve_place_rect([&rest[0], &rest[1], &rest[2], &rest[3]], workarea)?;

    let ok = ctx.bus.call_bool(
        "MoveResize",
        &(
            id,
            as_i32(target.x),
            as_i32(target.y),
            as_i32(target.width),
            as_i32(target.height),
        ),
    )?;
    let placement = Placement {
        monitor_index,
        workarea,
        target,
    };
    report_placement(ctx, id, &placement, ok, "Window placed", json_output)
}

/// Resolve a placement without applying it, and without a window.
///
/// `place --json` reports what it resolved for a window that already exists.
/// This answers the same question BEFORE there is a window to place -- sizing a
/// terminal at launch so its first mapped frame is already final, say -- which
/// is the other half of the arithmetic a caller would otherwise reimplement.
pub fn resolve_place(ctx: &mut Ctx, args: &[String]) -> Result<()> {
    let mut json_output = false;
    let mut monitor: Option<i32> = None;
    let mut tokens: Vec<&str> = Vec::new();

    let mut index = 0;
    while index < args.len() {
        match args[index].as_str() {
            "--json" => {
                json_output = true;
                index += 1;
            }
            "--monitor" => {
                let Some(value) = args.get(index + 1) else {
                    return Err(Fail::error("Option --monitor requires an argument"));
                };
                if !selector::is_window_id(value) {
                    return Err(Fail::error("Monitor index must be a number"));
                }
                monitor = Some(
                    value
                        .parse::<i32>()
                        .map_err(|_| Fail::error("Monitor index must be a number"))?,
                );
                index += 2;
            }
            // Only long options are options here: X and Y accept a negative
            // pixel coordinate, and `-50` must stay a positional.
            other if other.starts_with("--") => {
                return Err(Fail::error(format!("Unknown option: {other}")))
            }
            other => {
                tokens.push(other);
                index += 1;
            }
        }
    }

    let [x, y, width, height] = tokens[..] else {
        return Err(Fail::error(resolve_place_usage()));
    };

    let monitor_index = match monitor {
        Some(index) => index,
        None => primary_monitor(ctx)?,
    };
    let workarea = workarea_of(ctx, monitor_index)?;
    let placement = Placement {
        monitor_index,
        workarea,
        target: geometry::resolve_place_rect([x, y, width, height], workarea)?,
    };

    if json_output {
        println!("{}", placement.document());
    } else {
        placement.print_plain();
    }
    Ok(())
}

pub fn tile(ctx: &mut Ctx, args: &[String]) -> Result<()> {
    let usage = tile_usage();
    let (json_output, args) = take_json_flag(args);
    let (id, shift) = selector::resolve(ctx, 1, &usage, &args)?;
    let position = args[shift].clone();

    let window = ctx.window_by_id(id)?;
    let monitor_index = model::number(&window, "monitor_index") as i32;
    let workarea = workarea_of(ctx, monitor_index)?;
    let target = geometry::resolve_tile_geometry(&position, workarea)?;

    let ok = ctx.bus.call_bool(
        "MoveResize",
        &(
            id,
            as_i32(target.x),
            as_i32(target.y),
            as_i32(target.width),
            as_i32(target.height),
        ),
    )?;
    let placement = Placement {
        monitor_index,
        workarea,
        target,
    };
    report_placement(
        ctx,
        id,
        &placement,
        ok,
        &format!("Window tiled to {position}"),
        json_output,
    )
}

pub fn center(ctx: &mut Ctx, args: &[String]) -> Result<()> {
    let usage = "Usage: wctl center <WINDOW> [horizontal|vertical|both] [--json]";
    let (json_output, args) = take_json_flag(args);
    let (id, shift) = selector::resolve(ctx, 0, usage, &args)?;
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
    let monitor_index = model::number(&window, "monitor_index") as i32;
    let workarea = workarea_of(ctx, monitor_index)?;

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
    let placement = Placement {
        monitor_index,
        workarea,
        // A centre is a move, so the size is the window's own, unchanged.
        target: Rect {
            x,
            y,
            width: win_w,
            height: win_h,
        },
    };
    report_placement(ctx, id, &placement, ok, message, json_output)
}
