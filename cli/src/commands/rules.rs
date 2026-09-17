// SPDX-FileCopyrightText: 2026 hko9890
// SPDX-License-Identifier: MIT
//! `wctl rules` -- the auto-placement rules file the extension reads.
//!
//! The file is local and so is the grammar (`crate::rules`), and the extension
//! picks a change up on its own through the file monitor described in
//! docs/specs/RULES-JSON.md. `check`, `list` and `path` never open the bus.
//! `add` and `remove` open it only after the default file is written, to warn
//! that the loaded extension does not report the `rules` capability. `test`
//! opens it to resolve a live window, and refuses an extension without that
//! capability.
//!
//! `rules` is a single entry in `COMMANDS`, with the subcommand parsed here, so
//! the flat dispatch inventory in main.rs stays flat and the cross-checks
//! against the help text and both completion scripts keep working unchanged.

use std::path::{Path, PathBuf};

use serde_json::{Map, Value};

use crate::fail::{Fail, Result};
use crate::geometry::Rect;
use crate::model::{self, Ctx};
use crate::rules;

/// The capability an extension reports when it applies rules.json.
pub const RULES_CAPABILITY: &str = "rules";

/// How long the warning check waits for the shell.
///
/// The file is already written when it runs, so a shell that does not answer
/// must cost a moment and no more: `rules add` runs from keybindings, and the
/// 25 s a real call is entitled to would read as a hang.
const CAPABILITY_PROBE: std::time::Duration = std::time::Duration::from_secs(1);

const NO_RULES_SUPPORT: &str =
    "The extension GNOME Shell has loaded does not apply rules. Check with \
     'wctl version --json', install a newer extension, then restart the shell \
     (log out and back in on Wayland).";

/// Warn, without failing, that the file will not be applied yet.
///
/// The file is valid either way and takes effect once the extension is updated,
/// so writing it is not refused. Only a shell that answers and does not report
/// the capability warns: no shell at all is silent, because editing rules
/// before a session exists is legitimate.
fn warn_if_rules_unsupported(ctx: &Ctx) {
    if ctx
        .bus
        .reports_capability(RULES_CAPABILITY, CAPABILITY_PROBE)
        == Some(false)
    {
        eprintln!("Warning: {NO_RULES_SUPPORT}");
    }
}

const USAGE: &str = "Usage: wctl rules <check|list|path|add|remove|test> [OPTIONS]";

const ADD_USAGE: &str =
    "Usage: wctl rules add <-c CLASS|-t TITLE|-s SUBSTR> <tile POSITION|place X Y W H|center [AXIS]> \
[--workspace N] [--monitor N] [--at N] [--dry-run]";

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

/// Read the file and validate it, for the subcommands that need the rules
/// themselves rather than a verdict.
///
/// An absent file is `(Vec::new(), Vec::new())`, not an error. A file that does
/// not parse or does not validate IS an error: `add` and `remove` rewrite the
/// whole document, so acting on a file we could not read correctly would
/// discard whatever the user actually wrote.
fn load(path: &Path) -> Result<(Vec<Value>, Vec<rules::Rule>)> {
    let Loaded::Present { text } = read_file(path)? else {
        return Ok((Vec::new(), Vec::new()));
    };
    let document = parse(&text, path)?;
    let compiled = rules::compile_rules(&document).map_err(Fail::error)?;
    let raw = document
        .as_array()
        .expect("compile_rules refuses a non-array")
        .clone();
    Ok((raw, compiled))
}

/// Write the document, atomically.
///
/// Serialise to a temp file in the SAME directory and rename over the target.
/// A rename within a directory is atomic, so a reader never sees a half-written
/// file -- and the extension watches the directory rather than the file for
/// exactly this pattern (see docs/specs/RULES-JSON.md), so the reload fires.
fn write_atomically(path: &Path, document: &[Value]) -> Result<()> {
    let text = format!(
        "{}\n",
        serde_json::to_string_pretty(document).map_err(|e| Fail::error(e.to_string()))?
    );
    let directory = path.parent().unwrap_or(Path::new("."));
    std::fs::create_dir_all(directory)
        .map_err(|e| Fail::error(format!("Cannot create {}: {e}", directory.display())))?;

    let temporary = directory.join(format!(".rules.json.{}", std::process::id()));
    std::fs::write(&temporary, &text)
        .map_err(|e| Fail::error(format!("Cannot write {}: {e}", temporary.display())))?;
    std::fs::rename(&temporary, path).map_err(|e| {
        let _ = std::fs::remove_file(&temporary);
        Fail::error(format!("Cannot replace {}: {e}", path.display()))
    })
}

