// SPDX-FileCopyrightText: 2026 hko9890
// SPDX-License-Identifier: MIT
//! `wctl rules` -- the auto-placement rules file the extension reads.
//!
//! None of these subcommands opens the bus. The file is local, the grammar is
//! local (`crate::rules`), and the extension picks a change up on its own
//! through the file monitor described in docs/specs/RULES-JSON.md. `rules test`
//! is the one exception and is added separately.
//!
//! `rules` is a single entry in `COMMANDS`, with the subcommand parsed here, so
//! the flat dispatch inventory in main.rs stays flat and the cross-checks
//! against the help text and both completion scripts keep working unchanged.

use std::path::{Path, PathBuf};

use serde_json::Value;

use crate::fail::{Fail, Result};
use crate::rules;

const USAGE: &str = "Usage: wctl rules <check|list|path|add|remove> [OPTIONS]";

/// The rules file the extension reads.
///
/// `$XDG_CONFIG_HOME/gnome-window-control/rules.json`, falling back to
/// `~/.config` when that is unset or empty -- the same rule
/// `GLib.get_user_config_dir()` applies inside the extension, so both name the
/// same file for the same user.
pub fn default_path() -> Result<PathBuf> {
    let base = match std::env::var("XDG_CONFIG_HOME") {
        Ok(value) if !value.is_empty() => PathBuf::from(value),
        _ => {
            let home = std::env::var("HOME")
                .map_err(|_| Fail::error("Neither XDG_CONFIG_HOME nor HOME is set"))?;
            PathBuf::from(home).join(".config")
        }
    };
    Ok(base.join("gnome-window-control").join("rules.json"))
}

/// Take `--file PATH` out of the argument list, leaving the rest.
fn take_file_option(args: &[String]) -> Result<(Option<PathBuf>, Vec<String>)> {
    let mut path = None;
    let mut rest = Vec::with_capacity(args.len());
    let mut index = 0;
    while index < args.len() {
        if args[index] == "--file" {
            let Some(value) = args.get(index + 1) else {
                return Err(Fail::error("Option --file requires a value"));
            };
            path = Some(PathBuf::from(value));
            index += 2;
        } else {
            rest.push(args[index].clone());
            index += 1;
        }
    }
    Ok((path, rest))
}

/// What reading the rules file produced.
enum Loaded {
    /// The file does not exist. Not an error: an absent file means no rules.
    Absent,
    Present {
        text: String,
    },
}

fn read_file(path: &Path) -> Result<Loaded> {
    match std::fs::read_to_string(path) {
        Ok(text) => Ok(Loaded::Present { text }),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(Loaded::Absent),
        Err(e) => Err(Fail::error(format!("Cannot read {}: {e}", path.display()))),
    }
}

/// Parse the file text, reporting a syntax error the way the extension's load
/// failure reads: the file is refused whole.
fn parse(text: &str, path: &Path) -> Result<Value> {
    serde_json::from_str(text)
        .map_err(|e| Fail::error(format!("{}: not valid JSON: {e}", path.display())))
}

/// `wctl rules check [--file PATH] [--json]`
///
/// The verdict and the message text are the extension's own, from
/// `crate::rules`, so a file this accepts is a file the shell will load and a
/// message printed here is the message the journal would carry.
fn check(args: &[String]) -> Result<()> {
    let (file, rest) = take_file_option(args)?;
    let json = super::parse_json_flag(&rest)?;
    let path = match file {
        Some(path) => path,
        None => default_path()?,
    };

    let text = match read_file(&path)? {
        Loaded::Absent => {
            if json {
                println!(
                    "{}",
                    serde_json::json!({
                        "path": path.display().to_string(),
                        "exists": false,
                        "valid": true,
                        "rules": 0,
                    })
                );
            } else {
                println!("No rules file at {}; no rules are loaded", path.display());
            }
            return Ok(());
        }
        Loaded::Present { text } => text,
    };

    let report_invalid = |message: String| -> Fail {
        if json {
            Fail::plain(
                serde_json::json!({
                    "path": path.display().to_string(),
                    "exists": true,
                    "valid": false,
                    "error": message,
                })
                .to_string(),
            )
        } else {
            Fail::error(message)
        }
    };

    let document = match parse(&text, &path) {
        Ok(document) => document,
        Err(failure) => return Err(report_invalid(failure.to_string())),
    };

    match rules::compile_rules(&document) {
        Err(message) => Err(report_invalid(message)),
        Ok(compiled) => {
            if json {
                println!(
                    "{}",
                    serde_json::json!({
                        "path": path.display().to_string(),
                        "exists": true,
                        "valid": true,
                        "rules": compiled.len(),
                    })
                );
            } else {
                let plural = if compiled.len() == 1 { "" } else { "s" };
                println!("{}: {} rule{plural}, valid", path.display(), compiled.len());
            }
            Ok(())
        }
    }
}

/// Dispatch the subcommand. Unknown ones are a usage error, and no subcommand
/// prints the usage line rather than defaulting to one of them.
pub fn rules(args: &[String]) -> Result<()> {
    let Some(subcommand) = args.first().map(String::as_str) else {
        return Err(Fail::error(USAGE));
    };
    let rest = &args[1..];
    match subcommand {
        "check" => check(rest),
        other => Err(Fail::error(format!(
            "Unknown rules subcommand: {other}. {USAGE}"
        ))),
    }
}
