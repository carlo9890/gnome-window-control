// SPDX-FileCopyrightText: 2026 hko9890
// SPDX-License-Identifier: MIT
//! Switching workspaces and moving a window between workspaces or monitors.

use crate::commands::{index, report, report_with};
use crate::fail::{Fail, Result, EXIT_NOT_FOUND, EXIT_REFUSED};
use crate::model::{self, Ctx};
use crate::selector;

pub fn workspace(ctx: &mut Ctx, args: &[String]) -> Result<()> {
    let [token] = args else {
        return Err(Fail::error("Usage: wctl workspace <N>"));
    };
    let index = index(token, "Workspace")?;

    let ok = ctx.bus.call_bool("ActivateWorkspace", &(index,))?;
    report_with(ok, &format!("Switched to workspace {index}"), || {
        workspace_switch_failure(ctx, index)
    })
}

/// Why ActivateWorkspace came back `false`.
///
/// The extension answers false for an index that does not exist AND for a
/// switch it issued that did not take effect (it reads the active index
/// back). Only the first is "not found"; the second is a refusal, and a script
/// branching on the exit code must not be sent to look for a workspace that
/// `wctl workspaces` will show it.
fn workspace_switch_failure(ctx: &mut Ctx, index: i32) -> Fail {
    if !workspace_exists(ctx, index) {
        return Fail::plain(format!(
            "Cannot switch to workspace {index} (does it exist? see wctl workspaces)"
        ))
        .with_code(EXIT_NOT_FOUND);
    }
    Fail::plain(format!(
        "Cannot switch to workspace {index}: the switch did not take effect"
    ))
    .with_code(EXIT_REFUSED)
}

pub fn move_to_workspace(ctx: &mut Ctx, args: &[String]) -> Result<()> {
    let usage = "Usage: wctl move-to-workspace <WINDOW> <N>";
    let selector = selector::parse_exact(1, usage, args)?;
    let index = index(&args[selector.shift], "Workspace")?;
    let id = selector::lookup(ctx, &selector)?;

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
fn workspace_move_failure(ctx: &mut Ctx, id: u64, index: i32) -> Fail {
    if !workspace_exists(ctx, index) {
        return Fail::plain(format!(
            "Window {id} not found or workspace {index} does not exist"
        ))
        .with_code(EXIT_NOT_FOUND);
    }
    ctx.invalidate_windows();
    // A missing window is already the not-found Fail; anything else (a
    // timeout, a disabled extension) is reported as what it is rather than
    // being folded into "not found".
    let window = match ctx.window_by_id(id) {
        Ok(window) => window,
        Err(failure) => return failure,
    };
    if model::flag(&window, "is_on_all_workspaces") {
        return Fail::plain(format!(
            "Window {id} is on all workspaces, so it cannot be moved to workspace {index}. \
             Mutter holds a window there when it is on a secondary monitor and \
             workspaces-only-on-primary is set, which is the GNOME default."
        ))
        .with_code(EXIT_REFUSED);
    }
    Fail::plain(format!(
        "Window {id} could not be moved to workspace {index}"
    ))
    .with_code(EXIT_REFUSED)
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
    let selector = selector::parse_exact(1, usage, args)?;
    let index = index(&args[selector.shift], "Monitor")?;
    let id = selector::lookup(ctx, &selector)?;

    let ok = ctx.bus.call_bool("MoveToMonitor", &(id, index))?;
    report(
        ok,
        &format!("Window moved to monitor {index}"),
        Fail::plain(format!(
            "Window {id} not found or monitor {index} does not exist"
        ))
        .with_code(EXIT_NOT_FOUND),
    )
}