/// How a rule reads in the `list` table.
fn describe_match(rule: &rules::Rule) -> String {
    rule.matches
        .iter()
        .map(|m| format!("{}={}", m.key, m.value))
        .collect::<Vec<_>>()
        .join(" ")
}

fn describe_action(rule: &rules::Rule) -> String {
    match &rule.action {
        Some(rules::Action::Tile(position)) => format!("tile {position}"),
        Some(rules::Action::Center(axis)) => format!("center {axis}"),
        Some(rules::Action::Place(tokens)) => format!("place {}", tokens.join(" ")),
        None => String::new(),
    }
}

/// `wctl rules list [--file PATH] [--json]`
fn list(args: &[String]) -> Result<()> {
    let (file, rest) = take_file_option(args)?;
    let json = super::parse_json_flag(&rest)?;
    let path = match file {
        Some(path) => path,
        None => default_path()?,
    };
    let (raw, compiled) = load(&path)?;

    if json {
        // The file unchanged, the way `list --json` and `info --json` emit the
        // extension's document unchanged.
        println!(
            "{}",
            serde_json::to_string_pretty(&raw).map_err(|e| Fail::error(e.to_string()))?
        );
        return Ok(());
    }

    // No file and no rules print nothing at all: a `wctl rules list | wc -l`
    // should say 0, not 1 for a header over an empty table.
    if compiled.is_empty() {
        return Ok(());
    }

    let mut rows = vec![vec![
        "INDEX".to_string(),
        "MATCH".to_string(),
        "ACTION".to_string(),
        "WORKSPACE".to_string(),
        "MONITOR".to_string(),
    ]];
    for (index, rule) in compiled.iter().enumerate() {
        rows.push(vec![
            index.to_string(),
            describe_match(rule),
            describe_action(rule),
            rule.workspace.map(|n| n.to_string()).unwrap_or_default(),
            rule.monitor.map(|n| n.to_string()).unwrap_or_default(),
        ]);
    }
    super::print_table(&rows);
    Ok(())
}

/// `wctl rules path [--file PATH]`
fn path_command(args: &[String]) -> Result<()> {
    let (file, rest) = take_file_option(args)?;
    if let Some(unexpected) = rest.first() {
        return Err(Fail::error(format!("Unexpected argument: {unexpected}")));
    }
    let path = match file {
        Some(path) => path,
        None => default_path()?,
    };
    println!("{}", path.display());
    Ok(())
}

/// Parse the match selector of `rules add`.
///
/// Only the three selectors a STATIC file can carry. A numeric ID, `focused`
/// and `-p` all name a window that exists right now, which is exactly what a
/// rule cannot do: it is evaluated against windows that do not exist yet.
fn parse_rule_match(args: &[String]) -> Result<(Map<String, Value>, usize)> {
    let refused = |named: &str| {
        Fail::error(format!(
            "{named} names a window that already exists; a rule matches windows \
             that do not exist yet. Use -c <CLASS>, -t <TITLE> or -s <SUBSTR>."
        ))
    };

    let first = args.first().map(String::as_str).unwrap_or("");
    let key = match first {
        "-c" => "class",
        "-t" => "title",
        "-s" => "substr",
        "-p" => return Err(refused("-p <PID>")),
        "focused" => return Err(refused("focused")),
        "" => return Err(Fail::error(ADD_USAGE)),
        other if crate::selector::is_window_id(other) => return Err(refused("A window ID")),
        other => return Err(Fail::error(format!("Unknown selector option: {other}"))),
    };
    let Some(value) = args.get(1) else {
        return Err(Fail::error(format!("Option {first} requires an argument")));
    };
    if value.is_empty() {
        return Err(Fail::error(format!(
            "{first} requires a value; an empty one would match every window"
        )));
    }

    let mut block = Map::new();
    block.insert(key.to_string(), Value::String(value.clone()));
    Ok((block, 2))
}

