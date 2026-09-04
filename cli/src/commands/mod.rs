// SPDX-FileCopyrightText: 2026 hko9890
// SPDX-License-Identifier: MIT
//! The commands, grouped the way `wctl help` groups them.

pub mod completion;
pub mod geometry;
pub mod query;
pub mod state;
pub mod wait;
pub mod wsmon;

use serde_json::Value;

use crate::fail::{Fail, Result, EXIT_NOT_FOUND};
use crate::geometry::Rect;
use crate::model::{self, Ctx};

/// Report the result of a boolean D-Bus action.
///
/// The extension answers `false` for a window it cannot find, so the failure
/// message goes to stdout -- the shape the bash client's `report_result` had,
/// and the shape the suites assert. The caller supplies the `Fail`, because it
/// is the caller that knows which `EXIT_*` code the refusal deserves.
pub fn report(ok: bool, success: &str, failure: Fail) -> Result<()> {
    if ok {
        println!("{success}");
        Ok(())
    } else {
        Err(failure)
    }
}

/// `report` for a failure that costs something to build.
///
/// The geometry commands have to ask the extension why it refused, so the
/// message must not be built on the success path.
pub fn report_with(ok: bool, success: &str, failure: impl FnOnce() -> Fail) -> Result<()> {
    if ok {
        println!("{success}");
        Ok(())
    } else {
        Err(failure())
    }
}

/// Parse a workspace or monitor index: a non-negative integer an i32 can
/// hold. `label` is "Workspace" or "Monitor" and names the index in the
/// message the suites pin.
pub fn index(token: &str, label: &str) -> Result<i32> {
    if !crate::selector::is_window_id(token) {
        return Err(Fail::error(format!("{label} index must be a number")));
    }
    token
        .parse::<i32>()
        .map_err(|_| Fail::error(format!("{label} index must be a number")))
}

pub fn monitor_index(token: &str) -> Result<i32> {
    index(token, "Monitor")
}

/// Split one flag that may appear anywhere out of an argument list.
///
/// The `<WINDOW>` slot shifts every positional after it, so a flag has to be
/// removed before the selector is parsed, and `info` set the precedent that
/// it is accepted on either side of the selector. The VALUE of a match option
/// is skipped: a window whose title is literally `--json` is still
/// addressable with `-t --json`.
pub fn take_flag(args: &[String], flag: &str) -> (bool, Vec<String>) {
    let mut found = false;
    let mut rest = Vec::with_capacity(args.len());
    let mut index = 0;
    while index < args.len() {
        let arg = &args[index];
        if matches!(arg.as_str(), "-c" | "-t" | "-s" | "-p") {
            rest.push(arg.clone());
            if let Some(value) = args.get(index + 1) {
                rest.push(value.clone());
            }
            index += 2;
        } else if arg == flag {
            found = true;
            index += 1;
        } else {
            rest.push(arg.clone());
            index += 1;
        }
    }
    (found, rest)
}

/// Index of the primary monitor.
///
/// `place` and `tile` resolve against the monitor their window is on. The
/// commands that take no window default to the PRIMARY monitor rather than
/// monitor 0, which is not necessarily the same one.
pub fn primary_monitor(ctx: &mut Ctx) -> Result<i32> {
    let json = ctx.bus.call_json("ListMonitors")?;
    let monitors = model::parse_array(&json, "monitor list")?;
    monitors
        .iter()
        .find(|monitor| model::flag(monitor, "is_primary"))
        .map(|monitor| model::number(monitor, "index") as i32)
        .ok_or_else(|| {
            Fail::error("No primary monitor reported; name a monitor index (see wctl monitors)")
        })
}

/// The workarea of one monitor.
///
/// `GetWorkarea` answers (-1, -1, -1, -1) for an index that does not exist.
/// Passed through, that sentinel is a negative rectangle every caller would
/// have to recognise for itself, and the arithmetic built on it produces
/// nonsense rather than an error. Reported as EXIT_NOT_FOUND it is also
/// distinguishable from a call that failed, which is what a script probing
/// "is there a second monitor?" needs.
pub fn workarea_of(ctx: &mut Ctx, index: i32) -> Result<Rect> {
    let rect = ctx.bus.get_workarea(index)?;
    if rect.2 < 0 || rect.3 < 0 {
        return Err(Fail::error(format!("No such monitor: {index}")).with_code(EXIT_NOT_FOUND));
    }
    Ok(Rect::from(rect))
}

pub fn not_found(id: u64) -> Fail {
    Fail::plain(format!("Window not found: {id}")).with_code(EXIT_NOT_FOUND)
}

/// Parse the lone optional `--json` flag shared by several commands.
pub fn parse_json_flag(args: &[String]) -> Result<bool> {
    let mut json = false;
    for arg in args {
        match arg.as_str() {
            "--json" => json = true,
            other if other.starts_with('-') => {
                return Err(Fail::error(format!("Unknown option: {other}")))
            }
            other => return Err(Fail::error(format!("Unexpected argument: {other}"))),
        }
    }
    Ok(json)
}

/// Render a JSON scalar the way `jq -r` renders it, for table cells.
pub fn cell(value: Option<&Value>) -> String {
    match value {
        Some(Value::String(text)) => text.clone(),
        Some(Value::Null) | None => "null".to_string(),
        Some(other) => other.to_string(),
    }
}
