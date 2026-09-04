// SPDX-FileCopyrightText: 2026 hko9890
// SPDX-License-Identifier: MIT
//! Activation, focus and the window-state commands.

use crate::commands::{not_found, report, report_with};
use crate::fail::{Fail, Result, EXIT_NOT_FOUND, EXIT_REFUSED};
use crate::model::{self, Ctx};
use crate::selector;

const ACTIVATE_USAGE: &str = "Usage: wctl activate <ID> or wctl activate -t|-s|-c|-p <value>";

/// `activate` keeps the extension's first-match rule, so it has its own parser
/// instead of going through the unique-match selector resolver. A later option
/// overrides an earlier one, as it did in the bash client.
pub fn activate(ctx: &mut Ctx, args: &[String]) -> Result<()> {
    let mut mode = "id";
    let mut value = String::new();

    let mut index = 0;
    while index < args.len() {
        let arg = args[index].as_str();
        let (next_mode, needs_value, what) = match arg {
            "-t" => ("title", true, "a title"),
            "-s" => ("substring", true, "a substring"),
            "-c" => ("class", true, "a WM class"),
            "-p" => ("pid", true, "a PID"),
            other if other.starts_with('-') => {
                return Err(Fail::error(format!("Unknown option: {other}")))
            }
            _ => ("id", false, ""),
        };

        if needs_value {
            let Some(argument) = args.get(index + 1) else {
                return Err(Fail::error(format!(
                    "Option {arg} requires {what} argument"
                )));
            };
            mode = next_mode;
            value = argument.clone();
            index += 2;
        } else {
            mode = next_mode;
            value = arg.to_string();
            index += 1;
        }
    }

    if value.is_empty() {
        return Err(Fail::error(ACTIVATE_USAGE));
    }

    let ok = match mode {
        "id" => {
            let id = selector::validate_id(&value)?;
            ctx.bus.call_bool("Activate", &(id,))?
        }
        "title" => ctx.bus.call_bool("ActivateByTitle", &(value.clone(),))?,
        "substring" => ctx
            .bus
            .call_bool("ActivateByTitleSubstring", &(value.clone(),))?,
        "class" => ctx.bus.call_bool("ActivateByWmClass", &(value.clone(),))?,
        _ => {
            let pid = selector::validate_pid(&value)?;
            ctx.bus.call_bool("ActivateByPid", &(pid,))?
        }
    };

    report(
        ok,
        "Window activated",
        Fail::plain(format!("Window not found: {value}")).with_code(EXIT_NOT_FOUND),
    )
}

pub fn focus(ctx: &mut Ctx, args: &[String]) -> Result<()> {
    let selector = selector::parse_exact(0, "Usage: wctl focus <WINDOW>", args)?;
    let id = selector::lookup(ctx, &selector)?;
    let ok = ctx.bus.call_bool("Focus", &(id,))?;
    report(ok, "Window focused", not_found(id))
}

/// The state commands that take nothing but a window.
pub fn simple(ctx: &mut Ctx, method: &str, success: &str, args: &[String]) -> Result<()> {
    let usage = format!("Usage: wctl {} <WINDOW>", method.to_lowercase());
    let selector = selector::parse_exact(0, &usage, args)?;
    let id = selector::lookup(ctx, &selector)?;
    let ok = ctx.bus.call_bool(method, &(id,))?;
    report(ok, success, not_found(id))
}

/// `above` and `sticky`: a window plus an on/off state.
pub fn boolean(
    ctx: &mut Ctx,
    method: &str,
    on_message: &str,
    off_message: &str,
    args: &[String],
) -> Result<()> {
    let name = method.trim_start_matches("Set").to_lowercase();
    let usage = format!("Usage: wctl {name} <WINDOW> on|off");
    let selector = selector::parse_exact(1, &usage, args)?;

    let state = match args[selector.shift].as_str() {
        "on" | "true" | "1" => true,
        "off" | "false" | "0" => false,
        _ => return Err(Fail::error("State must be 'on' or 'off'")),
    };
    let id = selector::lookup(ctx, &selector)?;

    let ok = ctx.bus.call_bool(method, &(id, state))?;
    let message = if state { on_message } else { off_message };
    report_with(ok, message, || {
        if method == "SetSticky" {
            sticky_failure(ctx, id, state)
        } else {
            not_found(id)
        }
    })
}

/// Why SetSticky came back `false`.
///
/// The extension reads the state back, because mutter's unstick() is a no-op
/// for a window it holds on all workspaces for its own reason: with the GNOME
/// default workspaces-only-on-primary, every window on a secondary monitor.
/// "Window not found" for that would send the reader after a window that is
/// right there, so the state is read to tell the two apart.
fn sticky_failure(ctx: &mut Ctx, id: u64, state: bool) -> Fail {
    ctx.invalidate_windows();
    let window = match ctx.window_by_id(id) {
        Ok(window) => window,
        Err(failure) => return failure,
    };
    if !state && model::flag(&window, "is_on_all_workspaces") {
        return Fail::plain(format!(
            "Window {id} is held on all workspaces by mutter, so sticky cannot be turned off. \
             That is every window on a secondary monitor while \
             workspaces-only-on-primary is set, which is the GNOME default."
        ))
        .with_code(EXIT_REFUSED);
    }
    let wanted = if state { "on" } else { "off" };
    Fail::plain(format!("Window {id} could not be set sticky {wanted}")).with_code(EXIT_REFUSED)
}
