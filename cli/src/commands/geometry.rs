// SPDX-FileCopyrightText: 2026 hko9890
// SPDX-License-Identifier: MIT
//! move, resize, move-resize, place, tile, center and resolve-place.
//!
//! The four geometry methods raise a NAMED D-Bus error instead of answering
//! false, so there is no failure to diagnose here any more: `dbus::map_err`
//! turns the name straight into the right message and exit code. What this
//! module used to do -- refetch the window and guess which state was in the way
//! -- is gone, and with it the guess it could never get right for a tiled
//! window.

use std::time::Duration;

use serde_json::Value;

use crate::commands::{primary_monitor, workarea_of};
use crate::fail::{Fail, Result};
use crate::geometry::{self, Axis, Rect, TILE_USAGE};
use crate::model::{self, Ctx};
use crate::selector;

const PLACE_TOKENS: &str = "X:      number or left|center|right
Y:      number or top|center|bottom
WIDTH:  positive number or percentage like 50%
HEIGHT: positive number or percentage like 100%";

fn place_usage() -> String {
    format!(
        "Usage: wctl place <WINDOW> <X> <Y> <WIDTH> <HEIGHT> [--json] [--settled]\n{PLACE_TOKENS}"
    )
}

fn resolve_place_usage() -> String {
    format!(
        "Usage: wctl resolve-place [--monitor <N>] <X> <Y> <WIDTH> <HEIGHT> [--json]\n{PLACE_TOKENS}"
    )
}

fn tile_usage() -> String {
    format!("Usage: wctl tile <WINDOW> <position> [--json] [--settled]\n{TILE_USAGE}")
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

    /// The document a geometry command emits under `--json`, on any outcome.
    fn outcome(
        &self,
        id: u64,
        placed: bool,
        settle: Option<Settle>,
        message: Option<&str>,
    ) -> Value {
        let mut doc = serde_json::json!({
            "window_id": id,
            "monitor_index": self.monitor_index,
            "workarea": rect_json(self.workarea),
            "target": rect_json(self.target),
            "placed": placed,
        });
        // The settle fields appear only with --settled, so a caller can tell
        // "the frame did not settle" from "nobody waited for it to".
        if let Some(settle) = settle {
            match settle {
                Settle::Observed(rect) => {
                    doc["settled"] = Value::Bool(true);
                    doc["observed"] = rect_json(rect);
                }
                Settle::Unsettled => doc["settled"] = Value::Bool(false),
            }
        }
        if let Some(message) = message {
            doc["message"] = Value::String(message.to_string());
        }
        doc
    }
}

/// The outcome of a `--settled` wait.
#[derive(Clone, Copy)]
enum Settle {
    /// The frame stopped changing, and this is where it stopped.
    Observed(Rect),
    /// It was still moving when the wait gave up.
    Unsettled,
}

/// How long a frame must hold still before `--settled` calls it settled.
///
/// Measured, not guessed: across eight fresh kitty launches placed immediately
/// after `wctl wait`, the largest gap between two consecutive frame changes was
/// 16 ms (typically 5-7 ms). A quiet period has to outlast that gap or it would
/// report "settled" mid-move, so this is roughly nine times the worst observed
/// case. The signals do the watching, so a generous value costs only latency on
/// the last placement, not round trips.
const SETTLE_QUIET_MS: i32 = 150;

/// How long `--settled` waits in total before giving up. A client that keeps
/// resizing itself past this is not going to settle.
const SETTLE_TIMEOUT_MS: i32 = 2000;

/// Seconds the client waits beyond the extension's own settle timeout, as a
/// guard against a shell that never replies at all. Same role as `wait`'s.
const SETTLE_GRACE_SECONDS: u64 = 5;

/// Wait for the frame to stop changing, after a placement was applied.
///
/// A failure to SETTLE is not a failure to place: the window did move. So the
/// caller is told both, and the exit code reports the settle timeout.
fn settle(ctx: &mut Ctx, id: u64) -> Result<Rect> {
    let bound =
        Duration::from_millis(SETTLE_TIMEOUT_MS as u64) + Duration::from_secs(SETTLE_GRACE_SECONDS);
    let (x, y, width, height) =
        ctx.bus
            .wait_for_geometry(id, SETTLE_QUIET_MS, SETTLE_TIMEOUT_MS, bound)?;
    Ok(Rect {
        x: x as i64,
        y: y as i64,
        width: width as i64,
        height: height as i64,
    })
}

/// Report a geometry command that resolved a rectangle first.
///
/// Under `--json` stdout carries a document on EVERY outcome, so a caller never
/// has to parse an English sentence off the same stream; the exit code still
/// classifies the failure. Without it, nothing about the existing output moves.
fn report_placement(
    ctx: &mut Ctx,
    id: u64,
    placement: &Placement,
    applied: Result<()>,
    settled: bool,
    success: &str,
    json_output: bool,
) -> Result<()> {
    // The placement itself failed: the extension named the reason, so there is
    // nothing to work out here.
    if let Err(failure) = applied {
        if !json_output {
            return Err(failure);
        }
        let document = placement.outcome(id, false, None, Some(&failure.to_string()));
        return Err(Fail::plain(document.to_string()).with_code(failure.code()));
    }

    if !settled {
        if json_output {
            println!("{}", placement.outcome(id, true, None, None));
        } else {
            println!("{success}");
        }
        return Ok(());
    }

    match settle(ctx, id) {
        Ok(observed) => {
            if json_output {
                println!(
                    "{}",
                    placement.outcome(id, true, Some(Settle::Observed(observed)), None)
                );
            } else {
                println!("{success}");
                println!(
                    "Settled:   {}, {} ({} x {})",
                    observed.x, observed.y, observed.width, observed.height
                );
            }
            Ok(())
        }
        Err(failure) => {
            // The window WAS placed; only the wait failed. Both output modes
            // have to say so, and both keep the reason the wait failed for --
            // which is not always a timeout. An extension too old to serve
            // WaitForGeometry, or a window that closed mid-wait, must not be
            // reported as "the frame is still moving".
            if !json_output {
                println!("{success}");
                return Err(failure);
            }
            let document = placement.outcome(
                id,
                true,
                Some(Settle::Unsettled),
                Some(&failure.to_string()),
            );
            let code = failure.code();
            Err(Fail::plain(document.to_string()).with_code(code))
        }
    }
}

