// SPDX-FileCopyrightText: 2026 hko9890
// SPDX-License-Identifier: MIT
//! Switching workspaces and moving a window between workspaces or monitors.

use crate::commands::report;
use crate::fail::{Fail, Result};
use crate::model::Ctx;
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
    report(
        ok,
        &format!("Window moved to workspace {index}"),
        format!("Window {id} not found or workspace {index} does not exist"),
    )
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
