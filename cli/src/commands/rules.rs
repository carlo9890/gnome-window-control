// SPDX-FileCopyrightText: 2026 hko9890
// SPDX-License-Identifier: MIT
//! `wctl rules` -- the auto-placement rules files the extension reads:
//! rules.json, then the drop-in files in rules.d.
//!
//! The files are local and so is the grammar (`crate::rules`), and the
//! extension picks a change up on its own through the file monitor described in
//! docs/specs/RULES-JSON.md. `check`, `list` and `path` never open the bus.
//! `add` and `remove` open it only after a file the extension reads is
//! written, to warn that the loaded extension does not report the `rules`
//! capability. `test` opens it to resolve a live window, and refuses an
//! extension without that capability or without the capability of a match key
//! or a rule key the file holds. `apply` asks the extension to apply the rules
//! it has loaded again.
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

/// The capability an extension reports when it serves ApplyRules.
const APPLY_CAPABILITY: &str = "rules-apply";

/// The capability an extension reports when it reads rules.d.
const DROP_IN_CAPABILITY: &str = "rules-dropin";

const NO_DROP_IN_SUPPORT: &str =
    "The extension GNOME Shell has loaded does not read rules.d, so only the \
     rules in rules.json are applied. Install a newer extension, then restart \
     the shell (log out and back in on Wayland).";

const NO_APPLY_SUPPORT: &str =
    "The extension GNOME Shell has loaded cannot apply the rules again. Check \
     with 'wctl version --json', install a newer extension, then restart the \
     shell (log out and back in on Wayland).";

const NO_RULES_SUPPORT: &str =
    "The extension GNOME Shell has loaded does not apply rules. Check with \
     'wctl version --json', install a newer extension, then restart the shell \
     (log out and back in on Wayland).";

/// The match keys added after `rules`, each with the capability an extension
/// reports when it knows them and the warning for one that does not.
const NEWER_MATCH_KEYS: [(&[&str], &str, &str); 3] = [
    (
        &["title_prefix", "title_suffix"],
        "rules-title-affix",
        "The extension GNOME Shell has loaded does not know title_prefix and \
         title_suffix. It refuses a rules file that has one, so no rule is applied \
         until a newer extension is loaded: install it, then restart the shell (log \
         out and back in on Wayland).",
    ),
    (
        &["class_prefix"],
        "rules-class-prefix",
        "The extension GNOME Shell has loaded does not know class_prefix. It \
         refuses a rules file that has it, so no rule is applied until a newer \
         extension is loaded: install it, then restart the shell (log out and \
         back in on Wayland).",
    ),
    (
        &[rules::MIN_WIDTH_KEY],
        "rules-min-width",
        "The extension GNOME Shell has loaded does not know min_width. It \
         refuses a rules file that has it, so no rule is applied until a newer \
         extension is loaded: install it, then restart the shell (log out and \
         back in on Wayland).",
    ),
];

/// The rule keys added after `rules`, in the shape of `NEWER_MATCH_KEYS`. A key
/// counts when it is present, whatever its value: the extension refuses a key
/// it does not know before it reads the value.
const NEWER_RULE_KEYS: [(&[&str], &str, &str); 1] = [(
    &["overlay"],
    "rules-overlay",
    "The extension GNOME Shell has loaded does not know the overlay key. It \
     refuses a rules file that has it, so no rule is applied until a newer \
     extension is loaded: install it, then restart the shell (log out and back \
     in on Wayland).",
)];

/// Warn, without failing, that the written file will not be applied yet: the
/// loaded extension does not apply rules, or it refuses a match key or a rule
/// key the file holds. One unknown key turns every rule off, so this looks at
/// the whole file.
///
/// A drop-in gets no key warning: an extension that does not read rules.d
/// ignores it whole, and one that does knows every key.
///
/// The file is valid either way and takes effect once the extension is updated,
/// so writing it is not refused. Only a shell that answers warns: no shell at
/// all is silent, because editing rules before a session exists is legitimate.
/// The shell is asked once, so a silent one costs one `CAPABILITY_PROBE`.
fn warn_if_unsupported(ctx: &Ctx, document: &[Value], is_drop_in: bool) {
    let Some(reported) = ctx.bus.reported_capabilities(CAPABILITY_PROBE) else {
        return;
    };
    for warning in write_warnings(&reported, document, is_drop_in) {
        eprintln!("Warning: {warning}");
    }
}

/// The warnings of `warn_if_unsupported`.
fn write_warnings(reported: &[String], document: &[Value], is_drop_in: bool) -> Vec<&'static str> {
    let mut warnings = Vec::new();
    if !reported.iter().any(|name| name == RULES_CAPABILITY) {
        warnings.push(NO_RULES_SUPPORT);
    }
    if !is_drop_in {
        warnings.extend(refused_keys(reported, document));
    } else if !reported.iter().any(|name| name == DROP_IN_CAPABILITY) {
        warnings.push(NO_DROP_IN_SUPPORT);
    }
    warnings
}

/// The warning of each `NEWER_MATCH_KEYS` and `NEWER_RULE_KEYS` entry that the
/// document uses and the extension does not report.
fn refused_keys(reported: &[String], document: &[Value]) -> Vec<&'static str> {
    let in_match = NEWER_MATCH_KEYS.iter().map(|entry| (entry, true));
    let in_rule = NEWER_RULE_KEYS.iter().map(|entry| (entry, false));
    in_match
        .chain(in_rule)
        .filter(|((keys, capability, _), is_match_key)| {
            let uses_key = document.iter().any(|rule| {
                let block = if *is_match_key {
                    rule["match"].as_object()
                } else {
                    rule.as_object()
                };
                block.is_some_and(|block| keys.iter().any(|key| block.contains_key(*key)))
            });
            uses_key && !reported.iter().any(|name| name == capability)
        })
        .map(|((_, _, warning), _)| *warning)
        .collect()
}

const USAGE: &str = "Usage: wctl rules <check|list|path|add|remove|test|apply> [OPTIONS]";

const ADD_USAGE: &str =
    "Usage: wctl rules add <-c CLASS|-t TITLE|-s SUBSTR|--title-prefix TEXT|--title-suffix TEXT|--class-prefix TEXT> [tile POSITION|place X Y W H|center [AXIS]] \
[--min-width N] [--workspace N] [--monitor N] [--overlay] [--at N] [--dry-run]";

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

/// Take `--file PATH` out of the argument list, leaving the rest. The value of
/// another option is skipped, so `-t --file` matches the title `--file`.
fn take_file_option(args: &[String]) -> Result<(Option<PathBuf>, Vec<String>)> {
    let mut path = None;
    let mut rest = Vec::with_capacity(args.len());
    let mut index = 0;
    while index < args.len() {
        if args[index] == "--file" {
            // A following option is not a path: `--file --json` would
            // otherwise report "no rules file" for a file named --json.
            let Some(value) = args
                .get(index + 1)
                .filter(|value| !value.is_empty() && !value.starts_with("--"))
            else {
                return Err(Fail::error("Option --file requires a value"));
            };
            path = Some(PathBuf::from(value));
            index += 2;
        } else if super::VALUE_OPTIONS.contains(&args[index].as_str()) {
            rest.extend(args[index..].iter().take(2).cloned());
            index += 2;
        } else {
            rest.push(args[index].clone());
            index += 1;
        }
    }
    Ok((path, rest))
}

/// The file a subcommand acts on: the `--file` one, else the extension's own.
fn rules_path(file: Option<PathBuf>) -> Result<PathBuf> {
    file.map_or_else(default_path, Ok)
}

/// The drop-in folder beside `user_file`, the `default_path()`.
fn drop_in_folder(user_file: &Path) -> PathBuf {
    user_file.with_file_name("rules.d")
}

const USER_LABEL: &str = "rules.json";

/// One file of the load order. `name` is None for rules.json, so the order of
/// the names is the load order.
struct Source {
    name: Option<String>,
    path: PathBuf,
}

impl Source {
    /// The source label of docs/specs/RULES-JSON.md.
    fn label(&self) -> String {
        match &self.name {
            None => USER_LABEL.to_string(),
            Some(name) => format!("rules.d/{name}"),
        }
    }
}