/// Parse the action of `rules add`, validating through the same grammar the
/// rule will be validated by.
fn parse_rule_action(args: &[String]) -> Result<(String, Value)> {
    let Some(kind) = args.first().map(String::as_str) else {
        return Err(Fail::error(ADD_USAGE));
    };
    let rest = &args[1..];
    match kind {
        "tile" => {
            let [position] = rest else {
                return Err(Fail::error("Usage: wctl rules add <MATCH> tile <POSITION>"));
            };
            // The command's own grammar, so a rule cannot accept a position
            // `wctl tile` would refuse.
            crate::geometry::tile_cells(position)?;
            Ok(("tile".to_string(), Value::String(position.clone())))
        }
        "center" => {
            let axis = match rest {
                [] => "both",
                [axis] => match axis.as_str() {
                    "h" | "horizontal" => "horizontal",
                    "v" | "vertical" => "vertical",
                    "both" => "both",
                    other => {
                        return Err(Fail::error(format!(
                            "Invalid axis: {other}. Must be 'horizontal', 'vertical', or 'both'"
                        )))
                    }
                },
                _ => {
                    return Err(Fail::error(
                        "Usage: wctl rules add <MATCH> center [horizontal|vertical|both]",
                    ))
                }
            };
            Ok(("center".to_string(), Value::String(axis.to_string())))
        }
        "place" => {
            let [x, y, width, height] = rest else {
                return Err(Fail::error(
                    "Usage: wctl rules add <MATCH> place <X> <Y> <WIDTH> <HEIGHT>",
                ));
            };
            // Resolved against the probe workarea, the same check the rule
            // itself gets at load time, so a percentage that cannot produce a
            // pixel is refused here rather than written and then rejected.
            crate::geometry::resolve_place_rect(
                [x.as_str(), y.as_str(), width.as_str(), height.as_str()],
                rules::PROBE_WORKAREA,
            )?;
            Ok((
                "place".to_string(),
                Value::Array(
                    [x, y, width, height]
                        .into_iter()
                        .map(|token| Value::String(token.clone()))
                        .collect(),
                ),
            ))
        }
        other => Err(Fail::error(format!(
            "Unknown action: {other}. Use tile, place or center."
        ))),
    }
}

/// Does `earlier` match every window `later` would?
///
/// First match wins, so a new rule under a more general one is dead. Each of
/// `earlier`'s predicates must be implied by one of `later`'s: an exact class
/// or title by the same value, a substring by any title or substring that
/// contains it.
fn shadows(earlier: &rules::Rule, later: &rules::Rule) -> bool {
    earlier.matches.iter().all(|general| {
        later.matches.iter().any(
            |specific| match (general.kind.as_str(), specific.kind.as_str()) {
                ("class", "class") | ("title", "title") => general.value == specific.value,
                ("substring", "title") | ("substring", "substring") => {
                    specific.value.contains(&general.value)
                }
                _ => false,
            },
        )
    })
}

/// `wctl rules add <MATCH> <ACTION> [--workspace N] [--monitor N] [--at N] [--dry-run]`
fn add(ctx: &mut Ctx, args: &[String]) -> Result<()> {
    let (file, args) = take_file_option(args)?;
    let (dry_run, args) = super::take_flag(&args, "--dry-run");

    // The value options come out first: they may appear anywhere, and the
    // action is positional.
    let mut workspace = None;
    let mut monitor = None;
    let mut at = None;
    let mut rest = Vec::with_capacity(args.len());
    let mut index = 0;
    while index < args.len() {
        let slot = match args[index].as_str() {
            "--workspace" => &mut workspace,
            "--monitor" => &mut monitor,
            "--at" => &mut at,
            // A selector option's VALUE is never an option name.
            "-c" | "-t" | "-s" | "-p" => {
                rest.push(args[index].clone());
                if let Some(value) = args.get(index + 1) {
                    rest.push(value.clone());
                }
                index += 2;
                continue;
            }
            _ => {
                rest.push(args[index].clone());
                index += 1;
                continue;
            }
        };
        let option = args[index].clone();
        let Some(value) = args.get(index + 1) else {
            return Err(Fail::error(format!("Option {option} requires a value")));
        };
        if !crate::selector::is_window_id(value) {
            return Err(Fail::error(format!(
                "{option} must be a non-negative number"
            )));
        }
        *slot = Some(
            value
                .parse::<i64>()
                .map_err(|_| Fail::error(format!("{option} must be a non-negative number")))?,
        );
        index += 2;
    }

    let (match_block, shift) = parse_rule_match(&rest)?;
    let (action_key, action_value) = parse_rule_action(&rest[shift..])?;

    // Built in RULE_KEYS order, so the file reads the way the spec lists them.
    let mut rule = Map::new();
    rule.insert("match".to_string(), Value::Object(match_block));
    rule.insert(action_key, action_value);
    if let Some(workspace) = workspace {
        rule.insert("workspace".to_string(), Value::from(workspace));
    }
    if let Some(monitor) = monitor {
        rule.insert("monitor".to_string(), Value::from(monitor));
    }
    let rule = Value::Object(rule);

    // The warning is about the file the extension READS, so `--file` earns
    // neither the warning nor the bus call it costs.
    let is_default_file = file.is_none();
    let path = match file {
        Some(path) => path,
        None => default_path()?,
    };
    let (mut raw, compiled) = load(&path)?;

    let position = match at {
        None => raw.len(),
        Some(at) => {
            let at = usize::try_from(at).unwrap_or(usize::MAX);
            if at > raw.len() {
                return Err(Fail::error(format!(
                    "--at {at} is past the end; the file has {} rule(s)",
                    raw.len()
                )));
            }
            at
        }
    };

    // Validate the rule in the position it will occupy, so the index in any
    // message is the index it would really have.
    let mut candidate = raw.clone();
    candidate.insert(position, rule.clone());
    let recompiled = rules::compile_rules(&Value::Array(candidate.clone())).map_err(Fail::error)?;

    // First match wins, so only an EARLIER rule can shadow this one.
    let added = &recompiled[position];
    if let Some(shadow) = compiled
        .iter()
        .take(position)
        .position(|earlier| shadows(earlier, added))
    {
        eprintln!(
            "Warning: rule {shadow} already matches every window this rule would, \
             and the first match wins, so the new rule will never fire."
        );
    }

    if dry_run {
        println!(
            "{}",
            serde_json::to_string_pretty(&candidate).map_err(|e| Fail::error(e.to_string()))?
        );
        return Ok(());
    }

    raw.insert(position, rule);
    write_atomically(&path, &raw)?;
    println!("Added rule {position} to {}", path.display());
    if is_default_file {
        warn_if_rules_unsupported(ctx);
    }
    Ok(())
}

