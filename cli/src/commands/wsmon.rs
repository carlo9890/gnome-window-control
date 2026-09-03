// SPDX-FileCopyrightText: 2026 hko9890
// SPDX-License-Identifier: MIT
//! Switching workspaces and moving a window between workspaces or monitors.

use crate::commands::{report, report_with};
use crate::fail::{Fail, Result};
use crate::model::{self, Ctx};
use crate::selector;

fn index_of(token: &str, label: &str) -> Result<i32> {
    if !selector::is_window_id(token) {
        return Err(Fail::error(format!("{label} index must be a number")));
    }
    token
        .parse::<i32>()
        .map_err(|_| Fail::error(format!("{label} index must be a number")))
}

pub fn workspace(ctx: &mut Ctx, args: &[String]) -> Result<()> {
    let Some(token) = args.first() else {
        return Err(Fail::error("Usage: wctl workspace <N>"));
    };
    let index = index_of(token, "Workspace")?;

    let ok = ctx.bus.call_bool("ActivateWorkspace", &(index,))?;
    report(
        ok,
        &format!("Switched to workspace {index}"),
        format!("Cannot switch to workspace {index} (does it exist? see wctl workspaces)"),
    )
}

pub fn move_to_workspace(ctx: &mut Ctx, args: &[String]) -> Result<()> {
    let usage = "Usage: wctl move-to-workspace <WINDOW> <N>";
    let (id, shift) = selector::resolve(ctx, 1, usage, args)?;
    let index = index_of(&args[shift], "Workspace")?;

    let ok = ctx.bus.call_bool("MoveToWorkspace", &(id, index))?;
    report_with(ok, &format!("Window moved to workspace {index}"), || {
        workspace_move_failure(ctx, id, index)
    })
}

/// Why MoveToWorkspace came back `false`.
///
/// The extension refuses when the window is gone, when the index is out of
/// range, and -- since it now reads the move back -- when mutter declined it.
/// The common cause of that last one is a window mutter holds on all
/// workspaces, which with the GNOME default workspaces-only-on-primary is every
/// window on a secondary monitor. Saying "not found or does not exist" for that
/// sends the reader after two things that are both fine. Read the state.
fn workspace_move_failure(ctx: &mut Ctx, id: u64, index: i32) -> String {
    if !workspace_exists(ctx, index) {
        return format!("Window {id} not found or workspace {index} does not exist");
    }
    ctx.invalidate_windows();
    let Ok(window) = ctx.window_by_id(id) else {
        return format!("Window not found: {id}");
    };
    if model::flag(&window, "is_on_all_workspaces") {
        return format!(
            "Window {id} is on all workspaces, so it cannot be moved to workspace {index}. \
             Mutter holds a window there when it is on a secondary monitor and \
             workspaces-only-on-primary is set, which is the GNOME default."
        );
    }
    format!("Window {id} could not be moved to workspace {index}")
}

/// Is `index` a workspace that exists? Unreadable state counts as "exists", so
/// a failure to look it up never invents an out-of-range diagnosis.
fn workspace_exists(ctx: &mut Ctx, index: i32) -> bool {
    let Ok(json) = ctx.bus.call_json("ListWorkspaces") else {
        return true;
    };
    let Ok(list) = model::parse_array(&json, "workspace list") else {
        return true;
    };
    index >= 0 && (index as usize) < list.len()
}

pub fn move_to_monitor(ctx: &mut Ctx, args: &[String]) -> Result<()> {
    let usage = "Usage: wctl move-to-monitor <WINDOW> <N>";
    let (id, shift) = selector::resolve(ctx, 1, usage, args)?;
    let index = index_of(&args[shift], "Monitor")?;

    let ok = ctx.bus.call_bool("MoveToMonitor", &(id, index))?;
    report(
        ok,
        &format!("Window moved to monitor {index}"),
        format!("Window {id} not found or monitor {index} does not exist"),
    )
}