/// The drop-in files in `folder`, in load order. A missing folder has none.
/// `metadata` follows a symlink, and skips a FIFO before anything opens it.
fn drop_ins(folder: &Path) -> Result<Vec<Source>> {
    let entries = match std::fs::read_dir(folder) {
        Ok(entries) => entries,
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => return Ok(Vec::new()),
        Err(e) => {
            return Err(Fail::error(format!(
                "Cannot read {}: {e}",
                folder.display()
            )))
        }
    };
    let mut names: Vec<String> = entries
        .filter_map(|entry| entry.ok()?.file_name().into_string().ok())
        .filter(|name| {
            rules::is_drop_in_name(name)
                && std::fs::metadata(folder.join(name)).is_ok_and(|metadata| metadata.is_file())
        })
        .collect();
    names.sort();
    Ok(names
        .into_iter()
        .map(|name| Source {
            path: folder.join(&name),
            name: Some(name),
        })
        .collect())
}

/// The rules of one file, under its source label.
struct RuleFile {
    label: String,
    path: PathBuf,
    raw: Vec<Value>,
    compiled: Vec<rules::Rule>,
}

/// The rules of one file, or None when it does not exist.
fn load_file(source: &Source, name_the_file: bool) -> Result<Option<RuleFile>> {
    Ok(
        read_rules(&source.path, name_the_file)?.map(|(raw, compiled)| RuleFile {
            label: source.label(),
            path: source.path.clone(),
            raw,
            compiled,
        }),
    )
}

/// rules.json, then each drop-in file beside it, each loaded on its own as
/// the extension loads it. What a file that does not load means is the
/// subcommand's to decide. With a drop-in file, a validation message of
/// rules.json names its path, as a drop-in's does; without one it reads as it
/// did before rules.d existed.
///
/// A rules.d that cannot be listed is a warning: the extension still loads
/// rules.json then.
fn load_order(user_file: &Path) -> Vec<(Source, Result<Option<RuleFile>>)> {
    let drop_ins = drop_ins(&drop_in_folder(user_file)).unwrap_or_else(|failure| {
        eprintln!("Warning: {failure}");
        Vec::new()
    });
    let user = Source {
        name: None,
        path: user_file.to_path_buf(),
    };
    let user_rules = load_file(&user, !drop_ins.is_empty());
    std::iter::once((user, user_rules))
        .chain(drop_ins.into_iter().map(|source| {
            let rules = load_file(&source, true);
            (source, rules)
        }))
        .collect()
}

/// The files of the load order that load, and the failure of rules.json when
/// it does not.
struct LoadedFiles {
    files: Vec<RuleFile>,
    /// Kept for an extension that does not read rules.d: for it, rules.json
    /// is the only file, and one that does not load is an error.
    user_failure: Option<Fail>,
}

/// The files of the load order that load, for `list`, `test` and `apply`. One
/// that does not is named in a warning and left out, as the extension leaves
/// it out. rules.json without a drop-in file fails instead, as it did before
/// rules.d existed. An absent file has no rules.
fn loaded_files(user_file: &Path) -> Result<LoadedFiles> {
    let order = load_order(user_file);
    let alone = order.len() == 1;
    let mut loaded = LoadedFiles {
        files: Vec::new(),
        user_failure: None,
    };
    for (source, rules) in order {
        match rules {
            Ok(Some(file)) => loaded.files.push(file),
            Ok(None) => loaded.files.push(RuleFile {
                label: source.label(),
                path: source.path,
                raw: Vec::new(),
                compiled: Vec::new(),
            }),
            Err(failure) if alone => return Err(failure),
            Err(failure) => {
                eprintln!("Warning: {failure}");
                if source.name.is_none() {
                    loaded.user_failure = Some(failure);
                }
            }
        }
    }
    Ok(loaded)
}

/// The files `list` and `test` read: the `--file` one alone, refused whole
/// when it does not load, else the load order.
fn files_of(file: Option<PathBuf>) -> Result<(PathBuf, LoadedFiles)> {
    let Some(path) = file else {
        let path = default_path()?;
        let loaded = loaded_files(&path)?;
        return Ok((path, loaded));
    };
    let (raw, compiled) = load(&path)?;
    let files = vec![RuleFile {
        label: USER_LABEL.to_string(),
        path: path.clone(),
        raw,
        compiled,
    }];
    let loaded = LoadedFiles {
        files,
        user_failure: None,
    };
    Ok((path, loaded))
}

/// What reading the rules file produced.
enum Loaded {
    /// The file does not exist. Not an error: an absent file means no rules.
    Absent,
    Present {
        text: String,
    },
}

/// The extension's own rules.json is refused before it is opened when it is
/// no regular file, as the extension skips it: a read of a FIFO does not
/// finish while nothing writes to it. An explicit `--file` may be a pipe, as
/// in `--file <(...)`. `metadata` follows a symlink.
fn read_file(path: &Path) -> Result<Loaded> {
    match std::fs::metadata(path) {
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => return Ok(Loaded::Absent),
        Ok(metadata)
            if !metadata.is_file() && default_path().is_ok_and(|user_file| user_file == path) =>
        {
            return Err(Fail::error(format!(
                "Cannot read {}: not a regular file",
                path.display()
            )))
        }
        _ => {}
    }
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
    if let Some(path) = file {
        let source = Source { name: None, path };
        return check_file(&source.path, load_file(&source, false), json);
    }
    let mut order = load_order(&default_path()?);
    if order.len() == 1 {
        let (source, rules) = order.remove(0);
        return check_file(&source.path, rules, json);
    }
    check_all(order, json)
}

fn valid_line(path: &Path, count: usize) -> String {
    let plural = if count == 1 { "" } else { "s" };
    format!("{}: {count} rule{plural}, valid", path.display())
}

fn no_file_line(path: &Path) -> String {
    format!("No rules file at {}; no rules are loaded", path.display())
}

/// `check` of one file, from what loading it produced.
fn check_file(path: &Path, rules: Result<Option<RuleFile>>, json: bool) -> Result<()> {
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

    let compiled = match rules {
        Err(failure) => return Err(report_invalid(failure.to_string())),
        Ok(None) => {
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
                println!("{}", no_file_line(path));
            }
            return Ok(());
        }
        Ok(Some(file)) => file.compiled,
    };
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
        println!("{}", valid_line(path, compiled.len()));
    }
    Ok(())
}

/// `check` of rules.json and the drop-in files, in load order. Every file is
/// reported before the verdict, so one broken file does not hide another.
///
/// With `--json`, the top-level fields describe rules.json alone, as they did
/// before rules.d existed, and each drop-in reports its own in `dropins`.
fn check_all(order: Vec<(Source, Result<Option<RuleFile>>)>, json: bool) -> Result<()> {
    let mut errors = Vec::new();
    let mut loaded = Vec::new();
    let mut report = Value::Null;
    let mut drop_in_reports = Vec::new();
    for (source, rules) in order {
        let path = source.path.display().to_string();
        let mut entry = match rules {
            Ok(None) => {
                if !json {
                    println!("No rules file at {path}");
                }
                serde_json::json!({"path": path, "exists": false, "valid": true, "rules": 0})
            }
            Ok(Some(file)) => {
                if !json {
                    println!("{}", valid_line(&source.path, file.compiled.len()));
                }
                let entry = serde_json::json!({
                    "path": path,
                    "exists": true,
                    "valid": true,
                    "rules": file.compiled.len(),
                });
                loaded.push(file);
                entry
            }
            Err(failure) => {
                let entry = serde_json::json!({
                    "path": path,
                    "exists": true,
                    "valid": false,
                    "error": failure.to_string(),
                });
                errors.push(failure.to_string());
                entry
            }
        };
        if source.name.is_none() {
            report = entry;
        } else {
            // A listed drop-in exists, so `exists` says nothing about it.
            if let Some(fields) = entry.as_object_mut() {
                fields.remove("exists");
            }
            drop_in_reports.push(entry);
        }
    }

    for (earlier, earlier_index, later, later_index) in cross_file_shadows(&loaded) {
        eprintln!(
            "Warning: rule {earlier_index} of {earlier} already matches every window rule \
             {later_index} of {later} would, and the first match wins, so rule {later_index} \
             of {later} will never fire."
        );
    }

    if json {
        report["dropins"] = Value::Array(drop_in_reports);
        if errors.is_empty() {
            println!("{report}");
            return Ok(());
        }
        return Err(Fail::plain(report.to_string()));
    }
    let Some(last) = errors.pop() else {
        return Ok(());
    };
    for error in errors {
        Fail::error(error).report();
    }
    Err(Fail::error(last))
}

