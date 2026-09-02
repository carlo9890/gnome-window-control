// SPDX-FileCopyrightText: 2026 hko9890
// SPDX-License-Identifier: MIT
//! wctl - command-line client for the GNOME Window Control shell extension.
//!
//! Argument parsing is hand written. The CLI grammar is not the conventional
//! one an argument-parser library models: the `<WINDOW>` slot is either a
//! positional or an option pair (`-c kitty`) that shifts every later positional,
//! and the help text, usage strings and error wording are a frozen contract
//! that the live suites assert. A generated parser would have to be overridden
//! at each of those points, so there is nothing left for it to do.

mod commands;
mod dbus;
mod fail;
mod geometry;
mod help;
mod model;
mod selector;
mod table;

use commands::{completion, geometry as geom, query, state, wait, wsmon};
use fail::{Fail, Result};
use model::Ctx;

pub const VERSION: &str = env!("CARGO_PKG_VERSION");

/// Every command wctl dispatches, in the order the help text introduces them.
///
/// The help text and both completion scripts are authored by hand, so a unit
/// test cross-checks all three against this list. Adding a command means adding
/// it here.
pub const COMMANDS: [&str; 28] = [
    "list",
    "focused",
    "info",
    "workspaces",
    "monitors",
    "activate",
    "focus",
    "wait",
    "move",
    "resize",
    "move-resize",
    "place",
    "tile",
    "center",
    "workspace",
    "move-to-workspace",
    "move-to-monitor",
    "minimize",
    "unminimize",
    "maximize",
    "unmaximize",
    "fullscreen",
    "unfullscreen",
    "above",
    "sticky",
    "close",
    "help",
    "completion",
];

fn main() {
    let args: Vec<String> = std::env::args().skip(1).collect();
    if let Err(failure) = run(&args) {
        std::process::exit(failure.report());
    }
}

fn run(args: &[String]) -> Result<()> {
    let Some(command) = args.first().map(String::as_str) else {
        print!("{}", help::text());
        return Ok(());
    };
    let rest = &args[1..];

    // Help, version and completion need no bus.
    match command {
        "help" | "--help" | "-h" => {
            print!("{}", help::text());
            return Ok(());
        }
        "version" | "--version" | "-v" => {
            println!("wctl {VERSION}");
            return Ok(());
        }
        "completion" => return completion::completion(rest),
        _ => {}
    }

    let mut ctx = Ctx::new();
    match command {
        "list" => query::list(&mut ctx, rest),
        "focused" => query::focused(&mut ctx, rest),
        "info" => query::info(&mut ctx, rest),
        "workspaces" => query::workspaces(&mut ctx, rest),
        "monitors" => query::monitors(&mut ctx, rest),

        "activate" => state::activate(&mut ctx, rest),
        "focus" => state::focus(&mut ctx, rest),
        "wait" => wait::wait(&mut ctx, rest),

        "move" => geom::move_window(&mut ctx, rest),
        "resize" => geom::resize(&mut ctx, rest),
        "move-resize" => geom::move_resize(&mut ctx, rest),
        "place" => geom::place(&mut ctx, rest),
        "tile" => geom::tile(&mut ctx, rest),
        "center" => geom::center(&mut ctx, rest),

        "workspace" => wsmon::workspace(&mut ctx, rest),
        "move-to-workspace" => wsmon::move_to_workspace(&mut ctx, rest),
        "move-to-monitor" => wsmon::move_to_monitor(&mut ctx, rest),

        "minimize" => state::simple(&mut ctx, "Minimize", "Window minimized", rest),
        "unminimize" => state::simple(&mut ctx, "Unminimize", "Window unminimized", rest),
        "maximize" => state::simple(&mut ctx, "Maximize", "Window maximized", rest),
        "unmaximize" => state::simple(&mut ctx, "Unmaximize", "Window unmaximized", rest),
        "fullscreen" => state::simple(&mut ctx, "Fullscreen", "Window fullscreened", rest),
        "unfullscreen" => state::simple(&mut ctx, "Unfullscreen", "Window unfullscreened", rest),
        "close" => state::simple(&mut ctx, "Close", "Window closed", rest),
        "above" => state::boolean(
            &mut ctx,
            "SetAbove",
            "Window set to always-on-top",
            "Window removed from always-on-top",
            rest,
        ),
        "sticky" => state::boolean(
            &mut ctx,
            "SetSticky",
            "Window set to all workspaces",
            "Window removed from all workspaces",
            rest,
        ),

        other => Err(Fail::error(format!(
            "Unknown command: {other}. Run 'wctl help' for usage."
        ))),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    /// The command inventory is authored in four places: this dispatch, the
    /// help text, and both completion scripts. Adding or renaming a command
    /// must update all of them.
    #[test]
    fn bash_completion_lists_every_command_in_order() {
        let line = completion::BASH
            .lines()
            .find(|line| line.trim_start().starts_with("local commands=\""))
            .expect("bash completion declares a command list");
        let listed = line
            .split_once('"')
            .and_then(|(_, rest)| rest.split_once('"'))
            .map(|(commands, _)| commands)
            .expect("command list is quoted");
        assert_eq!(listed, COMMANDS.join(" "));
    }

    #[test]
    fn zsh_completion_describes_every_command() {
        let script = completion::ZSH;
        for command in COMMANDS {
            assert!(
                script.contains(&format!("'{command}:")),
                "zsh completion is missing {command}"
            );
        }
    }

    #[test]
    fn help_documents_every_command() {
        let help = help::text();
        for command in COMMANDS {
            // help and completion are the meta commands; they appear in the
            // OTHER section and need no synopsis of their own.
            assert!(help.contains(command), "help text is missing {command}");
        }
    }

    #[test]
    fn help_carries_its_sections_and_version() {
        let help = help::text();
        for section in [
            "USAGE:",
            "WINDOW SELECTOR:",
            "LISTING COMMANDS:",
            "ACTIVATION COMMANDS:",
            "INFO COMMANDS:",
            "GEOMETRY COMMANDS:",
            "TILING & POSITIONING:",
            "WORKSPACE & MONITOR COMMANDS:",
            "STATE COMMANDS:",
            "EXAMPLES:",
            "SHELL COMPLETION:",
            "ENVIRONMENT:",
        ] {
            assert!(help.contains(section), "help text is missing {section}");
        }
        assert!(help.starts_with(&format!("wctl {VERSION} - Window Control CLI")));
        assert!(
            !help.contains("{VERSION}"),
            "version placeholder was left in"
        );
    }
}