/// Split the flags that may appear anywhere out of an argument list.
///
/// The `<WINDOW>` slot shifts every positional after it, so these have to be
/// removed before the selector resolver runs. `info` set the precedent: a flag
/// is accepted on either side of the selector.
fn take_output_flags(args: &[String]) -> (bool, bool, Vec<String>) {
    let json_output = args.iter().any(|arg| arg == "--json");
    let settled = args.iter().any(|arg| arg == "--settled");
    let rest = args
        .iter()
        .filter(|arg| *arg != "--json" && *arg != "--settled")
        .cloned()
        .collect();
    (json_output, settled, rest)
}

pub fn move_window(ctx: &mut Ctx, args: &[String]) -> Result<()> {
    let (id, shift) = selector::resolve(ctx, 2, "Usage: wctl move <WINDOW> <X> <Y>", args)?;
    let x = coordinate(&args[shift], "X")?;
    let y = coordinate(&args[shift + 1], "Y")?;

    ctx.bus.call_unit("Move", &(id, x, y))?;
    println!("Window moved");
    Ok(())
}

pub fn resize(ctx: &mut Ctx, args: &[String]) -> Result<()> {
    let (id, shift) =
        selector::resolve(ctx, 2, "Usage: wctl resize <WINDOW> <WIDTH> <HEIGHT>", args)?;
    let width = extent(&args[shift], "Width")?;
    let height = extent(&args[shift + 1], "Height")?;

    ctx.bus.call_unit("Resize", &(id, width, height))?;
    println!("Window resized");
    Ok(())
}

pub fn move_resize(ctx: &mut Ctx, args: &[String]) -> Result<()> {
    let usage = "Usage: wctl move-resize <WINDOW> <X> <Y> <WIDTH> <HEIGHT>";
    let (id, shift) = selector::resolve(ctx, 4, usage, args)?;
    let x = coordinate(&args[shift], "X")?;
    let y = coordinate(&args[shift + 1], "Y")?;
    let width = extent(&args[shift + 2], "Width")?;
    let height = extent(&args[shift + 3], "Height")?;

    ctx.bus
        .call_unit("MoveResize", &(id, x, y, width, height))?;
    println!("Window moved and resized");
    Ok(())
}

pub fn place(ctx: &mut Ctx, args: &[String]) -> Result<()> {
    let usage = place_usage();
    let (json_output, settled, args) = take_output_flags(args);
    let (id, shift) = selector::resolve(ctx, 4, &usage, &args)?;
    let rest = &args[shift..];
    if rest.len() != 4 {
        return Err(Fail::error(usage));
    }

    let window = ctx.window_by_id(id)?;
    let monitor_index = model::number(&window, "monitor_index") as i32;
    let workarea = workarea_of(ctx, monitor_index)?;
    let target = geometry::resolve_place_rect([&rest[0], &rest[1], &rest[2], &rest[3]], workarea)?;

    let applied = ctx.bus.call_unit(
        "MoveResize",
        &(
            id,
            as_i32(target.x),
            as_i32(target.y),
            as_i32(target.width),
            as_i32(target.height),
        ),
    );
    let placement = Placement {
        monitor_index,
        workarea,
        target,
    };
    report_placement(
        ctx,
        id,
        &placement,
        applied,
        settled,
        "Window placed",
        json_output,
    )
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
    let (json_output, settled, args) = take_output_flags(args);
    let (id, shift) = selector::resolve(ctx, 1, &usage, &args)?;
    let position = args[shift].clone();

    let window = ctx.window_by_id(id)?;
    let monitor_index = model::number(&window, "monitor_index") as i32;
    let workarea = workarea_of(ctx, monitor_index)?;
    let target = geometry::resolve_tile_geometry(&position, workarea)?;

    let applied = ctx.bus.call_unit(
        "MoveResize",
        &(
            id,
            as_i32(target.x),
            as_i32(target.y),
            as_i32(target.width),
            as_i32(target.height),
        ),
    );
    let placement = Placement {
        monitor_index,
        workarea,
        target,
    };
    report_placement(
        ctx,
        id,
        &placement,
        applied,
        settled,
        &format!("Window tiled to {position}"),
        json_output,
    )
}

pub fn center(ctx: &mut Ctx, args: &[String]) -> Result<()> {
    let usage = "Usage: wctl center <WINDOW> [horizontal|vertical|both] [--json] [--settled]";
    let (json_output, settled, args) = take_output_flags(args);
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

    let applied = ctx.bus.call_unit("Move", &(id, as_i32(x), as_i32(y)));
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
    report_placement(ctx, id, &placement, applied, settled, message, json_output)
}