/// `wctl rules remove <INDEX> [--file PATH] [--dry-run]`
fn remove(ctx: &mut Ctx, args: &[String]) -> Result<()> {
    let (file, args) = take_file_option(args)?;
    let (dry_run, args) = super::take_flag(&args, "--dry-run");
    let [index] = args.as_slice() else {
        return Err(Fail::error("Usage: wctl rules remove <INDEX>"));
    };
    if !crate::selector::is_window_id(index) {
        return Err(Fail::error("Rule index must be a non-negative number"));
    }
    let index: usize = index
        .parse()
        .map_err(|_| Fail::error("Rule index must be a non-negative number"))?;

    let is_default_file = file.is_none();
    let path = match file {
        Some(path) => path,
        None => default_path()?,
    };
    let (mut raw, _) = load(&path)?;
    if index >= raw.len() {
        return Err(Fail::error(format!(
            "No rule {index}; the file has {} rule(s)",
            raw.len()
        ))
        .with_code(crate::fail::EXIT_NOT_FOUND));
    }

    raw.remove(index);
    if dry_run {
        println!(
            "{}",
            serde_json::to_string_pretty(&raw).map_err(|e| Fail::error(e.to_string()))?
        );
        return Ok(());
    }
    write_atomically(&path, &raw)?;
    println!("Removed rule {index} from {}", path.display());
    if is_default_file {
        warn_if_rules_unsupported(ctx);
    }
    Ok(())
}