/// Each rule that a rule of an earlier file shadows, as (earlier label, index,
/// later label, index), with the first rule that shadows it. A rule shadowed
/// within its own file is left to `rules add`, which warns when it is written.
fn cross_file_shadows(files: &[RuleFile]) -> Vec<(&str, usize, &str, usize)> {
    let mut found = Vec::new();
    for (position, file) in files.iter().enumerate() {
        for (later_index, later) in file.compiled.iter().enumerate() {
            let shadowing = files[..position]
                .iter()
                .flat_map(|earlier| {
                    earlier
                        .compiled
                        .iter()
                        .enumerate()
                        .map(move |(index, rule)| (earlier.label.as_str(), index, rule))
                })
                .find(|(_, _, rule)| shadows(rule, later));
            if let Some((label, index, _)) = shadowing {
                found.push((label, index, file.label.as_str(), later_index));
            }
        }
    }
    found
}

/// Read the file and validate it, for the subcommands that need the rules
/// themselves rather than a verdict.
///
/// An absent file is `(Vec::new(), Vec::new())`, not an error. A file that does
/// not parse or does not validate IS an error: `add` and `remove` rewrite the
/// whole document, so acting on a file we could not read correctly would
/// discard whatever the user actually wrote.
fn load(path: &Path) -> Result<(Vec<Value>, Vec<rules::Rule>)> {
    Ok(read_rules(path, false)?.unwrap_or_default())
}

/// The rules of the file, or None when it does not exist. `name_the_file`
/// puts the path before a validation message, which names no file of its own;
/// a read or parse failure names it already.
fn read_rules(path: &Path, name_the_file: bool) -> Result<Option<(Vec<Value>, Vec<rules::Rule>)>> {
    let Loaded::Present { text } = read_file(path)? else {
        return Ok(None);
    };
    let document = parse(&text, path)?;
    let compiled = rules::compile_rules(&document).map_err(|message| {
        if name_the_file {
            Fail::error(format!("{}: {message}", path.display()))
        } else {
            Fail::error(message)
        }
    })?;
    let raw = document
        .as_array()
        .expect("compile_rules refuses a non-array")
        .clone();
    Ok(Some((raw, compiled)))
}

/// Write the document, atomically.
///
/// Serialise to a temp file in the SAME directory and rename over the target.
/// A rename within a directory is atomic, so a reader never sees a half-written
/// file -- and the extension watches the directory rather than the file for
/// exactly this pattern (see docs/specs/RULES-JSON.md), so the reload fires.
///
/// A symlinked `path`, say into a dotfiles repository, is written through: the
/// file it points to is replaced, then the link is replaced by an identical one.
/// Replacing the link with the file would cut the repository copy off, and
/// writing only the target would raise no event in the watched directory. A
/// dangling link names the file to create. The new link is made before the
/// target is touched, so a link that cannot be made changes nothing.
fn write_atomically(path: &Path, document: &[Value]) -> Result<()> {
    let text = format!(
        "{}\n",
        serde_json::to_string_pretty(document).map_err(|e| Fail::error(e.to_string()))?
    );
    let Ok(link) = std::fs::read_link(path) else {
        return replace_file(path, &text);
    };
    let link_directory = path.parent().unwrap_or(Path::new("."));
    let target = match std::fs::canonicalize(path) {
        Ok(target) => target,
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => link_directory.join(&link),
        Err(e) => {
            return Err(Fail::error(format!(
                "Cannot resolve {}: {e}",
                path.display()
            )))
        }
    };

    let temporary_link = link_directory.join(temporary_name(path, ".link"));
    let _ = std::fs::remove_file(&temporary_link);
    std::os::unix::fs::symlink(&link, &temporary_link)
        .map_err(|e| Fail::error(format!("Cannot write {}: {e}", temporary_link.display())))?;
    if let Err(failure) = replace_file(&target, &text) {
        let _ = std::fs::remove_file(&temporary_link);
        return Err(failure);
    }
    rename_over(&temporary_link, path)
}

/// Replace the regular file at `path` with `text` through a temporary file in
/// its directory.
fn replace_file(path: &Path, text: &str) -> Result<()> {
    let directory = path.parent().unwrap_or(Path::new("."));
    std::fs::create_dir_all(directory)
        .map_err(|e| Fail::error(format!("Cannot create {}: {e}", directory.display())))?;

    let temporary = directory.join(temporary_name(path, ""));
    std::fs::write(&temporary, text).map_err(|e| {
        // A write that fails after creating the file (a full disk) must not
        // leave it next to the rules file.
        let _ = std::fs::remove_file(&temporary);
        Fail::error(format!("Cannot write {}: {e}", temporary.display()))
    })?;
    // The new file takes the place of the old one, so it keeps its mode.
    if let Ok(metadata) = std::fs::metadata(path) {
        let _ = std::fs::set_permissions(&temporary, metadata.permissions());
    }
    rename_over(&temporary, path)
}

/// `.<name of path><infix>.<pid>`. The leading dot keeps the extension from
/// reading the file as a drop-in before the rename.
fn temporary_name(path: &Path, infix: &str) -> std::ffi::OsString {
    let mut name = std::ffi::OsString::from(".");
    name.push(path.file_name().unwrap_or_default());
    name.push(format!("{infix}.{}", std::process::id()));
    name
}

fn rename_over(temporary: &Path, path: &Path) -> Result<()> {
    std::fs::rename(temporary, path).map_err(|e| {
        let _ = std::fs::remove_file(temporary);
        Fail::error(format!("Cannot replace {}: {e}", path.display()))
    })
}