/// `wctl rules test <WINDOW> [--file PATH] [--json]`
///
/// Why a rule did not fire, answered from outside the shell. Every cause is
/// otherwise invisible: an earlier rule matched first, the class or title is
/// not what the user typed, or the action resolves to nothing on that monitor's
/// workarea. The extension's own `rules[N] -> id` lines are `console.debug` and
/// hidden unless the shell is restarted with G_MESSAGES_DEBUG set.
///
/// Strictly read-only: it resolves the rectangle and never calls MoveResize.
fn test(ctx: &mut Ctx, args: &[String]) -> Result<()> {
    let usage = "Usage: wctl rules test <WINDOW> [--file PATH] [--json]";
    let (file, args) = take_file_option(args)?;
    let (json, args) = super::take_flag(&args, "--json");
    let selector = crate::selector::parse_min(0, usage, &args)?;
    if args.len() > selector.shift {
        return Err(Fail::error(usage));
    }

    let path = match file {
        Some(path) => path,
        None => default_path()?,
    };
    // The file is read BEFORE the bus call: a broken rules file is the user's
    // problem to fix either way, and reporting it costs nothing.
    let (_, compiled) = load(&path)?;

    // A match reported against an extension that ignores the file would
    // explain a placement that never happens. This command needs the shell
    // anyway, so a failed call is reported here rather than swallowed and met
    // again, after a second full timeout, at the window lookup.
    let capabilities = ctx.bus.get_capabilities()?;
    if !capabilities.iter().any(|name| name == RULES_CAPABILITY) {
        return Err(Fail::error(NO_RULES_SUPPORT).with_code(crate::fail::EXIT_NO_EXTENSION));
    }

    let id = crate::selector::lookup(ctx, &selector)?;
    let window = ctx.window_by_id(id)?;
    let wm_class = model::text(&window, "wm_class").to_string();
    let title = model::text(&window, "title").to_string();

    // Every rule that matches, in file order. The first wins; the rest are
    // shadowed, which is the case this command exists to name.
    let matching: Vec<usize> = compiled
        .iter()
        .enumerate()
        .filter(|(_, rule)| rule.matches_window(&wm_class, &title))
        .map(|(index, _)| index)
        .collect();

    let winner = matching.first().copied();
    // The workarea the extension would use: the rule's monitor when it names
    // one, otherwise the monitor the window is on.
    let monitor = winner
        .and_then(|index| compiled[index].monitor)
        .map(|monitor| monitor as i32)
        .unwrap_or_else(|| model::number(&window, "monitor_index") as i32);
    let workarea = super::workarea_of(ctx, monitor)?;
    let (x, y, width, height) = model::frame_rect(&window);
    let frame = Rect {
        x,
        y,
        width,
        height,
    };
    let target = winner.and_then(|index| compiled[index].resolve(workarea, frame));

    if json {
        println!(
            "{}",
            serde_json::json!({
                "window": {"id": id, "wm_class": wm_class, "title": title},
                "rules_file": path.display().to_string(),
                "rules": compiled.len(),
                "matched": winner,
                "shadowed": matching.iter().skip(1).collect::<Vec<_>>(),
                "monitor_index": monitor,
                "workarea": {
                    "x": workarea.x, "y": workarea.y,
                    "width": workarea.width, "height": workarea.height,
                },
                "target": target.map(|rect| serde_json::json!({
                    "x": rect.x, "y": rect.y,
                    "width": rect.width, "height": rect.height,
                })),
            })
        );
        return Ok(());
    }

    println!("Window {id}  class={wm_class}  title={title}");
    if compiled.is_empty() {
        match read_file(&path)? {
            Loaded::Absent => println!("No rules file at {}", path.display()),
            Loaded::Present { .. } => println!("{}: no rules", path.display()),
        }
        return Ok(());
    }

    let Some(index) = winner else {
        println!(
            "No rule matches this window (checked {} rules)",
            compiled.len()
        );
        return Ok(());
    };

    let rule = &compiled[index];
    println!(
        "Matched rule {index}: {} -> {}",
        describe_match(rule),
        if describe_action(rule).is_empty() {
            "(no geometry)".to_string()
        } else {
            describe_action(rule)
        }
    );
    for shadowed in matching.iter().skip(1) {
        println!(
            "  rule {shadowed} also matches but is shadowed: {} -> {}",
            describe_match(&compiled[*shadowed]),
            describe_action(&compiled[*shadowed])
        );
    }
    if let Some(workspace) = rule.workspace {
        println!("  workspace: {workspace}");
    }
    println!(
        "  monitor {monitor}, workarea {},{} {}x{}",
        workarea.x, workarea.y, workarea.width, workarea.height
    );
    match target {
        Some(rect) => println!(
            "  would place at {},{} {}x{}",
            rect.x, rect.y, rect.width, rect.height
        ),
        None if rule.action.is_none() => println!("  no geometry action"),
        None => println!("  the action resolves to nothing on this workarea; it would be skipped"),
    }
    Ok(())
}

/// Dispatch the subcommand. Unknown ones are a usage error, and no subcommand
/// prints the usage line rather than defaulting to one of them.
///
/// The bus connection inside `ctx` is lazy, so `check`, `list` and `path` reach
/// their verdict without one.
pub fn rules(ctx: &mut Ctx, args: &[String]) -> Result<()> {
    let Some(subcommand) = args.first().map(String::as_str) else {
        return Err(Fail::error(USAGE));
    };
    let rest = &args[1..];
    match subcommand {
        "check" => check(rest),
        "list" => list(rest),
        "path" => path_command(rest),
        "add" => add(ctx, rest),
        "remove" => remove(ctx, rest),
        "test" => test(ctx, rest),
        other => Err(Fail::error(format!(
            "Unknown rules subcommand: {other}. {USAGE}"
        ))),
    }
}