/// How a rule reads in the `list` table.
fn describe_match(rule: &rules::Rule) -> String {
    rule.matches
        .iter()
        .map(|m| format!("{}={}", m.key, m.value))
        .chain(
            rule.min_width
                .map(|width| format!("{}={width}", rules::MIN_WIDTH_KEY)),
        )
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

/// The action in a sentence, where the empty cell of the `list` table would
/// read as a missing word.
fn describe_action_or_none(rule: &rules::Rule) -> String {
    let action = describe_action(rule);
    if action.is_empty() {
        "(no geometry)".to_string()
    } else {
        action
    }
}

/// `wctl rules list [--file PATH] [--json]`
///
/// Without `--file`, the table holds every file in load order, and `--json`
/// still prints rules.json alone: a script reads that document unchanged.
fn list(args: &[String]) -> Result<()> {
    let (file, rest) = take_file_option(args)?;
    let json = super::parse_json_flag(&rest)?;
    let merged = file.is_none();

    if json {
        // The file unchanged, the way `list --json` and `info --json` emit the
        // extension's document unchanged.
        let (raw, _) = load(&rules_path(file)?)?;
        println!(
            "{}",
            serde_json::to_string_pretty(&raw).map_err(|e| Fail::error(e.to_string()))?
        );
        return Ok(());
    }

    let (_, LoadedFiles { files, .. }) = files_of(file)?;

    // No file and no rules print nothing at all: a `wctl rules list | wc -l`
    // should say 0, not 1 for a header over an empty table.
    if files.iter().all(|file| file.compiled.is_empty()) {
        return Ok(());
    }

    let mut header = vec![
        "INDEX".to_string(),
        "MATCH".to_string(),
        "ACTION".to_string(),
        "WORKSPACE".to_string(),
        "MONITOR".to_string(),
        "OVERLAY".to_string(),
    ];
    if merged {
        header.insert(0, "SOURCE".to_string());
    }
    let mut rows = vec![header];
    for file in &files {
        for (index, rule) in file.compiled.iter().enumerate() {
            let mut row = vec![
                index.to_string(),
                describe_match(rule),
                describe_action(rule),
                rule.workspace.map(|n| n.to_string()).unwrap_or_default(),
                rule.monitor.map(|n| n.to_string()).unwrap_or_default(),
                if rule.overlay { "yes" } else { "" }.to_string(),
            ];
            if merged {
                row.insert(0, file.label.clone());
            }
            rows.push(row);
        }
    }
    super::print_table(&rows);
    Ok(())
}

/// `wctl rules path [--file PATH | --dir]`
fn path_command(args: &[String]) -> Result<()> {
    let (file, rest) = take_file_option(args)?;
    let (dir, rest) = super::take_flag(&rest, "--dir");
    if let Some(unexpected) = rest.first() {
        return Err(Fail::error(format!("Unexpected argument: {unexpected}")));
    }
    if dir && file.is_some() {
        return Err(Fail::error("Option --dir cannot be used with --file"));
    }
    let path = rules_path(file)?;
    if dir {
        println!("{}", drop_in_folder(&path).display());
    } else {
        println!("{}", path.display());
    }
    Ok(())
}

/// Parse the match selector of `rules add`.
///
/// Only the selectors a STATIC file can carry. A numeric ID, `focused`
/// and `-p` all name a window that exists right now, which is exactly what a
/// rule cannot do: it is evaluated against windows that do not exist yet.
fn parse_rule_match(args: &[String]) -> Result<(Map<String, Value>, usize)> {
    let refused = |named: &str| {
        Fail::error(format!(
            "{named} names a window that already exists; a rule matches windows \
             that do not exist yet. Use -c <CLASS>, -t <TITLE>, -s <SUBSTR>, \
             --title-prefix <TEXT>, --title-suffix <TEXT> or --class-prefix <TEXT>."
        ))
    };

    let first = args.first().map(String::as_str).unwrap_or("");
    let key = match first {
        "-c" => "class",
        "-t" => "title",
        "-s" => "substr",
        "--title-prefix" => "title_prefix",
        "--title-suffix" => "title_suffix",
        "--class-prefix" => "class_prefix",
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
        // An empty class or title matches only a window whose class or title
        // is the empty string, any other empty value every window: either way
        // not a rule anyone means.
        let matches = match first {
            "-c" => "only a window whose class is the empty string",
            "-t" => "only a window whose title is the empty string",
            _ => "every window",
        };
        return Err(Fail::error(format!(
            "{first} requires a value; an empty one would match {matches}"
        )));
    }

    let mut block = Map::new();
    block.insert(key.to_string(), Value::String(value.clone()));
    Ok((block, 2))
}

/// Parse the action of `rules add`, validating through the same grammar the
/// rule will be validated by.
fn parse_rule_action(kind: &str, rest: &[String]) -> Result<(String, Value)> {
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
                [axis] => crate::geometry::parse_center_axis(axis)?,
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
/// or title by the same value, a substring by any title predicate whose value
/// contains it, a prefix or suffix by a title or a like predicate that starts
/// or ends with it, and a class prefix by a class or a class prefix that
/// starts with it. An earlier `min_width` must be implied too: by a later one
/// at least as large, tested against the same monitor.
fn shadows(earlier: &rules::Rule, later: &rules::Rule) -> bool {
    let width_implied = match (earlier.min_width, later.min_width) {
        (None, _) => true,
        (Some(general), Some(specific)) => specific >= general && earlier.monitor == later.monitor,
        (Some(_), None) => false,
    };
    width_implied
        && earlier.matches.iter().all(|general| {
            later.matches.iter().any(|specific| {
                match (general.kind.as_str(), specific.kind.as_str()) {
                    ("class", "class") | ("title", "title") => general.value == specific.value,
                    ("substring", "title" | "substring" | "prefix" | "suffix") => {
                        specific.value.contains(&general.value)
                    }
                    ("prefix", "title" | "prefix") => specific.value.starts_with(&general.value),
                    ("suffix", "title" | "suffix") => specific.value.ends_with(&general.value),
                    ("class_prefix", "class" | "class_prefix") => {
                        specific.value.starts_with(&general.value)
                    }
                    _ => false,
                }
            })
        })
}

/// What the extension makes of the file `add` or `remove` writes.
enum Target {
    /// rules.json: no `--file`, or one that names it.
    User,
    /// A file in rules.d the extension reads, by its name.
    DropIn(String),
    /// A file in rules.d with a name the extension skips.
    SkippedName(String),
    /// Any other `--file`: the extension never reads it.
    Other,
}

impl Target {
    fn of(file: Option<&Path>) -> Self {
        let Some(path) = file else {
            return Target::User;
        };
        let Ok(user_file) = default_path() else {
            return Target::Other;
        };
        // rules.json may be a link, say into a dotfiles repository, and
        // `--file` may name the file it points to.
        if let (Ok(file), Ok(user)) = (
            std::fs::canonicalize(path),
            std::fs::canonicalize(&user_file),
        ) {
            if file == user {
                return Target::User;
            }
        }
        let (Some(parent), Some(name)) = (path.parent(), path.file_name()) else {
            return Target::Other;
        };
        let parent = if parent.as_os_str().is_empty() {
            Path::new(".")
        } else {
            parent
        };
        let folder = resolve_folder(parent);
        let user_folder = user_file.parent().map(resolve_folder);
        if Some(&folder) == user_folder.as_ref() && Some(name) == user_file.file_name() {
            return Target::User;
        }
        if folder != resolve_folder(&drop_in_folder(&user_file)) {
            return Target::Other;
        }
        let name = name.to_string_lossy().into_owned();
        if rules::is_drop_in_name(&name) {
            Target::DropIn(name)
        } else {
            Target::SkippedName(name)
        }
    }

    /// After a write: warn about what keeps the extension from applying it.
    fn warn_after_write(&self, ctx: &Ctx, document: &[Value]) {
        match self {
            Target::User => warn_if_unsupported(ctx, document, false),
            Target::DropIn(_) => warn_if_unsupported(ctx, document, true),
            Target::SkippedName(name) => eprintln!(
                "Warning: The extension does not read {name} in rules.d. A drop-in \
                 name starts with a letter or a digit, has only letters, digits, \
                 '.', '_' and '-', and ends in .json."
            ),
            Target::Other => {}
        }
    }
}

/// `folder` as an absolute path without symlinks. A folder that does not
/// exist yet, as rules.d before the first drop-in, is resolved through its
/// parent, so a relative `--file rules.d/x.json` still names rules.d.
fn resolve_folder(folder: &Path) -> PathBuf {
    let Ok(absolute) = std::path::absolute(folder) else {
        return folder.to_path_buf();
    };
    if let Ok(resolved) = std::fs::canonicalize(&absolute) {
        return resolved;
    }
    match (absolute.parent(), absolute.file_name()) {
        (Some(parent), Some(name)) => {
            std::fs::canonicalize(parent).map_or(absolute.clone(), |parent| parent.join(name))
        }
        _ => absolute,
    }
}

/// The other files of the load order, split around `target`: a rule in a file
/// before it can shadow the new rule, and the new rule can shadow one in a
/// file after it. A file that does not load is left out; `rules check` names
/// it.
fn files_around(target: &Target) -> (Vec<RuleFile>, Vec<RuleFile>) {
    let own = match target {
        Target::User => None,
        Target::DropIn(name) => Some(name.as_str()),
        Target::SkippedName(_) | Target::Other => return (Vec::new(), Vec::new()),
    };
    let Ok(user_file) = default_path() else {
        return (Vec::new(), Vec::new());
    };
    let (mut before, mut after) = (Vec::new(), Vec::new());
    for (source, rules) in load_order(&user_file) {
        let side = match source.name.as_deref().cmp(&own) {
            std::cmp::Ordering::Less => &mut before,
            std::cmp::Ordering::Greater => &mut after,
            std::cmp::Ordering::Equal => continue,
        };
        if let Ok(Some(file)) = rules {
            side.push(file);
        }
    }
    (before, after)
}

/// `wctl rules add <MATCH> [ACTION] [--min-width N] [--workspace N] [--monitor N] [--overlay] [--at N] [--dry-run]`
///
/// The action may be left out when `--workspace`, `--monitor` or `--overlay` is
/// given: the grammar accepts a rule that only moves the window there, or only
/// makes it an overlay.
fn add(ctx: &mut Ctx, args: &[String]) -> Result<()> {
    let (file, args) = take_file_option(args)?;
    let (dry_run, args) = super::take_flag(&args, "--dry-run");
    let (overlay, args) = super::take_flag(&args, "--overlay");

    // The value options come out first: they may appear anywhere, and the
    // action is positional.
    let mut workspace = None;
    let mut monitor = None;
    let mut min_width = None;
    let mut at = None;
    let mut rest = Vec::with_capacity(args.len());
    let mut index = 0;
    while index < args.len() {
        let option = args[index].as_str();
        match option {
            "--workspace" | "--monitor" | "--min-width" | "--at" => {}
            // A selector option's VALUE is never an option name.
            _ if super::VALUE_OPTIONS.contains(&option) => {
                rest.extend(args[index..].iter().take(2).cloned());
                index += 2;
                continue;
            }
            _ => {
                rest.push(args[index].clone());
                index += 1;
                continue;
            }
        }
        let Some(value) = args.get(index + 1) else {
            return Err(Fail::error(format!("Option {option} requires a value")));
        };
        let not_a_number = || Fail::error(format!("{option} must be a non-negative number"));
        if option == "--min-width" {
            // i32 is the bound the rule itself is validated against, and 0
            // would be refused by it.
            let width = super::index(value, option)
                .ok()
                .filter(|width| *width > 0)
                .ok_or_else(|| Fail::error("--min-width must be a positive number"))?;
            min_width = Some(i64::from(width));
        } else if option == "--at" {
            // A position in the file, not a rule field: any run of digits is
            // a number here, and one past the end is reported as that.
            if !crate::selector::is_window_id(value) {
                return Err(not_a_number());
            }
            at = Some(value.clone());
        } else {
            // i32 is the bound the rule itself is validated against.
            let number = i64::from(super::index(value, option).map_err(|_| not_a_number())?);
            if option == "--workspace" {
                workspace = Some(number);
            } else {
                monitor = Some(number);
            }
        }
        index += 2;
    }

    let (mut match_block, shift) = parse_rule_match(&rest)?;
    if let Some(min_width) = min_width {
        match_block.insert(rules::MIN_WIDTH_KEY.to_string(), Value::from(min_width));
    }
    let action = match rest[shift..].split_first() {
        Some((kind, action_args)) => Some(parse_rule_action(kind, action_args)?),
        None if workspace.is_some() || monitor.is_some() || overlay => None,
        None => {
            return Err(Fail::error(format!(
                "A rule needs an action, --workspace, --monitor or --overlay. {ADD_USAGE}"
            )))
        }
    };

    // Built in RULE_KEYS order, so the file reads the way the spec lists them.
    let mut rule = Map::new();
    rule.insert("match".to_string(), Value::Object(match_block));
    if let Some((key, value)) = action {
        rule.insert(key, value);
    }
    if let Some(workspace) = workspace {
        rule.insert("workspace".to_string(), Value::from(workspace));
    }
    if let Some(monitor) = monitor {
        rule.insert("monitor".to_string(), Value::from(monitor));
    }
    if overlay {
        rule.insert("overlay".to_string(), Value::Bool(true));
    }
    let rule = Value::Object(rule);

    // The warnings are about the files the extension READS, so any other
    // `--file` earns neither them nor the bus call they cost.
    let target = Target::of(file.as_deref());
    let path = rules_path(file)?;
    let (mut raw, compiled) = load(&path)?;

    let position = match at {
        None => raw.len(),
        Some(at) => match at.parse::<usize>() {
            Ok(at) if at <= raw.len() => at,
            _ => {
                return Err(Fail::error(format!(
                    "--at {at} is past the end; the file has {} rule(s)",
                    raw.len()
                )))
            }
        },
    };

    // Validate the rule in the position it will occupy, so the index in any
    // message is the index it would really have.
    let mut candidate = raw.clone();
    candidate.insert(position, rule.clone());
    let recompiled = rules::compile_rules(&Value::Array(candidate.clone())).map_err(Fail::error)?;

    // First match wins, so only an EARLIER rule can shadow this one: one in
    // a file loaded before this one, or one before it in this file.
    let added = &recompiled[position];
    let (before, after) = files_around(&target);
    let earlier_files = before.iter().flat_map(|file| {
        file.compiled
            .iter()
            .enumerate()
            .map(|(index, rule)| (format!("rule {index} of {}", file.label), rule))
    });
    let earlier_here = compiled
        .iter()
        .take(position)
        .enumerate()
        .map(|(index, rule)| (format!("rule {index}"), rule));
    if let Some((shadow, _)) = earlier_files
        .chain(earlier_here)
        .find(|(_, earlier)| shadows(earlier, added))
    {
        eprintln!(
            "Warning: {shadow} already matches every window this rule would, \
             and the first match wins, so the new rule will never fire."
        );
    }
    for file in &after {
        for (index, later) in file.compiled.iter().enumerate() {
            if shadows(added, later) {
                eprintln!(
                    "Warning: this rule matches every window rule {index} of {} would, \
                     and the first match wins, so rule {index} of {} will never fire.",
                    file.label, file.label
                );
            }
        }
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
    target.warn_after_write(ctx, &raw);
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

    let target = Target::of(file.as_deref());
    let path = rules_path(file)?;
    let (mut raw, _) = load(&path)?;
    // A number too large for usize is past the end like any other.
    let Some(index) = index.parse().ok().filter(|index| *index < raw.len()) else {
        return Err(Fail::error(format!(
            "No rule {index}; the file has {} rule(s)",
            raw.len()
        )));
    };

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
    target.warn_after_write(ctx, &raw);
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
    let merged = file.is_none();
    let (json, args) = super::take_flag(&args, "--json");
    let selector = crate::selector::parse_exact(0, usage, &args)?;

    // The files are read BEFORE the bus call: a broken rules file is the
    // user's problem to fix either way, and reporting it costs nothing.
    let (path, loaded) = files_of(file)?;

    // A match reported against an extension that ignores the file would
    // explain a placement that never happens. This command needs the shell
    // anyway, so a failed call is reported here rather than swallowed and met
    // again, after a second full timeout, at the window lookup.
    let capabilities = ctx.bus.get_capabilities()?;
    if !capabilities.iter().any(|name| name == RULES_CAPABILITY) {
        return Err(Fail::error(NO_RULES_SUPPORT).with_code(crate::fail::EXIT_NO_EXTENSION));
    }
    let files = files_the_extension_loads(&capabilities, loaded)?;
    let rules: Vec<(&str, usize, &rules::Rule)> = files
        .iter()
        .flat_map(|file| {
            file.compiled
                .iter()
                .enumerate()
                .map(|(index, rule)| (file.label.as_str(), index, rule))
        })
        .collect();

    let id = crate::selector::lookup(ctx, &selector)?;
    let window = ctx.window_by_id(id)?;
    let wm_class = model::text(&window, "wm_class").to_string();
    let title = model::text(&window, "title").to_string();
    let window_monitor = model::number(&window, "monitor_index");
    let monitor_widths = if rules.iter().any(|(_, _, rule)| rule.min_width.is_some()) {
        monitor_widths(ctx)?
    } else {
        Vec::new()
    };

    // Every rule that matches, in load order. The first wins; the rest are
    // shadowed, which is the case this command exists to name. A min_width is
    // tested against the monitor the rule resolves against: its own, else the
    // one the window is on.
    let matching: Vec<&(&str, usize, &rules::Rule)> = rules
        .iter()
        .filter(|(_, _, rule)| {
            let monitor = rule.monitor.unwrap_or(window_monitor);
            let width = monitor_widths
                .iter()
                .find(|(index, _)| *index == monitor)
                .map(|(_, width)| *width);
            rule.matches_window(&wm_class, &title) && rules::fits_monitor(rule.min_width, width)
        })
        .collect();

    let winner = matching.first().map(|(_, _, rule)| *rule);
    // The workarea the extension would use: the rule's monitor when it names
    // one, otherwise the monitor the window is on. rules.js skips the rest of
    // a rule whose monitor does not exist -- the monitor move and the geometry
    // -- so that is an outcome to report, not an error. A missing monitor the
    // window itself reports is still an error.
    let rule_monitor = winner.and_then(|rule| rule.monitor);
    let monitor = rule_monitor.unwrap_or(window_monitor) as i32;
    let workarea = if rule_monitor.is_some() {
        super::workarea_if_present(ctx, monitor)?
    } else {
        Some(super::workarea_of(ctx, monitor)?)
    };
    let (x, y, width, height) = model::frame_rect(&window);
    let frame = Rect {
        x,
        y,
        width,
        height,
    };
    // rules.js skips the geometry of a fullscreen window.
    let fullscreen =
        model::flag(&window, "is_fullscreen") && winner.is_some_and(|rule| rule.action.is_some());
    let target = winner
        .zip(workarea)
        .filter(|_| !fullscreen)
        .and_then(|(rule, workarea)| rule.resolve(workarea, frame));

    if json {
        let mut report = serde_json::json!({
            "window": {"id": id, "wm_class": wm_class, "title": title},
            "rules_file": path.display().to_string(),
            "rules": rules.len(),
            "matched": matching.first().map(|(_, index, _)| index),
            "overlay": winner.map(|rule| rule.overlay),
            "shadowed": matching.iter().skip(1).map(|(_, index, _)| index).collect::<Vec<_>>(),
            "monitor_index": monitor,
            "workarea": workarea.map(|rect| serde_json::json!({
                "x": rect.x, "y": rect.y,
                "width": rect.width, "height": rect.height,
            })),
            "target": target.map(|rect| serde_json::json!({
                "x": rect.x, "y": rect.y,
                "width": rect.width, "height": rect.height,
            })),
        });
        if workarea.is_none() {
            report["skipped"] = serde_json::json!(SKIPPED_NO_SUCH_MONITOR);
        } else if fullscreen {
            report["skipped"] = serde_json::json!(SKIPPED_FULLSCREEN);
        }
        if merged {
            report["matched_source"] =
                serde_json::json!(matching.first().map(|(label, _, _)| label));
            report["shadowed_sources"] = serde_json::json!(matching
                .iter()
                .skip(1)
                .map(|(label, _, _)| label)
                .collect::<Vec<_>>());
        }
        println!("{report}");
        return Ok(());
    }

    println!("{}", window_line(id, &wm_class, &title));
    if rules.is_empty() {
        // rules.json is among the files unless it was left out: broken, or
        // refused beside a drop-in.
        if !files.iter().any(|file| file.label == USER_LABEL) {
            println!("{}", no_rule_loaded_line(&path));
            return Ok(());
        }
        match read_file(&path)? {
            Loaded::Absent => println!("No rules file at {}", path.display()),
            Loaded::Present { .. } => println!("{}: no rules", path.display()),
        }
        return Ok(());
    }

    let Some(&&(label, index, rule)) = matching.first() else {
        println!(
            "No rule matches this window (checked {} rules)",
            rules.len()
        );
        return Ok(());
    };

    println!(
        "Matched {}: {} -> {}",
        rule_name(label, index),
        describe_match(rule),
        describe_action_or_none(rule)
    );
    for (label, index, shadowed) in matching.iter().skip(1) {
        println!(
            "  {} also matches but is shadowed: {} -> {}",
            rule_name(label, *index),
            describe_match(shadowed),
            describe_action_or_none(shadowed)
        );
    }
    if let Some(workspace) = rule.workspace {
        println!("  workspace: {workspace}");
    }
    if rule.overlay {
        println!("  overlay: yes");
    }
    let Some(workarea) = workarea else {
        println!("{}", no_such_monitor_line(monitor));
        return Ok(());
    };
    println!(
        "  monitor {monitor}, workarea {},{} {}x{}",
        workarea.x, workarea.y, workarea.width, workarea.height
    );
    if fullscreen {
        println!("  the window is fullscreen; the geometry would be skipped");
        return Ok(());
    }
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

/// A rule of `test`'s output. A rule of rules.json reads as it did before
/// rules.d existed.
fn rule_name(label: &str, index: usize) -> String {
    if label == USER_LABEL {
        format!("rule {index}")
    } else {
        format!("rule {index} of {label}")
    }
}

/// `test`'s line when no rule is loaded and rules.json was left out.
fn no_rule_loaded_line(path: &Path) -> String {
    format!("No rule is loaded from {} or rules.d", path.display())
}

/// The files whose rules the loaded extension applies, for `test` and
/// `apply`, with a warning for each one left out.
fn files_the_extension_loads(
    capabilities: &[String],
    loaded: LoadedFiles,
) -> Result<Vec<RuleFile>> {
    let (warnings, files) = extension_files(capabilities, loaded);
    for warning in warnings {
        eprintln!("Warning: {warning}");
    }
    files
}

/// The decision of `files_the_extension_loads`, and its warnings.
///
/// An extension that does not read rules.d reads rules.json alone, so a
/// rules.json that does not load fails as it did before rules.d existed. The
/// extension refuses a file whole for one key it does not know. A refused
/// rules.json that is the only file leaves nothing to test or apply, so that
/// fails; any other refused file is left out.
fn extension_files(
    capabilities: &[String],
    loaded: LoadedFiles,
) -> (Vec<String>, Result<Vec<RuleFile>>) {
    let mut warnings = Vec::new();
    let mut files = loaded.files;
    if !capabilities.iter().any(|name| name == DROP_IN_CAPABILITY) {
        if files.iter().any(|file| file.label != USER_LABEL) {
            warnings.push(NO_DROP_IN_SUPPORT.to_string());
            files.retain(|file| file.label == USER_LABEL);
        }
        if let Some(failure) = loaded.user_failure {
            return (warnings, Err(failure));
        }
    }
    if let [only] = files.as_slice() {
        if let (USER_LABEL, Some(warning)) = (
            only.label.as_str(),
            refused_keys(capabilities, &only.raw).first(),
        ) {
            let failure = Fail::error(*warning).with_code(crate::fail::EXIT_NO_EXTENSION);
            return (warnings, Err(failure));
        }
    }
    files.retain(|file| match refused_keys(capabilities, &file.raw).first() {
        Some(warning) => {
            warnings.push(format!("{}: {warning}", file.path.display()));
            false
        }
        None => true,
    });
    (warnings, Ok(files))
}

/// (index, logical width) of every monitor, what `min_width` is compared
/// against. Mutter's layout mode is asked only when a monitor is scaled.
fn monitor_widths(ctx: &mut Ctx) -> Result<Vec<(i64, i64)>> {
    let monitors = super::monitor_list(ctx)?;
    let scale = |monitor: &Value| monitor["scale"].as_f64().unwrap_or(1.0);
    let stage_is_logical = if monitors.iter().any(|monitor| scale(monitor) != 1.0) {
        ctx.bus.stage_is_logical()?
    } else {
        false
    };
    Ok(monitors
        .iter()
        .map(|monitor| {
            let width = rules::logical_width(
                model::number(monitor, "width"),
                scale(monitor),
                stage_is_logical,
            );
            (model::number(monitor, "index"), width)
        })
        .collect())
}

/// `wctl rules apply [<WINDOW>]`
///
/// The extension applies the rules it has loaded to every open window, or to
/// the one named, as it does to a new window. The rules files are read first,
/// as `test` reads them: a rules.json the extension refuses loads no rule, and
/// an apply would then report success while it does nothing.
fn apply(ctx: &mut Ctx, args: &[String]) -> Result<()> {
    let selector = if args.is_empty() {
        None
    } else {
        Some(crate::selector::parse_exact(
            0,
            "Usage: wctl rules apply [<WINDOW>]",
            args,
        )?)
    };

    let loaded = loaded_files(&default_path()?)?;

    let capabilities = ctx.bus.get_capabilities()?;
    if !capabilities.iter().any(|name| name == APPLY_CAPABILITY) {
        return Err(Fail::error(NO_APPLY_SUPPORT).with_code(crate::fail::EXIT_NO_EXTENSION));
    }
    files_the_extension_loads(&capabilities, loaded)?;

    // ApplyRules reads 0 as every open window, so the window ID 0, which no
    // window has, must not reach it.
    let id = match &selector {
        Some(selector) => match crate::selector::lookup(ctx, selector)? {
            0 => return Err(super::not_found(0)),
            id => id,
        },
        None => 0,
    };
    let applied: u32 = ctx.bus.call("ApplyRules", &(id,))?;
    println!("{}", applied_line(id, applied));
    Ok(())
}

fn applied_line(id: u64, applied: u32) -> String {
    match (id, applied) {
        (0, 1) => "Applied the rules to 1 window".to_string(),
        (0, count) => format!("Applied the rules to {count} windows"),
        (id, 0) => format!(
            "No rule applied to window {id}: no rule matches it, or it opened a moment \
             ago and its own rule is still on the way"
        ),
        (id, _) => format!("Applied a rule to window {id}"),
    }
}

const SKIPPED_NO_SUCH_MONITOR: &str = "no such monitor";
const SKIPPED_FULLSCREEN: &str = "fullscreen";

fn window_line(id: u64, wm_class: &str, title: &str) -> String {
    format!(
        "Window {id}  class={}  title={}",
        crate::table::sanitize(wm_class),
        crate::table::sanitize(title)
    )
}

fn no_such_monitor_line(monitor: i32) -> String {
    format!("  monitor {monitor} does not exist; the extension skips the rest of this rule")
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
        "apply" => apply(ctx, rest),
        other => Err(Fail::error(format!(
            "Unknown rules subcommand: {other}. {USAGE}"
        ))),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn window_line_cannot_be_forged_by_a_title_or_a_class() {
        assert_eq!(
            window_line(
                7,
                "kitty\u{1b}]0;x\u{7}",
                "a\nMatched rule 0: forged\u{1b}[2J"
            ),
            "Window 7  class=kitty?]0;x?  title=a?Matched rule 0: forged?[2J"
        );
    }

    #[test]
    fn refused_keys_names_each_key_the_extension_does_not_report() {
        let document = [
            json!({"match": {"class_prefix": "chrome-"}, "tile": "left"}),
            json!({"match": {"title_suffix": " - Mozilla"}, "tile": "right"}),
        ];
        let reported = |names: &[&str]| names.iter().map(|n| n.to_string()).collect::<Vec<_>>();

        assert_eq!(
            refused_keys(&reported(&["rules"]), &document),
            vec![NEWER_MATCH_KEYS[0].2, NEWER_MATCH_KEYS[1].2]
        );
        assert_eq!(
            refused_keys(&reported(&["rules", "rules-title-affix"]), &document),
            vec![NEWER_MATCH_KEYS[1].2]
        );
        assert!(refused_keys(
            &reported(&["rules", "rules-title-affix", "rules-class-prefix"]),
            &document
        )
        .is_empty());
        assert!(refused_keys(&reported(&["rules"]), &document[..0]).is_empty());
    }

    /// `overlay` is a rule key, so it counts at the top of a rule and not in
    /// `match`. A `false` value counts too: the extension refuses the key.
    #[test]
    fn refused_keys_names_the_overlay_rule_key() {
        let reported = |names: &[&str]| names.iter().map(|n| n.to_string()).collect::<Vec<_>>();
        let overlay_warning = NEWER_RULE_KEYS[0].2;

        for value in [json!(true), json!(false)] {
            let document = [json!({"match": {"class": "a"}, "tile": "left", "overlay": value})];
            assert_eq!(
                refused_keys(&reported(&["rules"]), &document),
                vec![overlay_warning]
            );
            assert!(refused_keys(&reported(&["rules", "rules-overlay"]), &document).is_empty());
        }

        let in_match = [json!({"match": {"overlay": "a"}, "tile": "left"})];
        assert!(refused_keys(&reported(&["rules"]), &in_match).is_empty());

        let both = [json!({"match": {"class_prefix": "a"}, "overlay": true})];
        assert_eq!(
            refused_keys(&reported(&["rules"]), &both),
            vec![NEWER_MATCH_KEYS[1].2, overlay_warning]
        );
    }

    /// An earlier min_width is a narrower rule unless the later one has at
    /// least that min_width on the same monitor.
    #[test]
    fn shadows_follows_what_a_min_width_implies() {
        let with = |min_width: Option<i64>, monitor: Option<i64>| {
            let mut block = json!({"class": "kitty"});
            if let Some(width) = min_width {
                block["min_width"] = json!(width);
            }
            let mut rule = json!({"match": block, "tile": "left"});
            if let Some(monitor) = monitor {
                rule["monitor"] = json!(monitor);
            }
            rules::compile_rule(&rule, 0).expect("a valid rule")
        };
        let cases = [
            (None, None, Some(3000), None, true),
            (Some(3000), None, None, None, false),
            (Some(3000), None, Some(3000), None, true),
            (Some(3000), None, Some(3840), None, true),
            (Some(3840), None, Some(3000), None, false),
            (Some(3000), Some(1), Some(3000), None, false),
            (Some(3000), Some(1), Some(3000), Some(1), true),
        ];
        for (earlier_width, earlier_monitor, later_width, later_monitor, expected) in cases {
            assert_eq!(
                shadows(
                    &with(earlier_width, earlier_monitor),
                    &with(later_width, later_monitor)
                ),
                expected,
                "{earlier_width:?} on {earlier_monitor:?} before {later_width:?} on {later_monitor:?}"
            );
        }
    }

    #[test]
    fn describe_match_names_the_min_width_last() {
        let rule = rules::compile_rule(
            &json!({"match": {"min_width": 3000, "class": "kitty"}, "tile": "left"}),
            0,
        )
        .expect("a valid rule");
        assert_eq!(describe_match(&rule), "class=kitty min_width=3000");
    }

    fn rule(key: &str, value: &str) -> rules::Rule {
        rules::compile_rule(&json!({"match": {key: value}, "tile": "left"}), 0)
            .expect("a valid rule")
    }

    /// Each title implication `shadows` knows, then the reverse of each: there
    /// the earlier rule is the narrower one, and a warning would be false.
    #[test]
    fn shadows_follows_what_a_title_predicate_implies() {
        let cases = [
            ("substr", "port", "title_prefix", "Report", true),
            ("substr", "port", "title_suffix", "Report", true),
            ("title_prefix", "Rep", "title", "Report", true),
            ("title_prefix", "Rep", "title_prefix", "Report", true),
            ("title_suffix", "ort", "title", "Report", true),
            ("title_suffix", "ort", "title_suffix", "Report", true),
            ("title_prefix", "Report", "substr", "port", false),
            ("title_suffix", "Report", "substr", "port", false),
            ("title", "Report", "title_prefix", "Rep", false),
            ("title_prefix", "Report", "title_prefix", "Rep", false),
            ("title", "Report", "title_suffix", "ort", false),
            ("title_suffix", "Report", "title_suffix", "ort", false),
            ("title_prefix", "Rep", "title_suffix", "Rep", false),
            ("title_suffix", "ort", "title_prefix", "ort", false),
        ];
        for (earlier_key, earlier_value, later_key, later_value, expected) in cases {
            assert_eq!(
                shadows(
                    &rule(earlier_key, earlier_value),
                    &rule(later_key, later_value)
                ),
                expected,
                "{earlier_key}={earlier_value} before {later_key}={later_value}"
            );
        }
    }

    /// The class implications, then their reverse, as for the title above.
    #[test]
    fn shadows_follows_what_a_class_prefix_implies() {
        let cases = [
            ("class_prefix", "chrome-", "class", "chrome-a-Default", true),
            (
                "class_prefix",
                "chrome-",
                "class_prefix",
                "chrome-github",
                true,
            ),
            (
                "class",
                "chrome-a-Default",
                "class_prefix",
                "chrome-",
                false,
            ),
            (
                "class_prefix",
                "chrome-github",
                "class_prefix",
                "chrome-",
                false,
            ),
            ("class_prefix", "chrome-", "title_prefix", "chrome-", false),
            ("title_prefix", "chrome-", "class_prefix", "chrome-", false),
        ];
        for (earlier_key, earlier_value, later_key, later_value, expected) in cases {
            assert_eq!(
                shadows(
                    &rule(earlier_key, earlier_value),
                    &rule(later_key, later_value)
                ),
                expected,
                "{earlier_key}={earlier_value} before {later_key}={later_value}"
            );
        }
    }

    fn file(label: &str, document: Value) -> RuleFile {
        let compiled = rules::compile_rules(&document).expect("a valid file");
        RuleFile {
            label: label.to_string(),
            path: PathBuf::from(format!("/c/{label}")),
            raw: document.as_array().expect("an array").clone(),
            compiled,
        }
    }

    /// Only a rule of an earlier file counts, and only the first one that
    /// shadows a rule is named.
    #[test]
    fn cross_file_shadows_names_the_first_earlier_file_rule() {
        let files = [
            file(
                "rules.json",
                json!([{"match": {"class": "kitty"}, "tile": "left"}]),
            ),
            file(
                "rules.d/a.json",
                json!([
                    {"match": {"class": "kitty"}, "tile": "right"},
                    {"match": {"class": "foot"}, "tile": "left"},
                    {"match": {"class": "foot"}, "tile": "right"},
                ]),
            ),
            file(
                "rules.d/b.json",
                json!([
                    {"match": {"class": "kitty"}, "tile": "center"},
                    {"match": {"class": "foot"}, "tile": "center"},
                    {"match": {"class": "mpv"}, "tile": "center"},
                ]),
            ),
        ];
        assert_eq!(
            cross_file_shadows(&files),
            vec![
                ("rules.json", 0, "rules.d/a.json", 0),
                ("rules.json", 0, "rules.d/b.json", 0),
                ("rules.d/a.json", 1, "rules.d/b.json", 1),
            ]
        );
    }

    fn names(names: &[&str]) -> Vec<String> {
        names.iter().map(|n| n.to_string()).collect()
    }

    fn labels(files: &[RuleFile]) -> Vec<&str> {
        files.iter().map(|file| file.label.as_str()).collect()
    }

    fn loaded(files: Vec<RuleFile>, user_failure: Option<&str>) -> LoadedFiles {
        LoadedFiles {
            files,
            user_failure: user_failure.map(Fail::error),
        }
    }

    fn plain_file() -> Value {
        json!([{"match": {"class": "kitty"}, "tile": "left"}])
    }

    fn overlay_file() -> Value {
        json!([{"match": {"class": "kitty"}, "tile": "left", "overlay": true}])
    }

    /// Without rules-dropin only rules.json counts, so a rules.json that did
    /// not load is the error, although a drop-in loaded.
    #[test]
    fn extension_files_fail_on_a_broken_rules_json_without_rules_dropin() {
        let (warnings, files) = extension_files(
            &names(&["rules"]),
            loaded(vec![file("rules.d/a.json", plain_file())], Some("broken")),
        );
        assert_eq!(warnings, [NO_DROP_IN_SUPPORT]);
        let failure = files.err().expect("an error");
        assert_eq!(
            (failure.to_string(), failure.code()),
            ("broken".to_string(), 1)
        );

        let (warnings, files) = extension_files(
            &names(&["rules", "rules-dropin"]),
            loaded(vec![file("rules.d/a.json", plain_file())], Some("broken")),
        );
        assert!(warnings.is_empty());
        assert_eq!(labels(&files.expect("files")), ["rules.d/a.json"]);
    }

    /// The refused keys are checked with or without rules-dropin. A refused
    /// rules.json alone fails; any other refused file is left out.
    #[test]
    fn extension_files_check_the_refused_keys_of_every_file() {
        let (warnings, files) = extension_files(
            &names(&["rules", "rules-dropin"]),
            loaded(vec![file("rules.json", overlay_file())], None),
        );
        assert!(warnings.is_empty());
        let failure = files.err().expect("an error");
        assert_eq!(
            (failure.to_string(), failure.code()),
            (
                NEWER_RULE_KEYS[0].2.to_string(),
                crate::fail::EXIT_NO_EXTENSION
            )
        );

        let (warnings, files) = extension_files(
            &names(&["rules"]),
            loaded(
                vec![
                    file("rules.json", overlay_file()),
                    file("rules.d/a.json", plain_file()),
                ],
                None,
            ),
        );
        assert_eq!(warnings, [NO_DROP_IN_SUPPORT]);
        assert_eq!(
            files.err().expect("an error").code(),
            crate::fail::EXIT_NO_EXTENSION
        );

        let (warnings, files) = extension_files(
            &names(&["rules", "rules-dropin"]),
            loaded(
                vec![
                    file("rules.json", overlay_file()),
                    file("rules.d/a.json", plain_file()),
                    file("rules.d/b.json", overlay_file()),
                ],
                None,
            ),
        );
        assert_eq!(
            warnings,
            [
                format!("/c/rules.json: {}", NEWER_RULE_KEYS[0].2),
                format!("/c/rules.d/b.json: {}", NEWER_RULE_KEYS[0].2),
            ]
        );
        assert_eq!(labels(&files.expect("files")), ["rules.d/a.json"]);

        let (warnings, files) = extension_files(
            &names(&["rules", "rules-dropin", "rules-overlay"]),
            loaded(
                vec![
                    file("rules.json", overlay_file()),
                    file("rules.d/a.json", plain_file()),
                ],
                None,
            ),
        );
        assert!(warnings.is_empty());
        assert_eq!(
            labels(&files.expect("files")),
            ["rules.json", "rules.d/a.json"]
        );
    }

    /// A drop-in gets no refused-key warning; rules.json gets no rules.d one.
    #[test]
    fn write_warnings_name_refused_keys_for_rules_json_only() {
        let document = overlay_file();
        let document = document.as_array().expect("an array");
        assert_eq!(
            write_warnings(&names(&["rules"]), document, false),
            [NEWER_RULE_KEYS[0].2]
        );
        assert_eq!(
            write_warnings(&names(&["rules"]), document, true),
            [NO_DROP_IN_SUPPORT]
        );
        assert_eq!(
            write_warnings(&names(&[]), document, true),
            [NO_RULES_SUPPORT, NO_DROP_IN_SUPPORT]
        );
        assert!(write_warnings(&names(&["rules", "rules-dropin"]), document, true).is_empty());
    }

    #[test]
    fn no_rule_loaded_line_names_both_places() {
        assert_eq!(
            no_rule_loaded_line(Path::new("/c/rules.json")),
            "No rule is loaded from /c/rules.json or rules.d"
        );
    }

    #[test]
    fn rule_name_names_the_file_of_a_drop_in_rule_only() {
        assert_eq!(rule_name("rules.json", 2), "rule 2");
        assert_eq!(rule_name("rules.d/a.json", 2), "rule 2 of rules.d/a.json");
    }

    #[test]
    fn temporary_name_is_a_dot_name_after_the_target() {
        let pid = std::process::id();
        assert_eq!(
            temporary_name(Path::new("/x/rules.d/revier.json"), ""),
            std::ffi::OsString::from(format!(".revier.json.{pid}"))
        );
        assert_eq!(
            temporary_name(Path::new("rules.json"), ".link"),
            std::ffi::OsString::from(format!(".rules.json.link.{pid}"))
        );
        assert!(!rules::is_drop_in_name(
            &temporary_name(Path::new("revier.json"), "").to_string_lossy()
        ));
    }

    #[test]
    fn drop_in_folder_is_beside_rules_json() {
        assert_eq!(
            drop_in_folder(Path::new("/c/gnome-window-control/rules.json")),
            Path::new("/c/gnome-window-control/rules.d")
        );
    }

    #[test]
    fn applied_line_names_the_count_or_the_window() {
        assert_eq!(applied_line(0, 0), "Applied the rules to 0 windows");
        assert_eq!(applied_line(0, 1), "Applied the rules to 1 window");
        assert_eq!(applied_line(0, 3), "Applied the rules to 3 windows");
        assert_eq!(
            applied_line(7, 0),
            "No rule applied to window 7: no rule matches it, or it opened a moment ago \
             and its own rule is still on the way"
        );
        assert_eq!(applied_line(7, 1), "Applied a rule to window 7");
    }

    #[test]
    fn a_missing_rule_monitor_says_the_extension_skips_the_rule() {
        assert_eq!(
            no_such_monitor_line(1),
            "  monitor 1 does not exist; the extension skips the rest of this rule"
        );
        assert_eq!(SKIPPED_NO_SUCH_MONITOR, "no such monitor");
    }
}
