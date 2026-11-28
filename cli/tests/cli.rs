// SPDX-FileCopyrightText: 2026 hko9890
// SPDX-License-Identifier: MIT
//! Argument-validation tests that run the real binary.
//!
//! Every case here must fail before wctl opens the session bus, so the suite is
//! headless: it points DBUS_SESSION_BUS_ADDRESS at a socket that does not
//! exist, and any case that reached the bus would report a connection error
//! instead of the expected message. These are the cases the bash suite covered
//! in tests/test-logic.sh.

use std::io::Write;
use std::path::Path;
use std::process::{Command, Stdio};

use assert_cmd::cargo::cargo_bin;

/// A bus address that cannot connect, so a command that tries is obvious.
const NO_BUS: &str = "unix:path=/nonexistent/wctl-test-bus";

fn wctl(args: &[&str]) -> (String, i32) {
    wctl_env(args, None)
}

/// `wctl` with an optional WCTL_TIMEOUT. The variable is removed when no value
/// is given, so a developer who exports it in their own shell cannot change
/// what this suite tests.
fn wctl_env(args: &[&str], timeout: Option<&str>) -> (String, i32) {
    let mut command = Command::new(cargo_bin("wctl"));
    command.args(args).env("DBUS_SESSION_BUS_ADDRESS", NO_BUS);
    match timeout {
        Some(value) => command.env("WCTL_TIMEOUT", value),
        None => command.env_remove("WCTL_TIMEOUT"),
    };
    let output = command.output().expect("wctl runs");
    let mut combined = String::from_utf8_lossy(&output.stdout).into_owned();
    combined.push_str(&String::from_utf8_lossy(&output.stderr));
    (combined, output.status.code().unwrap_or(-1))
}

#[track_caller]
fn expect_die(needle: &str, args: &[&str]) {
    let (out, code) = wctl(args);
    assert_ne!(code, 0, "wctl {args:?} should fail, printed: {out}");
    assert!(
        out.contains(needle),
        "wctl {args:?} should mention {needle:?}, printed: {out}"
    );
}

#[track_caller]
fn expect_not(forbidden: &str, args: &[&str]) {
    let (out, _) = wctl(args);
    assert!(
        !out.contains(forbidden),
        "wctl {args:?} should not mention {forbidden:?}, printed: {out}"
    );
}

#[test]
fn global_timeout_guards() {
    expect_die("Option --timeout requires a value", &["--timeout"]);
    for value in ["abc", "0", "-5", "2.5", ""] {
        expect_die(
            "--timeout must be a positive number of seconds",
            &["--timeout", value, "list"],
        );
    }

    // The flag must be settled before the bus is touched, like every other
    // argument guard here.
    let (out, code) = wctl(&["--timeout", "2", "help"]);
    assert_eq!(
        code, 0,
        "--timeout should be accepted before a command: {out}"
    );
    assert!(out.contains("Window Control CLI"));
}

/// A bad WCTL_TIMEOUT must not break a command that never opens a connection.
///
/// `wctl completion bash` is the one that matters: it is run from a shell rc
/// file, so an error there reaches every new shell and installs no completion.
#[test]
fn wctl_timeout_is_only_read_when_a_connection_is_needed() {
    for args in [
        vec!["help"],
        vec!["--version"],
        vec!["version"],
        vec!["completion", "bash"],
        vec!["completion", "zsh"],
    ] {
        let (out, code) = wctl_env(&args, Some("abc"));
        assert_eq!(code, 0, "wctl {args:?} with a bad WCTL_TIMEOUT: {out}");
        // Not "contains WCTL_TIMEOUT": `help` documents the variable, so the
        // name appears in perfectly good output. The error text is the signal.
        assert!(
            !out.contains("WCTL_TIMEOUT must be"),
            "wctl {args:?} should not validate WCTL_TIMEOUT, printed: {out}"
        );
    }

    // The rules file commands open no connection either, and a usage error is
    // reported before one would be.
    let dir = std::env::temp_dir().join(format!("wctl-timeout-rules-{}", std::process::id()));
    std::fs::remove_dir_all(&dir).ok();
    std::fs::create_dir_all(&dir).expect("temp dir");
    let file = dir.join("rules.json");
    std::fs::write(&file, "[]").expect("rules file");
    let path = file.to_str().unwrap();
    for args in [
        vec!["rules", "check", "--file", path],
        vec!["rules", "list", "--file", path],
        vec!["rules", "path", "--file", path],
    ] {
        let (out, code) = wctl_env(&args, Some("abc"));
        assert_eq!(code, 0, "wctl {args:?} with a bad WCTL_TIMEOUT: {out}");
        assert!(!out.contains("WCTL_TIMEOUT must be"), "printed: {out}");
    }
    std::fs::remove_dir_all(&dir).ok();
    let (out, _) = wctl_env(&["move", "abc", "1", "2"], Some("abc"));
    assert!(out.contains("Window ID must be a number"), "printed: {out}");

    // An explicit flag is a usage error whatever the command, because the user
    // typed it for this invocation.
    expect_die(
        "--timeout must be a positive number of seconds",
        &["--timeout", "abc", "help"],
    );
}

/// Under `--json` a failed call is a document, but a bad WCTL_TIMEOUT is a
/// usage error, whatever the selector form: no document reports it.
#[test]
fn a_bad_wctl_timeout_is_no_json_document() {
    for args in [
        vec!["version", "--json"],
        vec!["tile", "42", "left", "--json"],
        vec!["place", "42", "0", "0", "50%", "100%", "--json"],
        vec!["center", "42", "--json"],
    ] {
        let (out, code) = wctl_env(&args, Some("abc"));
        assert_eq!(code, 1, "wctl {args:?} with a bad WCTL_TIMEOUT: {out}");
        assert!(
            out.contains("WCTL_TIMEOUT must be") && !out.starts_with('{'),
            "wctl {args:?} printed: {out}"
        );
    }
}

#[test]
fn wctl_timeout_environment_guards() {
    for (value, command) in [
        ("abc", "list"),
        ("0", "list"),
        ("2.5", "list"),
        ("abc", "wait"),
    ] {
        let args: &[&str] = if command == "wait" {
            &["wait", "-c", "x"]
        } else {
            &["list"]
        };
        let (out, code) = wctl_env(args, Some(value));
        assert_ne!(code, 0, "WCTL_TIMEOUT={value} should fail, printed: {out}");
        assert!(
            out.contains("WCTL_TIMEOUT must be a positive number of seconds"),
            "WCTL_TIMEOUT={value} printed: {out}"
        );
    }

    // Empty means "unset", so it must not be an error -- it reaches the bus and
    // fails there instead.
    let (out, _) = wctl_env(&["list"], Some(""));
    assert!(
        !out.contains("WCTL_TIMEOUT must be"),
        "an empty WCTL_TIMEOUT should mean unset, printed: {out}"
    );

    // The flag wins over the variable, and is validated the same way.
    let (out, _) = wctl_env(&["--timeout", "abc", "list"], Some("5"));
    assert!(
        out.contains("--timeout must be a positive number of seconds"),
        "printed: {out}"
    );
}

#[test]
fn geometry_argument_guards() {
    expect_die("Window ID must be a number", &["move", "abc", "1", "2"]);
    expect_die("X coordinate must be a number", &["move", "123", "x", "2"]);
    expect_die("Y coordinate must be a number", &["move", "123", "1", "y"]);
    expect_die(
        "Width must be a positive number",
        &["resize", "123", "-5", "100"],
    );
    expect_die(
        "Height must be a positive number",
        &["resize", "123", "100", "-5"],
    );
    // Zero is not a positive extent.
    expect_die(
        "Width must be a positive number",
        &["resize", "123", "0", "100"],
    );
    expect_die(
        "Height must be a positive number",
        &["resize", "123", "100", "0"],
    );
    expect_die(
        "Width must be a positive number",
        &["move-resize", "123", "0", "0", "0", "100"],
    );
    expect_die(
        "Width must be a positive number",
        &["move-resize", "123", "0", "0", "abc", "100"],
    );
    expect_die("Invalid axis", &["center", "123", "diagonal"]);
}

#[test]
fn state_argument_guards() {
    expect_die("State must be 'on' or 'off'", &["above", "123", "maybe"]);
    expect_die("State must be 'on' or 'off'", &["sticky", "123", "maybe"]);
}

#[test]
fn every_window_taking_command_rejects_a_non_numeric_id() {
    expect_die("Window ID must be a number", &["focus", "abc"]);
    expect_die("Window ID must be a number", &["info", "abc"]);
    // A negative number is a bad ID, not an unknown option: the bash client
    // reached validate_id for it and the wording is a frozen contract.
    expect_die("Window ID must be a number", &["focus", "-1"]);
    expect_die("Window ID must be a number", &["minimize", "-1"]);
    expect_die("Window ID must be a number", &["tile", "abc", "center"]);
    expect_die("Window ID must be a number", &["center", "abc"]);
    expect_die(
        "Window ID must be a number",
        &["place", "abc", "left", "top", "50%", "100%"],
    );
    expect_die("Window ID must be a number", &["above", "abc", "on"]);
}

#[test]
fn usage_guards_fire_before_any_bus_call() {
    expect_die("Usage: wctl move", &["move", "123"]);
    expect_die("Usage: wctl center", &["center"]);
    expect_die("Usage: wctl tile", &["tile"]);
    expect_die("Usage: wctl tile", &["tile", "123"]);
    // A selector option occupies two arguments, so the count check still has to
    // happen before the bus call.
    expect_die("Usage: wctl tile", &["tile", "-c", "kitty"]);
    expect_die("Usage: wctl move", &["move", "-s", "Doc", "100"]);
    expect_die("Usage: wctl above", &["above", "focused"]);
    expect_die(
        "Usage: wctl place",
        &["place", "focused", "left", "top", "50%"],
    );
    expect_die(
        "Usage: wctl place",
        &["place", "123", "left", "top", "50%", "100%", "extra"],
    );
    expect_die("Usage: wctl info", &["info"]);

    // move/resize/move-resize take no flags, so anything past their arguments
    // is a mistake -- most likely a --json or --settled copied from the
    // neighbouring commands. They used to accept and ignore it.
    expect_die("Usage: wctl move", &["move", "123", "0", "0", "--json"]);
    expect_die("Usage: wctl move", &["move", "123", "0", "0", "extra"]);
    expect_die(
        "Usage: wctl resize",
        &["resize", "123", "800", "600", "--settled"],
    );
    expect_die(
        "Usage: wctl move-resize",
        &["move-resize", "123", "0", "0", "800", "600", "--json"],
    );
    // The excess-argument check runs against the parsed selector shift, so it
    // is headless even for an option selector -- which would otherwise cost a
    // ListDetailed before reporting the typo.
    expect_die(
        "Usage: wctl move",
        &["move", "-c", "kitty", "0", "0", "extra"],
    );
    expect_die("Usage: wctl tile", &["tile", "123", "left", "extra"]);
    expect_die("Usage: wctl center", &["center", "123", "both", "extra"]);
    expect_die(
        "Usage: wctl place",
        &["place", "-t", "Doc", "left", "top", "50%", "100%", "extra"],
    );

    // --json is stripped before the selector runs, so the count check still
    // sees the real positionals on either side of it.
    expect_die(
        "Usage: wctl place",
        &[
            "place", "123", "left", "top", "50%", "100%", "extra", "--json",
        ],
    );
    expect_die("Usage: wctl place", &["place", "--json", "123", "left"]);

    expect_die("Usage: wctl resolve-place", &["resolve-place"]);
    expect_die(
        "Usage: wctl resolve-place",
        &["resolve-place", "center", "top", "50%"],
    );
    expect_die(
        "Usage: wctl resolve-place",
        &["resolve-place", "center", "top", "50%", "100%", "extra"],
    );
    expect_die(
        "Option --monitor requires an argument",
        &["resolve-place", "center", "top", "50%", "100%", "--monitor"],
    );
    expect_die(
        "Monitor index must be a number",
        &[
            "resolve-place",
            "--monitor",
            "abc",
            "center",
            "top",
            "50%",
            "100%",
        ],
    );
    expect_die(
        "Unknown option: --bogus",
        &["resolve-place", "--bogus", "center", "top", "50%", "100%"],
    );
}

/// A value error after an option or `focused` selector is a usage error like
/// any other, so it must be reported before the selector is looked up -- with
/// the bus unreachable, reaching it would print the not-running hint instead.
#[test]
fn value_guards_fire_before_the_selector_is_looked_up() {
    expect_die("Invalid position", &["tile", "-c", "kitty", "nowhere"]);
    expect_die("Invalid axis", &["center", "focused", "sideways"]);
    expect_die(
        "State must be 'on' or 'off'",
        &["above", "-c", "kitty", "maybe"],
    );
    expect_die(
        "X coordinate must be a number",
        &["move", "focused", "abc", "0"],
    );
    expect_die(
        "Width must be a positive number",
        &["resize", "-t", "Doc", "0", "1"],
    );
    expect_die(
        "Workspace index must be a number",
        &["move-to-workspace", "-s", "Doc", "abc"],
    );
    expect_die(
        "Monitor index must be a number",
        &["move-to-monitor", "focused", "-1"],
    );
    expect_die(
        "Unexpected argument: extra",
        &["info", "-c", "kitty", "extra"],
    );
}

/// Every window-taking command refuses an argument it would otherwise ignore.
#[test]
fn stray_arguments_are_refused_everywhere() {
    expect_die(
        "Usage: wctl move-to-workspace",
        &["move-to-workspace", "123", "2", "3"],
    );
    expect_die(
        "Usage: wctl move-to-monitor",
        &["move-to-monitor", "123", "0", "x"],
    );
    expect_die("Usage: wctl above", &["above", "123", "on", "--json"]);
    expect_die("Usage: wctl sticky", &["sticky", "123", "off", "extra"]);
    expect_die("Usage: wctl minimize", &["minimize", "123", "junk"]);
    expect_die(
        "Usage: wctl minimize <WINDOW> [--no-animation]",
        &["minimize", "--no-animation"],
    );
    expect_die(
        "Usage: wctl unminimize <WINDOW> [--no-animation]",
        &["unminimize", "123", "--no-animation", "junk"],
    );
    expect_die(
        "Unknown option: --instant",
        &["minimize", "--instant", "123"],
    );
    expect_die("Usage: wctl focus", &["focus", "focused", "junk"]);
    expect_die("Usage: wctl close", &["close", "-c", "kitty", "now"]);
    expect_die("Usage: wctl workspace", &["workspace", "1", "2"]);
    expect_die("Unexpected argument: zsh", &["completion", "bash", "zsh"]);
}

/// A bad place token is a usage error, reported before the workarea is
/// fetched: with the bus unreachable, reaching it would print the connect
/// error instead.
#[test]
fn place_tokens_are_checked_before_any_bus_call() {
    let cases = [
        (
            ["sideways", "0", "50%", "50%"],
            "Invalid X position: sideways. Use a number or left|center|right",
        ),
        (
            ["0", "left", "50%", "50%"],
            "Invalid Y position: left. Use a number or top|center|bottom",
        ),
        (
            ["0", "0", "bogus", "50%"],
            "Invalid WIDTH: bogus. Use a positive number or percentage like 50%",
        ),
        (
            ["0", "0", "50%", "-5"],
            "Invalid HEIGHT: -5. Use a positive number or percentage like 50%",
        ),
        (
            ["0", "0", "0%", "50%"],
            "WIDTH percentage resolves to 0 pixels: 0%",
        ),
    ];
    for (tokens, message) in cases {
        for command in [
            ["place", "123"].as_slice(),
            ["place", "-c", "kitty"].as_slice(),
            ["resolve-place"].as_slice(),
        ] {
            let args = [command, tokens.as_slice()].concat();
            let (out, code) = wctl(&args);
            assert_eq!(code, 1, "wctl {args:?} printed: {out}");
            assert!(
                out.contains(message) && !out.contains("connect"),
                "wctl {args:?} should print {message:?}, printed: {out}"
            );
        }
    }
}

/// A session bus that cannot be reached is exit 5, like a bus with nobody
/// serving the interface, but the message points at the bus address.
#[test]
fn an_unreachable_bus_names_the_session_bus() {
    let (out, code) = wctl(&["list"]);
    assert_eq!(code, 5, "wctl list printed: {out}");
    assert!(
        out.contains("Cannot connect to the session bus")
            && out.contains("DBUS_SESSION_BUS_ADDRESS")
            && !out.contains("extension is not running"),
        "wctl list printed: {out}"
    );
}

/// A window titled `--json` is still addressable: the output flags are taken
/// from the argument list, but never out of a selector's value slot.
#[test]
fn output_flags_are_not_taken_from_a_selector_value() {
    // Each parses in full and goes on to the bus. A flag taken out of the
    // value slot would leave a usage error or "Option -t requires an
    // argument" instead, before any connection.
    let reaches_the_bus = "Cannot connect to the session bus";
    expect_die(reaches_the_bus, &["tile", "-t", "--json", "left"]);
    expect_die(
        reaches_the_bus,
        &["place", "-s", "--settled", "0", "0", "100", "100"],
    );
    expect_die(reaches_the_bus, &["info", "-t", "--json"]);
    expect_die(reaches_the_bus, &["center", "--json", "-c", "--settled"]);
}

#[test]
fn selector_option_guards() {
    expect_die("Unknown option: -x", &["tile", "-x", "left"]);
    expect_die("Option -c requires an argument", &["tile", "-c"]);
    expect_die("PID must be a number", &["tile", "-p", "abc", "left"]);
    // An empty substring matches every window, so with one window open it
    // would close that one.
    expect_die("Substring must not be empty", &["close", "-s", ""]);
}

#[test]
fn workspace_and_monitor_guards() {
    expect_die("Usage: wctl workspace", &["workspace"]);
    expect_die("Workspace index must be a number", &["workspace", "abc"]);
    expect_die(
        "Usage: wctl move-to-workspace",
        &["move-to-workspace", "123"],
    );
    expect_die(
        "Workspace index must be a number",
        &["move-to-workspace", "123", "abc"],
    );
    expect_die("Usage: wctl move-to-monitor", &["move-to-monitor"]);
    expect_die(
        "Monitor index must be a number",
        &["move-to-monitor", "123", "-1"],
    );

    expect_die("Monitor index must be a number", &["workarea", "abc"]);
    expect_die("Unknown option: --bogus", &["workarea", "--bogus"]);
    // A leading dash is an option everywhere in this CLI, so a negative index
    // is reported as one rather than as a bad number. No monitor index is
    // negative, and special-casing it would be the only place a positional
    // could start with a dash.
    expect_die("Unknown option: -1", &["workarea", "-1"]);
    expect_die("Unexpected argument: 1", &["workarea", "0", "1"]);
}

#[test]
fn wait_guards() {
    // A PID the extension would refuse, or one that can never match, is a
    // usage error here rather than an InvalidArgs reply or a full timeout.
    expect_die("PID must be a number", &["wait", "-p", "0"]);
    expect_die("PID must be a number", &["wait", "-p", "99999999999"]);
    expect_die("Substring must not be empty", &["wait", "-s", ""]);
    expect_die("Class must not be empty", &["wait", "-c", ""]);
    expect_die("Title must not be empty", &["wait", "-t", ""]);
    expect_die("Class must not be empty", &["info", "-c", ""]);
    expect_die(
        "-c requires a value; an empty one would match only a window whose class is the empty string",
        &["rules", "add", "-c", "", "tile", "left"],
    );
    expect_die(
        "-t requires a value; an empty one would match only a window whose title is the empty string",
        &["rules", "add", "-t", "", "tile", "left"],
    );
    expect_die(
        "-s requires a value; an empty one would match every window",
        &["rules", "add", "-s", "", "tile", "left"],
    );
    expect_die("Usage: wctl wait", &["wait"]);
    expect_die("Usage: wctl wait", &["wait", "-c", "a", "-t", "b"]);
    expect_die("Usage: wctl wait", &["wait", "123"]);
    expect_die("PID must be a number", &["wait", "-p", "abc"]);
    expect_die(
        "Timeout must be a positive",
        &["wait", "-c", "kitty", "--timeout", "0"],
    );
    expect_die(
        "Timeout must be a positive",
        &["wait", "-c", "kitty", "--timeout", "abc"],
    );
    expect_die(
        "Option --timeout requires a value",
        &["wait", "-c", "kitty", "--timeout"],
    );
    expect_die("Option -c requires an argument", &["wait", "-c"]);
}

#[test]
fn list_filter_guards() {
    expect_die(
        "Workspace index must be a number",
        &["list", "--workspace", "abc"],
    );
    expect_die(
        "Monitor index must be a number",
        &["list", "--monitor", "x"],
    );
    expect_die("Option --class requires an argument", &["list", "--class"]);
    expect_die("Unknown option", &["list", "--bogus"]);
    expect_die("Unexpected argument", &["list", "extra"]);
    expect_die("Unknown option", &["workspaces", "--bogus"]);
    // All-digit but wider than i64: parsing with .ok() used to drop the filter
    // silently and list every window with exit 0.
    expect_die(
        "Workspace index must be a number",
        &["list", "--workspace", "99999999999999999999"],
    );
    expect_die(
        "Monitor index must be a number",
        &["list", "--monitor", "99999999999999999999"],
    );
    expect_die("Unknown option", &["monitors", "--bogus"]);
}

#[test]
fn dispatch_guards() {
    expect_die("Unknown shell: elvish", &["completion", "elvish"]);
    expect_die("Usage: wctl completion", &["completion"]);
    expect_die("Usage: wctl completion", &["completion", ""]);
    expect_die("Unknown command", &["no-such-command"]);
}

#[test]
fn activate_guards() {
    expect_die("Usage: wctl activate", &["activate"]);
    expect_die("Window ID must be a number", &["activate", "abc"]);
    expect_die("Option -t requires a title argument", &["activate", "-t"]);
    expect_die("Unknown option: -x", &["activate", "-x"]);
    expect_die(
        "Usage: wctl activate <ID> [--no-animation]",
        &["activate", "--no-animation"],
    );
    expect_die(
        "Option --no-animation requires a window ID",
        &["activate", "-c", "kitty", "--no-animation"],
    );
    expect_die(
        "Window ID must be a number",
        &["activate", "abc", "--no-animation"],
    );
}

#[test]
fn center_accepts_every_axis_spelling() {
    // These fail later, on the absent bus, but must not be refused by the axis
    // guard: h/v are the short forms and no argument means both.
    for args in [
        vec!["center", "123", "h"],
        vec!["center", "123", "v"],
        vec!["center", "123", "horizontal"],
        vec!["center", "123", "vertical"],
        vec!["center", "123", "both"],
        vec!["center", "123"],
    ] {
        expect_not("Invalid axis", &args);
    }
}

#[test]
fn every_command_is_dispatched() {
    // A command that fell through to the dispatch default would say so; each of
    // these must fail for its own reason (usage, or the missing bus) instead.
    for command in wctl_commands() {
        let (out, _) = wctl(&[command]);
        assert!(
            !out.contains("Unknown command"),
            "{command} is not wired into the dispatch: {out}"
        );
    }
}

/// The command inventory, read from the shipped bash completion so this test
/// cannot drift from what the binary emits.
fn wctl_commands() -> Vec<&'static str> {
    let (script, code) = wctl(&["completion", "bash"]);
    assert_eq!(code, 0);
    let line: &str = Box::leak(script.into_boxed_str())
        .lines()
        .find(|line| line.trim_start().starts_with("local commands=\""))
        .expect("bash completion declares a command list");
    line.split('"')
        .nth(1)
        .expect("quoted list")
        .split(' ')
        .collect()
}

#[test]
fn help_and_version_need_no_bus() {
    for args in [vec!["help"], vec!["--help"], vec!["-h"], vec![]] {
        let (out, code) = wctl(&args);
        assert_eq!(code, 0, "wctl {args:?} should succeed");
        assert!(out.contains("Window Control CLI"), "wctl {args:?}: {out}");
        assert!(out.contains("USAGE:"), "wctl {args:?}: {out}");
    }

    for args in [vec!["version"], vec!["--version"], vec!["-v"]] {
        let (out, code) = wctl(&args);
        assert_eq!(code, 0);
        assert_eq!(
            out.trim_end(),
            format!("wctl {}", env!("CARGO_PKG_VERSION"))
        );
    }
}

#[test]
fn emitted_completions_are_valid_shell_scripts() {
    for (shell, argument) in [("bash", "bash"), ("zsh", "zsh")] {
        let (script, code) = wctl(&["completion", argument]);
        assert_eq!(code, 0);

        let Ok(mut child) = Command::new(shell)
            .arg("-n")
            .stdin(Stdio::piped())
            .stdout(Stdio::null())
            .stderr(Stdio::piped())
            .spawn()
        else {
            eprintln!("skipping {shell} syntax check: {shell} is not installed");
            continue;
        };
        child
            .stdin
            .take()
            .expect("stdin is piped")
            .write_all(script.as_bytes())
            .expect("script is written");
        let output = child.wait_with_output().expect("shell exits");
        assert!(
            output.status.success(),
            "{shell} completion is not valid {shell}: {}",
            String::from_utf8_lossy(&output.stderr)
        );
    }
}

/// `wctl rules` never opens the bus: the file is local and so is the grammar.
///
/// Every case here runs against the unreachable NO_BUS address, so a verdict
/// that arrived at all is a verdict reached without a shell -- which is the
/// whole point of `rules check`.
#[test]
fn rules_guards_and_verdicts_need_no_bus() {
    let dir = std::env::temp_dir().join(format!("wctl-rules-{}", std::process::id()));
    std::fs::create_dir_all(&dir).expect("temp dir");
    let write = |name: &str, body: &str| {
        let path = dir.join(name);
        std::fs::write(&path, body).expect("write rules file");
        path.to_string_lossy().into_owned()
    };

    let good = write(
        "good.json",
        r#"[{"match":{"class":"kitty"},"tile":"left"}]"#,
    );
    let bad = write(
        "bad.json",
        r#"[{"match":{"class":"kitty"},"tile":"middle"}]"#,
    );
    let broken = write("broken.json", r#"[{"match":{"class":"k"} "tile":"left"}]"#);
    let absent = dir.join("absent.json").to_string_lossy().into_owned();

    // A valid file passes, and says how many rules the shell would load.
    let (out, code) = wctl(&["rules", "check", "--file", &good]);
    assert_eq!(code, 0, "a valid file should pass, printed: {out}");
    assert!(out.contains("1 rule, valid"), "printed: {out}");

    // An invalid one reports the extension's own message, verbatim.
    expect_die(
        "rules[0].tile: must be one of top-left, top-center, top-right",
        &["rules", "check", "--file", &bad],
    );

    // The unknown-key message quotes a key of the file. A newline or an
    // escape in it must not forge a line or reach the terminal.
    let forged = write(
        "forged.json",
        r#"[{"match":{"class":"k"},"tile":"left","a\nError: b\u001b[2J":1}]"#,
    );
    expect_die(
        "rules[0].a?Error: b?[2J: unknown key",
        &["rules", "check", "--file", &forged],
    );

    // Malformed JSON names the file rather than the grammar.
    expect_die("not valid JSON", &["rules", "check", "--file", &broken]);

    // An absent file is not an error: no file means no rules.
    let (out, code) = wctl(&["rules", "check", "--file", &absent]);
    assert_eq!(code, 0, "an absent file is not an error, printed: {out}");
    assert!(out.contains("No rules file at"), "printed: {out}");

    // --json carries the verdict in the document, on both paths.
    let (out, code) = wctl(&["rules", "check", "--file", &good, "--json"]);
    assert_eq!(code, 0);
    assert!(out.contains("\"valid\":true"), "printed: {out}");
    let (out, code) = wctl(&["rules", "check", "--file", &bad, "--json"]);
    assert_ne!(code, 0);
    assert!(out.contains("\"valid\":false"), "printed: {out}");

    // Usage errors.
    expect_die("Usage: wctl rules", &["rules"]);
    expect_die("Unknown rules subcommand: bogus", &["rules", "bogus"]);
    expect_die(
        "Option --file requires a value",
        &["rules", "check", "--file"],
    );
    expect_die("Unknown option: --nope", &["rules", "check", "--nope"]);

    // No case above may have produced a connection error.
    expect_not("connect", &["rules", "check", "--file", &good]);
    expect_not("connect", &["rules", "check", "--file", &bad]);

    std::fs::remove_dir_all(&dir).ok();
}

/// `wctl rules list/path/add/remove`: the local file surface, still no bus.
///
/// `add` and `remove` do try the bus after writing, for the warning that the
/// loaded extension does not apply rules, but only for the DEFAULT file and
/// never when nobody answers -- so every `--file` case here must still succeed
/// against NO_BUS, and in silence.
///
/// The invariant these assert hardest is that a REFUSED add or remove leaves
/// the file byte-identical. The command rewrites the whole document, so a
/// refusal that had already truncated the file would lose rules the user wrote
/// by hand.
#[test]
fn rules_file_surface_needs_no_bus() {
    let dir = std::env::temp_dir().join(format!("wctl-rules-file-{}", std::process::id()));
    std::fs::create_dir_all(&dir).expect("temp dir");
    let file = dir.join("rules.json");
    let path = file.to_string_lossy().into_owned();
    let read = || std::fs::read_to_string(&file).unwrap_or_default();
    std::fs::remove_file(&file).ok();

    // path prints the file it would use, without needing it to exist.
    let (out, code) = wctl(&["rules", "path", "--file", &path]);
    assert_eq!(code, 0);
    assert!(out.trim().ends_with("rules.json"), "printed: {out}");

    // list on an absent file prints nothing and succeeds.
    let (out, code) = wctl(&["rules", "list", "--file", &path]);
    assert_eq!(code, 0);
    assert!(out.is_empty(), "expected no output, printed: {out}");

    // add creates the file.
    let (out, code) = wctl(&[
        "rules", "add", "--file", &path, "-c", "kitty", "tile", "left",
    ]);
    assert_eq!(code, 0, "printed: {out}");
    assert!(
        !out.contains("does not apply rules"),
        "an unreachable bus must not warn, printed: {out}"
    );
    let (out, _) = wctl(&["rules", "list", "--file", &path]);
    assert!(out.contains("class=kitty"), "printed: {out}");
    assert!(out.contains("tile left"), "printed: {out}");

    // What add writes is what check accepts: the two share one grammar.
    let (_, code) = wctl(&["rules", "check", "--file", &path]);
    assert_eq!(code, 0);

    // --at inserts and shifts the rest down.
    let (_, code) = wctl(&[
        "rules", "add", "--file", &path, "--at", "0", "-t", "Calc", "center", "both",
    ]);
    assert_eq!(code, 0);
    let (out, _) = wctl(&["rules", "list", "--file", &path]);
    let rows: Vec<&str> = out.lines().skip(1).collect();
    assert!(rows[0].contains("title=Calc"), "printed: {out}");
    assert!(rows[1].contains("class=kitty"), "printed: {out}");

    // A selector naming an existing window is refused, and names the ones
    // that work in a static file.
    let before = read();
    for selector in [vec!["focused"], vec!["123"], vec!["-p", "999"]] {
        let mut args = vec!["rules", "add", "--file", &path];
        args.extend(selector);
        args.extend(["tile", "left"]);
        let (out, code) = wctl(&args);
        assert_ne!(code, 0, "{args:?} should be refused, printed: {out}");
        assert!(out.contains("-c <CLASS>"), "printed: {out}");
    }

    // A bad action is refused by the same grammar `wctl tile` uses.
    expect_die(
        "Invalid position: middle",
        &["rules", "add", "--file", &path, "-c", "a", "tile", "middle"],
    );
    expect_die(
        "resolves to 0 pixels",
        &[
            "rules", "add", "--file", &path, "-c", "a", "place", "0", "0", "0%", "100",
        ],
    );

    // No action is a usage error, unless --workspace, --monitor or --overlay
    // gives the rule something to do.
    expect_die(
        "A rule needs an action, --workspace, --monitor or --overlay. Usage: wctl rules add",
        &["rules", "add", "--file", &path, "-c", "a"],
    );
    // --at is a position in the file, so a huge one is past the end, not a
    // malformed number.
    expect_die(
        "--at 5000000000 is past the end; the file has 2 rule(s)",
        &[
            "rules",
            "add",
            "--file",
            &path,
            "-c",
            "a",
            "tile",
            "left",
            "--at",
            "5000000000",
        ],
    );
    expect_die(
        "--at 99999999999999999999999999 is past the end; the file has 2 rule(s)",
        &[
            "rules",
            "add",
            "--file",
            &path,
            "-c",
            "a",
            "tile",
            "left",
            "--at",
            "99999999999999999999999999",
        ],
    );
    expect_die(
        "--at must be a non-negative number",
        &[
            "rules", "add", "--file", &path, "-c", "a", "tile", "left", "--at", "-1",
        ],
    );
    expect_die(
        "--workspace must be a non-negative number",
        &[
            "rules",
            "add",
            "--file",
            &path,
            "-c",
            "a",
            "--workspace",
            "2147483648",
        ],
    );

    // None of those refusals touched the file.
    assert_eq!(read(), before, "a refused add must not rewrite the file");

    let moved = dir.join("workspace-only.json");
    std::fs::remove_file(&moved).ok();
    let (out, code) = wctl(&[
        "rules",
        "add",
        "--file",
        moved.to_str().unwrap(),
        "-c",
        "Slack",
        "--workspace",
        "2",
    ]);
    assert_eq!(code, 0, "printed: {out}");
    assert_eq!(
        std::fs::read_to_string(&moved).unwrap(),
        "[\n  {\n    \"match\": {\n      \"class\": \"Slack\"\n    },\n    \"workspace\": 2\n  }\n]\n"
    );

    // --dry-run prints the document it would write and changes nothing.
    let (out, code) = wctl(&[
        "rules",
        "add",
        "--file",
        &path,
        "-c",
        "Slack",
        "tile",
        "right",
        "--dry-run",
    ]);
    assert_eq!(code, 0);
    assert!(out.contains("Slack"), "printed: {out}");
    assert_eq!(read(), before, "--dry-run must not write");

    // An earlier rule that already matches everything is a warning, not an error.
    let (out, code) = wctl(&[
        "rules", "add", "--file", &path, "-c", "kitty", "tile", "right",
    ]);
    assert_eq!(code, 0, "shadowing is a warning, printed: {out}");
    assert!(out.contains("never fire"), "printed: {out}");

    // list --json emits the file unchanged.
    let (out, code) = wctl(&["rules", "list", "--file", &path, "--json"]);
    assert_eq!(code, 0);
    assert_eq!(out, read(), "--json must emit the file unchanged");

    // remove takes the rule out and leaves the order of the rest.
    let (out, code) = wctl(&["rules", "remove", "--file", &path, "0"]);
    assert_eq!(code, 0);
    assert!(
        !out.contains("does not apply rules"),
        "an unreachable bus must not warn, printed: {out}"
    );
    let (out, _) = wctl(&["rules", "list", "--file", &path]);
    assert!(!out.contains("title=Calc"), "printed: {out}");
    assert!(out.contains("class=kitty"), "printed: {out}");

    // An index past the end is an ordinary error, as --at past the end is.
    let (out, code) = wctl(&["rules", "remove", "--file", &path, "99"]);
    assert_eq!(code, 1, "printed: {out}");

    // A file that does not parse is never rewritten: add and remove both refuse
    // rather than clobbering whatever the user actually wrote.
    let broken = r#"[{"match":{"class":"k"} "tile":"left"}]"#;
    std::fs::write(&file, broken).expect("write broken file");
    expect_die(
        "not valid JSON",
        &["rules", "add", "--file", &path, "-c", "a", "tile", "left"],
    );
    expect_die("not valid JSON", &["rules", "remove", "--file", &path, "0"]);
    assert_eq!(read(), broken, "a broken file must be left alone");

    // Same for a file that parses but does not validate.
    let invalid = r#"[{"match":{"class":"k"},"tile":"middle"}]"#;
    std::fs::write(&file, invalid).expect("write invalid file");
    expect_die(
        "rules[0].tile: must be one of",
        &["rules", "add", "--file", &path, "-c", "a", "tile", "left"],
    );
    assert_eq!(read(), invalid, "an invalid file must be left alone");

    // Nothing above may have reached the bus.
    expect_not("connect", &["rules", "list", "--file", &path]);
    expect_not("connect", &["rules", "path", "--file", &path]);

    std::fs::remove_dir_all(&dir).ok();
}

/// `wctl rules test` needs a shell, so only its guards are headless. The cases below must all fail BEFORE the bus call:
/// a usage error, and a rules file that does not validate.
#[test]
fn rules_test_guards_fire_before_the_bus() {
    let dir = std::env::temp_dir().join(format!("wctl-rules-test-{}", std::process::id()));
    std::fs::create_dir_all(&dir).expect("temp dir");
    let file = dir.join("rules.json");
    let path = file.to_string_lossy().into_owned();
    std::fs::write(&file, r#"[{"match":{"class":"kitty"},"tile":"left"}]"#).expect("write");

    // A missing selector is a usage error, not a connection error.
    expect_die(
        "Usage: wctl rules test",
        &["rules", "test", "--file", &path],
    );
    // So is an argument after the selector.
    expect_die(
        "Usage: wctl rules test",
        &["rules", "test", "--file", &path, "-c", "kitty", "extra"],
    );
    expect_die(
        "Unknown option: --bogus",
        &["rules", "test", "--file", &path, "--bogus"],
    );
    expect_not("connect", &["rules", "test", "--file", &path]);

    // The rules file is read before the window is looked up, so a file that
    // does not validate is reported as itself rather than as a dead bus.
    std::fs::write(&file, r#"[{"match":{"class":"k"},"tile":"middle"}]"#).expect("write");
    expect_die(
        "rules[0].tile: must be one of",
        &["rules", "test", "--file", &path, "-c", "kitty"],
    );

    std::fs::remove_dir_all(&dir).ok();
}

/// The user guide states this: add and remove write through a symbolic link, say into
/// a dotfiles repository. The link stays, unchanged, and its target gets the
/// change.
#[test]
fn rules_add_and_remove_write_through_a_symbolic_link() {
    let dir = std::env::temp_dir().join(format!("wctl-rules-link-{}", std::process::id()));
    std::fs::remove_dir_all(&dir).ok();
    std::fs::create_dir_all(&dir).expect("temp dir");
    let target = dir.join("dotfiles.json");
    let link = dir.join("rules.json");
    std::fs::write(&target, "[]\n").expect("write");
    std::os::unix::fs::symlink("dotfiles.json", &link).expect("symlink");

    let (out, code) = wctl(&[
        "rules",
        "add",
        "--file",
        link.to_str().unwrap(),
        "-c",
        "kitty",
        "tile",
        "left",
    ]);
    assert_eq!(code, 0, "printed: {out}");
    assert_eq!(
        std::fs::read_link(&link).unwrap(),
        Path::new("dotfiles.json")
    );
    assert!(std::fs::read_to_string(&target).unwrap().contains("kitty"));

    // An index past the end is an ordinary error, like --at past the end.
    for index in ["7", "99999999999999999999999999"] {
        let (out, code) = wctl(&["rules", "remove", "--file", link.to_str().unwrap(), index]);
        assert_eq!(code, 1, "printed: {out}");
        assert!(
            out.contains(&format!("No rule {index}; the file has 1 rule(s)")),
            "printed: {out}"
        );
    }

    // remove does the same.
    std::fs::remove_file(&link).expect("remove");
    std::fs::write(&target, r#"[{"match":{"class":"a"},"tile":"left"}]"#).expect("write");
    std::os::unix::fs::symlink("dotfiles.json", &link).expect("symlink");
    let (out, code) = wctl(&["rules", "remove", "--file", link.to_str().unwrap(), "0"]);
    assert_eq!(code, 0, "printed: {out}");
    assert_eq!(
        std::fs::read_link(&link).unwrap(),
        Path::new("dotfiles.json")
    );
    assert_eq!(std::fs::read_to_string(&target).unwrap(), "[]\n");

    // A link made before its target exists, into a directory that does not
    // exist yet either: add creates both and keeps the link.
    std::fs::remove_file(&link).expect("remove");
    std::os::unix::fs::symlink("dotfiles/rules.json", &link).expect("symlink");
    let (out, code) = wctl(&[
        "rules",
        "add",
        "--file",
        link.to_str().unwrap(),
        "-c",
        "kitty",
        "tile",
        "left",
    ]);
    assert_eq!(code, 0, "printed: {out}");
    assert_eq!(
        std::fs::read_link(&link).unwrap(),
        Path::new("dotfiles/rules.json")
    );
    assert!(std::fs::read_to_string(dir.join("dotfiles/rules.json"))
        .unwrap()
        .contains("kitty"));

    std::fs::remove_dir_all(&dir).ok();
}

/// add and remove write a new file; it keeps the mode of the one it replaces.
#[test]
fn rules_add_keeps_the_file_mode() {
    use std::os::unix::fs::PermissionsExt;
    let dir = std::env::temp_dir().join(format!("wctl-rules-mode-{}", std::process::id()));
    std::fs::remove_dir_all(&dir).ok();
    std::fs::create_dir_all(&dir).expect("temp dir");
    let file = dir.join("rules.json");
    std::fs::write(&file, "[]\n").expect("write");
    std::fs::set_permissions(&file, std::fs::Permissions::from_mode(0o600)).expect("chmod");

    let (out, code) = wctl(&[
        "rules",
        "add",
        "--file",
        file.to_str().unwrap(),
        "-c",
        "kitty",
        "tile",
        "left",
    ]);
    assert_eq!(code, 0, "printed: {out}");
    assert_eq!(file.metadata().unwrap().permissions().mode() & 0o777, 0o600);

    std::fs::remove_dir_all(&dir).ok();
}

#[test]
fn rules_check_file_option_guards() {
    // An option is not a path: this used to report "No rules file at --json".
    expect_die(
        "Option --file requires a value",
        &["rules", "check", "--file", "--json"],
    );
    expect_die(
        "Option --file requires a value",
        &["rules", "check", "--file", ""],
    );

    // With --json a file that cannot be read is reported as a document too.
    let dir = std::env::temp_dir().join(format!("wctl-rules-unreadable-{}", std::process::id()));
    std::fs::create_dir_all(&dir).expect("temp dir");
    let (out, code) = wctl(&["rules", "check", "--json", "--file", dir.to_str().unwrap()]);
    assert_eq!(code, 1);
    assert!(out.contains(r#""error":"Cannot read"#), "printed: {out}");
    assert!(out.contains(r#""valid":false"#), "printed: {out}");
    std::fs::remove_dir_all(&dir).ok();
}

#[test]
fn rules_add_overlay_writes_the_key_with_or_without_an_action() {
    let dir = std::env::temp_dir().join(format!("wctl-rules-overlay-{}", std::process::id()));
    std::fs::remove_dir_all(&dir).ok();
    std::fs::create_dir_all(&dir).expect("temp dir");
    let file = dir.join("rules.json");
    let path = file.to_str().unwrap();

    // Alone, --overlay is the rule's action; the flag may come before the match.
    let (out, code) = wctl(&[
        "rules",
        "add",
        "--file",
        path,
        "--overlay",
        "-c",
        "quake",
        "--dry-run",
    ]);
    assert_eq!(code, 0, "printed: {out}");
    let document: serde_json::Value = serde_json::from_str(&out).expect("JSON");
    assert_eq!(
        document,
        serde_json::json!([{"match": {"class": "quake"}, "overlay": true}])
    );
    assert!(!file.exists(), "--dry-run must not write");

    // With an action, the key follows it in the order the spec lists them.
    let (out, code) = wctl(&[
        "rules",
        "add",
        "--file",
        path,
        "-c",
        "quake",
        "place",
        "center",
        "top",
        "1800",
        "100%",
        "--monitor",
        "0",
        "--overlay",
    ]);
    assert_eq!(code, 0, "printed: {out}");
    let text = std::fs::read_to_string(&file).expect("written");
    let keys: Vec<&str> = ["\"match\"", "\"place\"", "\"monitor\"", "\"overlay\": true"]
        .into_iter()
        .filter(|key| text.contains(key))
        .collect();
    assert_eq!(keys.len(), 4, "written: {text}");
    assert!(
        text.find("\"place\"") < text.find("\"monitor\"")
            && text.find("\"monitor\"") < text.find("\"overlay\""),
        "written: {text}"
    );

    let (out, code) = wctl(&["rules", "list", "--file", path]);
    assert_eq!(code, 0, "printed: {out}");
    let mut lines = out.lines();
    assert!(
        lines.next().unwrap_or("").trim_end().ends_with("OVERLAY"),
        "printed: {out}"
    );
    assert!(
        lines.next().unwrap_or("").trim_end().ends_with("yes"),
        "printed: {out}"
    );
    std::fs::remove_dir_all(&dir).ok();
}

/// `rules apply` checks its selector before the bus, and with or without one
/// it then needs the bus.
#[test]
fn rules_apply_guards_fire_before_any_bus_call() {
    // apply reads the extension's own rules file, so the test points
    // XDG_CONFIG_HOME at a directory of its own instead of the developer's.
    let config = std::env::temp_dir().join(format!("wctl-rules-apply-{}", std::process::id()));
    std::fs::remove_dir_all(&config).ok();
    let rules_dir = config.join("gnome-window-control");
    std::fs::create_dir_all(&rules_dir).expect("temp dir");
    let apply = |args: &[&str]| -> (String, i32) {
        let output = Command::new(cargo_bin("wctl"))
            .args(args)
            .env("DBUS_SESSION_BUS_ADDRESS", NO_BUS)
            .env("XDG_CONFIG_HOME", &config)
            .env_remove("WCTL_TIMEOUT")
            .output()
            .expect("wctl runs");
        let mut combined = String::from_utf8_lossy(&output.stdout).into_owned();
        combined.push_str(&String::from_utf8_lossy(&output.stderr));
        (combined, output.status.code().unwrap_or(-1))
    };
    let expect = |needle: &str, args: &[&str]| {
        let (out, code) = apply(args);
        assert_ne!(code, 0, "wctl {args:?} should fail, printed: {out}");
        assert!(
            out.contains(needle),
            "wctl {args:?} should mention {needle:?}, printed: {out}"
        );
    };

    expect("Usage: wctl rules apply", &["rules", "apply", "1", "2"]);
    expect("Option -c requires an argument", &["rules", "apply", "-c"]);
    assert!(!apply(&["rules", "apply", "1", "2"]).0.contains("connect"));
    // No file means no rules, so the call goes on to the bus.
    expect("connect", &["rules", "apply"]);
    expect("connect", &["rules", "apply", "focused"]);

    // A file the extension would refuse is reported before any bus call.
    std::fs::write(
        rules_dir.join("rules.json"),
        r#"[{"match":{"class":"a"},"tile":"nowhere"}]"#,
    )
    .expect("write rules file");
    expect("rules[0].tile: must be one of", &["rules", "apply"]);
    assert!(!apply(&["rules", "apply"]).0.contains("connect"));
    std::fs::remove_dir_all(&config).ok();
}

#[test]
fn rules_add_min_width_goes_into_match() {
    let dir = std::env::temp_dir().join(format!("wctl-rules-min-width-{}", std::process::id()));
    std::fs::remove_dir_all(&dir).ok();
    std::fs::create_dir_all(&dir).expect("temp dir");
    let file = dir.join("rules.json");
    let path = file.to_str().unwrap();

    let (out, code) = wctl(&[
        "rules",
        "add",
        "--file",
        path,
        "--min-width",
        "3000",
        "-c",
        "kitty",
        "place",
        "center",
        "top",
        "75%",
        "100%",
        "--dry-run",
    ]);
    assert_eq!(code, 0, "printed: {out}");
    let document: serde_json::Value = serde_json::from_str(&out).expect("JSON");
    assert_eq!(
        document,
        serde_json::json!([{
            "match": {"class": "kitty", "min_width": 3000},
            "place": ["center", "top", "75%", "100%"],
        }])
    );

    for bad in ["0", "-1", "wide", "2147483648"] {
        expect_die(
            "--min-width must be a positive number",
            &[
                "rules",
                "add",
                "--file",
                path,
                "-c",
                "kitty",
                "tile",
                "left",
                "--min-width",
                bad,
            ],
        );
    }
    expect_die(
        "Option --min-width requires a value",
        &["rules", "add", "--file", path, "-c", "kitty", "--min-width"],
    );
    // min_width names no window, so it is no action either.
    expect_die(
        "A rule needs an action",
        &[
            "rules",
            "add",
            "--file",
            path,
            "-c",
            "kitty",
            "--min-width",
            "3000",
        ],
    );

    // Written ahead of the general rule, the general one is no shadow of it;
    // the reverse order is.
    let (out, code) = wctl(&[
        "rules", "add", "--file", path, "-c", "kitty", "tile", "left",
    ]);
    assert_eq!(code, 0, "printed: {out}");
    let (out, code) = wctl(&[
        "rules",
        "add",
        "--file",
        path,
        "-c",
        "kitty",
        "tile",
        "right",
        "--min-width",
        "3000",
    ]);
    assert_eq!(code, 0, "printed: {out}");
    assert!(out.contains("will never fire"), "printed: {out}");
    let (out, code) = wctl(&[
        "rules",
        "add",
        "--file",
        path,
        "-c",
        "kitty",
        "tile",
        "right",
        "--min-width",
        "3000",
        "--at",
        "0",
    ]);
    assert_eq!(code, 0, "printed: {out}");
    assert!(!out.contains("will never fire"), "printed: {out}");

    let (out, code) = wctl(&["rules", "list", "--file", path]);
    assert_eq!(code, 0, "printed: {out}");
    assert!(
        out.lines()
            .nth(1)
            .unwrap_or("")
            .contains("class=kitty min_width=3000"),
        "printed: {out}"
    );
    std::fs::remove_dir_all(&dir).ok();
}

#[test]
fn rules_add_takes_a_title_prefix_and_suffix() {
    let dir = std::env::temp_dir().join(format!("wctl-rules-prefix-{}", std::process::id()));
    std::fs::remove_dir_all(&dir).ok();
    std::fs::create_dir_all(&dir).expect("temp dir");
    let file = dir.join("rules.json");
    let path = file.to_str().unwrap();

    let (out, code) = wctl(&[
        "rules",
        "add",
        "--file",
        path,
        "--title-prefix",
        "Report",
        "tile",
        "left",
    ]);
    assert_eq!(code, 0, "printed: {out}");
    let (out, code) = wctl(&[
        "rules",
        "add",
        "--file",
        path,
        "--title-suffix",
        "- Mozilla Firefox",
        "tile",
        "right",
    ]);
    assert_eq!(code, 0, "printed: {out}");
    let (out, _) = wctl(&["rules", "list", "--file", path]);
    assert!(out.contains("title_prefix=Report"), "printed: {out}");
    assert!(
        out.contains("title_suffix=- Mozilla Firefox"),
        "printed: {out}"
    );

    // A rule under a more general one never fires: a title that starts with
    // "Report 2026" also starts with "Report".
    let (out, code) = wctl(&[
        "rules",
        "add",
        "--file",
        path,
        "--title-prefix",
        "Report 2026",
        "tile",
        "center",
    ]);
    assert_eq!(code, 0, "printed: {out}");
    assert!(
        out.contains("rule 0 already matches every window"),
        "printed: {out}"
    );

    // The value of a selector option is never read as an option name.
    let (out, code) = wctl(&[
        "rules",
        "add",
        "--file",
        path,
        "--title-suffix",
        "--at",
        "tile",
        "left",
    ]);
    assert_eq!(code, 0, "printed: {out}");
    let (out, _) = wctl(&["rules", "list", "--file", path]);
    assert!(out.contains("title_suffix=--at"), "printed: {out}");

    expect_die(
        "--title-prefix requires a value",
        &[
            "rules",
            "add",
            "--file",
            path,
            "--title-prefix",
            "",
            "tile",
            "left",
        ],
    );
    std::fs::remove_dir_all(&dir).ok();
}

#[test]
fn rules_add_takes_a_class_prefix() {
    let dir = std::env::temp_dir().join(format!("wctl-rules-class-prefix-{}", std::process::id()));
    std::fs::remove_dir_all(&dir).ok();
    std::fs::create_dir_all(&dir).expect("temp dir");
    let file = dir.join("rules.json");
    let path = file.to_str().unwrap();

    let (out, code) = wctl(&[
        "rules",
        "add",
        "--file",
        path,
        "--class-prefix",
        "chrome-github.com__",
        "place",
        "center",
        "top",
        "50%",
        "100%",
    ]);
    assert_eq!(code, 0, "printed: {out}");
    let (out, _) = wctl(&["rules", "list", "--file", path]);
    assert!(
        out.contains("class_prefix=chrome-github.com__"),
        "printed: {out}"
    );
    // A class that starts with the prefix is covered by the earlier rule.
    let (out, code) = wctl(&[
        "rules",
        "add",
        "--file",
        path,
        "-c",
        "chrome-github.com__hk9890_revier-Default",
        "tile",
        "left",
    ]);
    assert_eq!(code, 0, "printed: {out}");
    assert!(
        out.contains("rule 0 already matches every window"),
        "printed: {out}"
    );

    // The value of a selector option is never read as an option name.
    let (out, code) = wctl(&[
        "rules",
        "add",
        "--file",
        path,
        "--class-prefix",
        "--at",
        "tile",
        "left",
    ]);
    assert_eq!(code, 0, "printed: {out}");
    let (out, _) = wctl(&["rules", "list", "--file", path]);
    assert!(out.contains("class_prefix=--at"), "printed: {out}");
    // Nor is it taken for --dry-run or --file.
    let (out, code) = wctl(&[
        "rules",
        "add",
        "--file",
        path,
        "--class-prefix",
        "--dry-run",
        "tile",
        "left",
    ]);
    assert_eq!(code, 0, "printed: {out}");
    let (out, code) = wctl(&[
        "rules",
        "add",
        "--title-prefix",
        "--file",
        "tile",
        "left",
        "--file",
        path,
    ]);
    assert_eq!(code, 0, "printed: {out}");
    let (out, _) = wctl(&["rules", "list", "--file", path]);
    assert!(out.contains("class_prefix=--dry-run"), "printed: {out}");
    assert!(out.contains("title_prefix=--file"), "printed: {out}");

    expect_die(
        "--class-prefix requires a value",
        &[
            "rules",
            "add",
            "--file",
            path,
            "--class-prefix",
            "",
            "tile",
            "left",
        ],
    );
    std::fs::remove_dir_all(&dir).ok();
}

#[test]
fn an_argument_that_is_not_utf8_is_an_error_not_a_crash() {
    use std::os::unix::ffi::OsStrExt;
    let output = Command::new(cargo_bin("wctl"))
        .args(["list", "-t"])
        .arg(std::ffi::OsStr::from_bytes(b"caf\xe9"))
        .env("DBUS_SESSION_BUS_ADDRESS", NO_BUS)
        .output()
        .expect("wctl runs");
    let stderr = String::from_utf8_lossy(&output.stderr);
    assert_eq!(output.status.code(), Some(1), "stderr: {stderr}");
    assert!(
        stderr.contains("Arguments must be valid UTF-8"),
        "stderr: {stderr}"
    );
}

#[test]
fn rules_add_leaves_no_temporary_file_when_the_write_fails() {
    let dir = std::env::temp_dir().join(format!("wctl-rules-write-fail-{}", std::process::id()));
    std::fs::remove_dir_all(&dir).ok();
    std::fs::create_dir_all(&dir).expect("temp dir");
    let file = dir.join("rules.json");
    // A file size limit of 0 makes the write of the temporary file fail after
    // it has been created, the way a full disk does.
    let script = format!(
        "trap '' XFSZ; ulimit -f 0; exec \"$0\" rules add --file '{}' -c kitty tile left",
        file.display()
    );
    let output = Command::new("bash")
        .args(["-c", &script])
        .arg(cargo_bin("wctl"))
        .env("DBUS_SESSION_BUS_ADDRESS", NO_BUS)
        .output()
        .expect("bash runs");
    assert_eq!(output.status.code(), Some(1), "{output:?}");
    let left: Vec<_> = std::fs::read_dir(&dir)
        .expect("read dir")
        .map(|entry| entry.expect("entry").file_name())
        .collect();
    assert!(left.is_empty(), "left behind: {left:?}");
    std::fs::remove_dir_all(&dir).ok();
}

/// The words the bash completion offers for `line`, the last word being the
/// one completed. A stub `_init_completion` fills the four variables the
/// bash-completion package would, so the package need not be installed. The
/// window IDs come from this binary, which finds no bus.
fn bash_completions(line: &[&str]) -> Vec<String> {
    let binary = cargo_bin("wctl");
    let script = format!(
        r#"_init_completion() {{
    words=("${{COMP_WORDS[@]}}"); cword=$COMP_CWORD
    cur=${{words[cword]}}; prev=${{words[cword-1]}}
}}
source <(wctl completion bash)
COMP_WORDS=({words}); COMP_CWORD={cword}
_wctl
[[ ${{#COMPREPLY[@]}} -eq 0 ]] || printf '%s\n' "${{COMPREPLY[@]}}""#,
        words = line
            .iter()
            .map(|word| format!("'{word}'"))
            .collect::<Vec<_>>()
            .join(" "),
        cword = line.len() - 1,
    );
    let path = format!(
        "{}:{}",
        binary.parent().expect("binary directory").display(),
        std::env::var("PATH").unwrap_or_default()
    );
    let output = Command::new("bash")
        .args(["-c", &script])
        .env("PATH", path)
        .env("DBUS_SESSION_BUS_ADDRESS", NO_BUS)
        .output()
        .expect("bash runs");
    String::from_utf8_lossy(&output.stdout)
        .lines()
        .map(String::from)
        .collect()
}

#[test]
fn bash_completion_offers_what_each_position_accepts() {
    let offered = bash_completions(&["wctl", ""]);
    assert!(
        offered.iter().any(|word| word == "--timeout"),
        "{offered:?}"
    );
    // The global option is taken once.
    let offered = bash_completions(&["wctl", "--timeout", "2", ""]);
    assert!(offered.iter().any(|word| word == "list"), "{offered:?}");
    assert!(
        !offered.iter().any(|word| word == "--timeout"),
        "{offered:?}"
    );
    // --no-animation may come before the window.
    let offered = bash_completions(&["wctl", "minimize", "--no-animation", ""]);
    assert!(offered.iter().any(|word| word == "focused"), "{offered:?}");
    // A flag already given is not offered again.
    assert_eq!(bash_completions(&["wctl", "info", "111", ""]), ["--json"]);
    assert!(bash_completions(&["wctl", "info", "111", "--json", ""]).is_empty());

    // The value of an option is the user's own word: nothing is offered.
    for line in [
        &["wctl", "tile", "-c", ""][..],
        &["wctl", "wait", "-c", ""],
        &["wctl", "list", "--class", ""],
        &["wctl", "resolve-place", "--monitor", ""],
        &["wctl", "rules", "test", "-c", ""],
    ] {
        let offered = bash_completions(line);
        assert!(offered.is_empty(), "{line:?} offered {offered:?}");
    }
    // A flag takes no position, on either side of the selector, and a
    // selector with its value fills the <WINDOW> slot.
    assert_eq!(
        bash_completions(&["wctl", "place", "--json", "111", ""]),
        ["left", "center", "right"]
    );
    assert_eq!(
        bash_completions(&["wctl", "tile", "--settled", ""]),
        ["focused", "-c", "-t", "-s", "-p"]
    );
    assert_eq!(
        bash_completions(&["wctl", "tile", "--json", "-c", "kitty", ""]),
        [
            "top-left",
            "top-center",
            "top-right",
            "left",
            "center",
            "right",
            "bottom-left",
            "bottom-center",
            "bottom-right",
            "wide-left",
            "wide-right"
        ]
    );
}

/// `script` run by `shell` with `flags`, in a new, empty home folder, with
/// this wctl first on PATH: stdout and stderr, or None when the shell is not
/// installed.
fn run_in_new_home(
    tag: &str,
    shell: &str,
    flags: &[&str],
    script: &str,
) -> Option<(String, String)> {
    let home = std::env::temp_dir().join(format!("wctl-home-{tag}-{}", std::process::id()));
    std::fs::remove_dir_all(&home).ok();
    std::fs::create_dir_all(&home).expect("home folder");
    let binary = cargo_bin("wctl");
    let path = format!(
        "{}:{}",
        binary.parent().expect("binary directory").display(),
        std::env::var("PATH").unwrap_or_default()
    );
    let output = Command::new(shell)
        .args(flags)
        .args(["-c", script])
        .env("HOME", &home)
        .env("PATH", path)
        .env("DBUS_SESSION_BUS_ADDRESS", NO_BUS)
        .output();
    std::fs::remove_dir_all(&home).ok();
    let Ok(output) = output else {
        eprintln!("skipping: {shell} is not installed");
        return None;
    };
    Some((
        String::from_utf8_lossy(&output.stdout).into_owned(),
        String::from_utf8_lossy(&output.stderr).into_owned(),
    ))
}

/// The bash lines of `wctl help` work as written on an account that has no
/// completions folder yet.
#[test]
fn bash_completion_installs_as_the_help_says() {
    let install = [
        "mkdir -p ~/.local/share/bash-completion/completions",
        "wctl completion bash > ~/.local/share/bash-completion/completions/wctl",
    ];
    let (help, _) = wctl(&["help"]);
    for line in install {
        assert!(help.contains(line), "help has no {line:?}");
    }
    let (script, _) = wctl(&["completion", "bash"]);
    let check = format!(
        "{}\ncat ~/.local/share/bash-completion/completions/wctl",
        install.join("\n")
    );
    if let Some((stdout, stderr)) =
        run_in_new_home("bash-install", "bash", &["--norc", "--noprofile"], &check)
    {
        assert_eq!(stderr, "");
        assert_eq!(stdout, script);
    }
}

/// The zsh lines of `wctl help` work as written on an account that has no
/// site-functions folder yet: compinit finds `_wctl` and registers it for
/// wctl, and the first call of the autoloaded function completes. Sourced
/// after compinit, the script registers itself and completes nothing.
#[test]
fn zsh_completion_installs_as_the_help_says() {
    let install = [
        "mkdir -p ~/.local/share/zsh/site-functions",
        "wctl completion zsh > ~/.local/share/zsh/site-functions/_wctl",
    ];
    let before_compinit = "fpath=(~/.local/share/zsh/site-functions $fpath)";
    let (help, _) = wctl(&["help"]);
    for line in install.iter().chain([&before_compinit]) {
        assert!(help.contains(line), "help has no {line:?}");
    }
    // A stand-in _arguments shows that the autoloaded body called the
    // completion rather than compdef: the real one needs a completion widget.
    let autoloaded = format!(
        "{}\n{before_compinit}\nautoload -Uz compinit\ncompinit -D -u\n\
         print -r -- \"registered: ${{_comps[wctl]-}}\"\n\
         _arguments() {{ print -r -- completes }}\n_wctl",
        install.join("\n")
    );
    let sourced = "autoload -Uz compinit\ncompinit -D -u\nsource <(wctl completion zsh)\n\
         print -r -- \"registered: ${_comps[wctl]-}\"";
    for (tag, script, expected) in [
        (
            "zsh-fpath",
            autoloaded.as_str(),
            "registered: _wctl\ncompletes\n",
        ),
        ("zsh-source", sourced, "registered: _wctl\n"),
    ] {
        if let Some((stdout, stderr)) = run_in_new_home(tag, "zsh", &["-f"], script) {
            assert_eq!(stderr, "", "{tag}");
            assert_eq!(stdout, expected, "{tag}");
        }
    }
}

/// `wctl` with XDG_CONFIG_HOME at `config`, so the default rules file and
/// rules.d are the test's own: stdout, stderr, exit code.
fn wctl_config(config: &Path, args: &[&str]) -> (String, String, i32) {
    let output = Command::new(cargo_bin("wctl"))
        .args(args)
        .env("DBUS_SESSION_BUS_ADDRESS", NO_BUS)
        .env("HOME", config)
        .env("XDG_CONFIG_HOME", config)
        .env_remove("WCTL_TIMEOUT")
        .output()
        .expect("wctl runs");
    (
        String::from_utf8_lossy(&output.stdout).into_owned(),
        String::from_utf8_lossy(&output.stderr).into_owned(),
        output.status.code().unwrap_or(-1),
    )
}

/// A config folder with rules.json and the given rules.d files.
fn rules_config(tag: &str, user: &str, drop_ins: &[(&str, &str)]) -> std::path::PathBuf {
    let config = std::env::temp_dir().join(format!("wctl-{tag}-{}", std::process::id()));
    std::fs::remove_dir_all(&config).ok();
    let folder = config.join("gnome-window-control");
    std::fs::create_dir_all(folder.join("rules.d")).expect("temp dir");
    std::fs::write(folder.join("rules.json"), user).expect("write rules.json");
    for (name, body) in drop_ins {
        std::fs::write(folder.join("rules.d").join(name), body).expect("write drop-in");
    }
    config
}

/// Without a drop-in file, `rules check` prints what it printed before
/// rules.d existed, byte for byte. Names the extension skips, a directory
/// named like a drop-in and a FIFO are no drop-in files.
#[test]
fn rules_check_without_drop_ins_reads_as_before() {
    let config = rules_config(
        "rules-no-dropins",
        r#"[{"match":{"class":"kitty"},"tile":"left"},{"match":{"class":"foot"},"tile":"right"}]"#,
        &[],
    );
    let folder = config.join("gnome-window-control");
    let user = folder.join("rules.json").display().to_string();
    let text = format!("{user}: 2 rules, valid\n");
    let json = format!(r#"{{"path":"{user}","exists":true,"valid":true,"rules":2}}"#) + "\n";

    let check_reads_as_before = |when: &str| {
        assert_eq!(
            wctl_config(&config, &["rules", "check"]),
            (text.clone(), String::new(), 0),
            "{when}"
        );
        assert_eq!(
            wctl_config(&config, &["rules", "check", "--json"]),
            (json.clone(), String::new(), 0),
            "{when}"
        );
    };
    check_reads_as_before("an empty rules.d");

    let skipped = r#"[{"match":{"class":"a"},"tile":"middle"}]"#;
    let drop_ins = folder.join("rules.d");
    for name in [".tool.json.123", "tool.json~", "tool.json.off", "notes.txt"] {
        std::fs::write(drop_ins.join(name), skipped).expect("write skipped file");
    }
    std::fs::create_dir(drop_ins.join("folder.json")).expect("directory");
    let status = Command::new("mkfifo")
        .arg(drop_ins.join("pipe.json"))
        .status()
        .expect("mkfifo runs");
    assert!(status.success());
    check_reads_as_before("only names the extension skips");

    std::fs::remove_dir_all(&config).ok();
}

/// Every file is reported, a broken drop-in by its path, and the exit code
/// says whether any file is broken. A rule of an earlier file that shadows a
/// later file's rule is a warning, not a failure.
#[test]
fn rules_check_reports_every_drop_in() {
    let config = rules_config(
        "rules-check-dropins",
        r#"[{"match":{"class":"kitty"},"tile":"left"}]"#,
        &[
            ("a.json", r#"[{"match":{"class":"kitty"},"tile":"right"}]"#),
            ("b.json", r#"[{"match":{"class":"foot"},"tile":"middle"}]"#),
            ("c.json", r#"[{"match":{"class":"mpv"},"tile":"center"}]"#),
        ],
    );
    let folder = config.join("gnome-window-control");
    let path = |name: &str| folder.join(name).display().to_string();

    let (out, err, code) = wctl_config(&config, &["rules", "check"]);
    assert_eq!(code, 1, "stdout: {out} stderr: {err}");
    assert_eq!(
        out,
        format!(
            "{}: 1 rule, valid\n{}: 1 rule, valid\n{}: 1 rule, valid\n",
            path("rules.json"),
            path("rules.d/a.json"),
            path("rules.d/c.json")
        )
    );
    assert!(
        err.contains(&format!(
            "Error: {}: rules[0].tile: must be one of",
            path("rules.d/b.json")
        )),
        "stderr: {err}"
    );
    assert!(
        err.contains(
            "Warning: rule 0 of rules.json already matches every window rule 0 of \
             rules.d/a.json would"
        ),
        "stderr: {err}"
    );

    let (out, _, code) = wctl_config(&config, &["rules", "check", "--json"]);
    assert_eq!(code, 1, "stdout: {out}");
    let report: serde_json::Value = serde_json::from_str(&out).expect("one JSON document");
    // The top-level fields are rules.json's own, which is valid.
    assert_eq!(report["path"], path("rules.json"));
    assert_eq!(report["valid"], true);
    assert_eq!(report["rules"], 1);
    assert!(report.get("error").is_none(), "report: {report}");
    let drop_ins = report["dropins"].as_array().expect("dropins");
    assert_eq!(drop_ins.len(), 3);
    assert_eq!(drop_ins[0]["path"], path("rules.d/a.json"));
    assert_eq!(drop_ins[0]["valid"], true);
    assert_eq!(drop_ins[0]["rules"], 1);
    assert_eq!(drop_ins[1]["valid"], false);
    assert!(drop_ins[1]["error"]
        .as_str()
        .is_some_and(|error| error.contains("rules[0].tile: must be one of")));

    // Without the broken file every file is valid.
    std::fs::remove_file(folder.join("rules.d/b.json")).expect("remove");
    let (out, _, code) = wctl_config(&config, &["rules", "check", "--json"]);
    assert_eq!(code, 0, "stdout: {out}");
    let report: serde_json::Value = serde_json::from_str(&out).expect("one JSON document");
    assert_eq!(report["valid"], true);
    assert_eq!(report["dropins"].as_array().map(Vec::len), Some(2));

    std::fs::remove_dir_all(&config).ok();
}

/// The table holds every file with its SOURCE and the index within that
/// file. `--json` stays rules.json alone, and `--file` one file.
#[test]
fn rules_list_merges_the_drop_ins() {
    let user = r#"[{"match":{"class":"kitty"},"tile":"left"}]"#;
    let config = rules_config(
        "rules-list-dropins",
        user,
        &[
            (
                "a.json",
                r#"[{"match":{"class":"foot"},"tile":"right"},{"match":{"class":"mpv"},"center":"both"}]"#,
            ),
            ("broken.json", "[{"),
        ],
    );
    let folder = config.join("gnome-window-control");

    let (out, err, code) = wctl_config(&config, &["rules", "list"]);
    assert_eq!(code, 0, "stderr: {err}");
    let lines: Vec<&str> = out.lines().collect();
    assert_eq!(lines.len(), 4, "printed: {out}");
    assert!(lines[0].starts_with("SOURCE  "), "printed: {out}");
    let cells = |line: &str| {
        line.split_whitespace()
            .take(3)
            .collect::<Vec<_>>()
            .join(" ")
    };
    assert_eq!(cells(lines[1]), "rules.json 0 class=kitty");
    assert_eq!(cells(lines[2]), "rules.d/a.json 0 class=foot");
    assert_eq!(cells(lines[3]), "rules.d/a.json 1 class=mpv");
    assert!(
        err.contains(&format!(
            "Warning: {}: not valid JSON",
            folder.join("rules.d/broken.json").display()
        )),
        "stderr: {err}"
    );

    let (out, err, code) = wctl_config(&config, &["rules", "list", "--json"]);
    assert_eq!((code, err.as_str()), (0, ""));
    let listed: serde_json::Value = serde_json::from_str(&out).expect("JSON");
    assert_eq!(
        listed,
        serde_json::from_str::<serde_json::Value>(user).unwrap()
    );

    let path = folder.join("rules.json").display().to_string();
    let (out, _, _) = wctl_config(&config, &["rules", "list", "--file", &path]);
    assert!(out.starts_with("INDEX "), "printed: {out}");
    assert_eq!(out.lines().count(), 2, "printed: {out}");

    std::fs::remove_dir_all(&config).ok();
}

#[test]
fn rules_path_dir_prints_the_drop_in_folder() {
    let config = rules_config("rules-path-dir", "[]", &[]);
    let (out, _, code) = wctl_config(&config, &["rules", "path", "--dir"]);
    assert_eq!(code, 0);
    assert_eq!(
        out,
        format!(
            "{}\n",
            config.join("gnome-window-control/rules.d").display()
        )
    );
    let (_, err, code) = wctl_config(&config, &["rules", "path", "--dir", "--file", "x.json"]);
    assert_eq!(code, 1);
    assert!(
        err.contains("Option --dir cannot be used with --file"),
        "stderr: {err}"
    );
    std::fs::remove_dir_all(&config).ok();
}

/// `add --file` into rules.d creates the folder, sees the rules of the files
/// loaded before it, and leaves no temporary file there. `remove` counts in
/// the one file.
#[test]
fn rules_add_and_remove_into_rules_d() {
    let config = std::env::temp_dir().join(format!("wctl-rules-add-dropin-{}", std::process::id()));
    std::fs::remove_dir_all(&config).ok();
    let folder = config.join("gnome-window-control");
    std::fs::create_dir_all(&folder).expect("temp dir");
    std::fs::write(
        folder.join("rules.json"),
        r#"[{"match":{"class":"kitty"},"tile":"right"}]"#,
    )
    .expect("write rules.json");
    let drop_ins = folder.join("rules.d");
    let tool = drop_ins.join("tool.json").display().to_string();

    let (out, err, code) = wctl_config(
        &config,
        &[
            "rules", "add", "--file", &tool, "-c", "kitty", "tile", "left",
        ],
    );
    assert_eq!(code, 0, "stderr: {err}");
    assert_eq!(out, format!("Added rule 0 to {tool}\n"));
    assert!(
        err.contains("Warning: rule 0 of rules.json already matches every window this rule would"),
        "stderr: {err}"
    );

    let (_, err, _) = wctl_config(
        &config,
        &[
            "rules", "add", "--file", &tool, "-c", "foot", "tile", "left",
        ],
    );
    assert_eq!(err, "");

    // A rule added to rules.json comes first, so it can shadow a drop-in's.
    let (_, err, code) = wctl_config(&config, &["rules", "add", "-c", "foot", "tile", "right"]);
    assert_eq!(code, 0, "stderr: {err}");
    assert!(
        err.contains("Warning: this rule matches every window rule 1 of rules.d/tool.json would"),
        "stderr: {err}"
    );

    let (out, _, code) = wctl_config(&config, &["rules", "remove", "--file", &tool, "0"]);
    assert_eq!(code, 0);
    assert_eq!(out, format!("Removed rule 0 from {tool}\n"));
    let (out, _, _) = wctl_config(&config, &["rules", "list"]);
    let rows: Vec<String> = out
        .lines()
        .skip(1)
        .map(|line| {
            line.split_whitespace()
                .take(3)
                .collect::<Vec<_>>()
                .join(" ")
        })
        .collect();
    assert_eq!(
        rows,
        [
            "rules.json 0 class=kitty",
            "rules.json 1 class=foot",
            "rules.d/tool.json 0 class=foot"
        ]
    );

    let left: Vec<_> = std::fs::read_dir(&drop_ins)
        .expect("rules.d")
        .map(|entry| entry.expect("entry").file_name())
        .collect();
    assert_eq!(left, ["tool.json"]);

    // A name the extension skips is written, with a warning.
    let off = drop_ins.join("tool.json.off").display().to_string();
    let (_, err, code) = wctl_config(
        &config,
        &["rules", "add", "--file", &off, "-c", "mpv", "tile", "left"],
    );
    assert_eq!(code, 0, "stderr: {err}");
    assert!(
        err.contains("The extension does not read tool.json.off in rules.d"),
        "stderr: {err}"
    );

    std::fs::remove_dir_all(&config).ok();
}

/// A rules.d that cannot be listed is a warning, and rules.json is still
/// checked as before: the extension still loads it then.
#[test]
fn rules_check_warns_when_rules_d_cannot_be_listed() {
    let config = rules_config(
        "rules-d-not-a-folder",
        r#"[{"match":{"class":"kitty"},"tile":"left"}]"#,
        &[],
    );
    let folder = config.join("gnome-window-control");
    std::fs::remove_dir(folder.join("rules.d")).expect("remove rules.d");
    std::fs::write(folder.join("rules.d"), "").expect("a file named rules.d");

    let (out, err, code) = wctl_config(&config, &["rules", "check"]);
    assert_eq!(
        (out, code),
        (
            format!("{}: 1 rule, valid\n", folder.join("rules.json").display()),
            0
        )
    );
    assert!(
        err.starts_with(&format!(
            "Warning: Cannot read {}",
            folder.join("rules.d").display()
        )),
        "stderr: {err}"
    );

    std::fs::remove_dir_all(&config).ok();
}

/// A relative `--file` into a rules.d that does not exist yet is a drop-in
/// file too, so rules.json is checked for a rule that shadows the new one.
#[test]
fn rules_add_relative_file_into_a_missing_rules_d() {
    let config =
        std::env::temp_dir().join(format!("wctl-rules-add-relative-{}", std::process::id()));
    std::fs::remove_dir_all(&config).ok();
    let folder = config.join("gnome-window-control");
    std::fs::create_dir_all(&folder).expect("temp dir");
    std::fs::write(
        folder.join("rules.json"),
        r#"[{"match":{"class":"kitty"},"tile":"right"}]"#,
    )
    .expect("write rules.json");

    let output = Command::new(cargo_bin("wctl"))
        .args([
            "rules",
            "add",
            "--file",
            "rules.d/tool.json",
            "-c",
            "kitty",
            "tile",
            "left",
        ])
        .current_dir(&folder)
        .env("DBUS_SESSION_BUS_ADDRESS", NO_BUS)
        .env("XDG_CONFIG_HOME", &config)
        .env_remove("WCTL_TIMEOUT")
        .output()
        .expect("wctl runs");
    let err = String::from_utf8_lossy(&output.stderr);
    assert_eq!(output.status.code(), Some(0), "stderr: {err}");
    assert!(
        err.contains("Warning: rule 0 of rules.json already matches every window this rule would"),
        "stderr: {err}"
    );
    assert!(folder.join("rules.d/tool.json").is_file());

    std::fs::remove_dir_all(&config).ok();
}

const BROKEN_TILE: &str = r#"[{"match":{"class":"a"},"tile":"middle"}]"#;

/// A broken rules.json beside a drop-in file is skipped with a warning, as
/// the extension skips it, and the drop-in still loads. Without a drop-in it
/// is the error it was before rules.d existed.
#[test]
fn rules_list_skips_a_broken_rules_json_beside_a_drop_in() {
    let config = rules_config(
        "rules-list-broken-user",
        BROKEN_TILE,
        &[("a.json", r#"[{"match":{"class":"foot"},"tile":"right"}]"#)],
    );
    let folder = config.join("gnome-window-control");
    let user = folder.join("rules.json").display().to_string();

    let (out, err, code) = wctl_config(&config, &["rules", "list"]);
    assert_eq!(code, 0, "stderr: {err}");
    assert!(
        err.starts_with(&format!("Warning: {user}: rules[0].tile: must be one of")),
        "stderr: {err}"
    );
    let rows: Vec<String> = out
        .lines()
        .skip(1)
        .map(|line| {
            line.split_whitespace()
                .take(3)
                .collect::<Vec<_>>()
                .join(" ")
        })
        .collect();
    assert_eq!(rows, ["rules.d/a.json 0 class=foot"], "printed: {out}");

    // test and apply skip it too and go on to the bus.
    for args in [&["rules", "test", "-c", "foot"][..], &["rules", "apply"]] {
        let (_, err, code) = wctl_config(&config, args);
        assert_ne!(code, 0);
        assert!(
            err.starts_with(&format!("Warning: {user}: rules[0].tile: must be one of")),
            "{args:?} stderr: {err}"
        );
        assert!(err.contains("connect"), "{args:?} stderr: {err}");
    }

    std::fs::remove_file(folder.join("rules.d/a.json")).expect("remove");
    let (out, err, code) = wctl_config(&config, &["rules", "list"]);
    assert_eq!((out.as_str(), code), ("", 1));
    assert!(
        err.starts_with("Error: rules[0].tile: must be one of"),
        "stderr: {err}"
    );
    for args in [&["rules", "test", "-c", "foot"][..], &["rules", "apply"]] {
        let (_, err, code) = wctl_config(&config, args);
        assert_eq!(code, 1, "{args:?} stderr: {err}");
        assert!(
            err.starts_with("Error: rules[0].tile: must be one of"),
            "{args:?} stderr: {err}"
        );
        assert!(!err.contains("connect"), "{args:?} stderr: {err}");
    }

    std::fs::remove_dir_all(&config).ok();
}

/// Beside a drop-in file, a broken rules.json is named by its path like a
/// broken drop-in, and `--json` reports it in the top-level fields alone.
#[test]
fn rules_check_names_a_broken_rules_json_beside_a_drop_in() {
    let config = rules_config(
        "rules-check-broken-user",
        BROKEN_TILE,
        &[("a.json", r#"[{"match":{"class":"foot"},"tile":"right"}]"#)],
    );
    let folder = config.join("gnome-window-control");
    let path = |name: &str| folder.join(name).display().to_string();

    let (out, err, code) = wctl_config(&config, &["rules", "check"]);
    assert_eq!(code, 1, "stdout: {out} stderr: {err}");
    assert_eq!(out, format!("{}: 1 rule, valid\n", path("rules.d/a.json")));
    assert!(
        err.starts_with(&format!(
            "Error: {}: rules[0].tile: must be one of",
            path("rules.json")
        )),
        "stderr: {err}"
    );

    let (out, _, code) = wctl_config(&config, &["rules", "check", "--json"]);
    assert_eq!(code, 1, "stdout: {out}");
    let report: serde_json::Value = serde_json::from_str(&out).expect("one JSON document");
    assert_eq!(report["path"], path("rules.json"));
    assert_eq!(report["exists"], true);
    assert_eq!(report["valid"], false);
    assert!(report["error"]
        .as_str()
        .is_some_and(|error| error.contains("rules[0].tile: must be one of")));
    assert_eq!(
        report["dropins"],
        serde_json::json!([{"path": path("rules.d/a.json"), "valid": true, "rules": 1}])
    );

    std::fs::remove_dir_all(&config).ok();
}

/// Beside a drop-in file, a missing rules.json is only that: the drop-in
/// rules are loaded. Without one it reads as before.
#[test]
fn rules_check_without_rules_json_beside_a_drop_in() {
    let config = rules_config(
        "rules-check-no-user",
        "[]",
        &[("a.json", r#"[{"match":{"class":"foot"},"tile":"right"}]"#)],
    );
    let folder = config.join("gnome-window-control");
    let user = folder.join("rules.json");
    std::fs::remove_file(&user).expect("remove rules.json");

    let (out, err, code) = wctl_config(&config, &["rules", "check"]);
    assert_eq!(
        (out, err.as_str(), code),
        (
            format!(
                "No rules file at {}\n{}: 1 rule, valid\n",
                user.display(),
                folder.join("rules.d/a.json").display()
            ),
            "",
            0
        )
    );

    std::fs::remove_file(folder.join("rules.d/a.json")).expect("remove");
    let (out, _, code) = wctl_config(&config, &["rules", "check"]);
    assert_eq!(
        (out, code),
        (
            format!("No rules file at {}; no rules are loaded\n", user.display()),
            0
        )
    );

    std::fs::remove_dir_all(&config).ok();
}

/// `add --file` that names the default rules.json is an add to rules.json,
/// so a drop-in rule the new rule shadows is a warning.
#[test]
fn rules_add_file_naming_rules_json_sees_the_drop_ins() {
    let config = rules_config(
        "rules-add-file-user",
        "[]",
        &[("a.json", r#"[{"match":{"class":"foot"},"tile":"right"}]"#)],
    );
    let user = config
        .join("gnome-window-control/rules.json")
        .display()
        .to_string();

    let (out, err, code) = wctl_config(
        &config,
        &[
            "rules", "add", "--file", &user, "-c", "foot", "tile", "left",
        ],
    );
    assert_eq!(code, 0, "stderr: {err}");
    assert_eq!(out, format!("Added rule 0 to {user}\n"));
    assert!(
        err.contains("Warning: this rule matches every window rule 0 of rules.d/a.json would"),
        "stderr: {err}"
    );

    std::fs::remove_dir_all(&config).ok();
}

/// A rules.json that is no regular file, as a FIFO, is refused before it is
/// opened: a read of a FIFO does not finish.
#[test]
fn rules_refuse_a_fifo_rules_json() {
    let config = rules_config("rules-fifo-user", "[]", &[]);
    let user = config.join("gnome-window-control/rules.json");
    std::fs::remove_file(&user).expect("remove rules.json");
    if !Command::new("mkfifo")
        .arg(&user)
        .status()
        .is_ok_and(|status| status.success())
    {
        eprintln!("skipped: mkfifo is not available");
        std::fs::remove_dir_all(&config).ok();
        return;
    }
    let message = format!(
        "Error: Cannot read {}: not a regular file\n",
        user.display()
    );
    let fifo = user.display().to_string();
    for args in [
        &["rules", "check"][..],
        &["rules", "list"],
        &["rules", "check", "--file", &fifo],
        &["rules", "add", "-c", "kitty", "tile", "left"],
    ] {
        let (out, err, code) = wctl_config(&config, args);
        assert_eq!(
            (out.as_str(), err.as_str(), code),
            ("", message.as_str(), 1),
            "{args:?}"
        );
    }

    // Another FIFO is a pipe the caller fills, as `--file <(...)` is.
    let pipe = config.join("piped.json");
    assert!(Command::new("mkfifo")
        .arg(&pipe)
        .status()
        .is_ok_and(|status| status.success()));
    let writer = {
        let pipe = pipe.clone();
        std::thread::spawn(move || std::fs::write(pipe, "[]"))
    };
    let (out, err, code) = wctl_config(
        &config,
        &["rules", "check", "--file", &pipe.display().to_string()],
    );
    writer.join().unwrap().expect("write the pipe");
    assert_eq!(
        (out, err.as_str(), code),
        (format!("{}: 0 rules, valid\n", pipe.display()), "", 0)
    );

    std::fs::remove_dir_all(&config).ok();
}

/// A rules.json linked into a dotfiles repository is rules.json when
/// `--file` names the link target, so a drop-in rule the new rule shadows is
/// a warning.
#[test]
fn rules_add_file_naming_the_rules_json_link_target_sees_the_drop_ins() {
    let config = rules_config(
        "rules-add-link-target",
        "[]",
        &[("a.json", r#"[{"match":{"class":"foot"},"tile":"right"}]"#)],
    );
    let user = config.join("gnome-window-control/rules.json");
    let target = config.join("dotfiles.json");
    std::fs::rename(&user, &target).expect("move rules.json");
    std::os::unix::fs::symlink(&target, &user).expect("symlink");
    let target = target.display().to_string();

    let (out, err, code) = wctl_config(
        &config,
        &[
            "rules", "add", "--file", &target, "-c", "foot", "tile", "left",
        ],
    );
    assert_eq!(code, 0, "stderr: {err}");
    assert_eq!(out, format!("Added rule 0 to {target}\n"));
    assert!(
        err.contains("Warning: this rule matches every window rule 0 of rules.d/a.json would"),
        "stderr: {err}"
    );

    std::fs::remove_dir_all(&config).ok();
}

/// A rule with a newer key added to a drop-in earns no refused-key text. With
/// no bus, no capability warning is printed either; `write_warnings` in
/// commands/rules.rs pins the warnings of a shell that answers.
#[test]
fn rules_add_into_rules_d_prints_no_refused_key_text() {
    let config = rules_config("rules-add-dropin-newer-key", "[]", &[]);
    let tool = config
        .join("gnome-window-control/rules.d/tool.json")
        .display()
        .to_string();

    let (out, err, code) = wctl_config(
        &config,
        &[
            "rules",
            "add",
            "--file",
            &tool,
            "--class-prefix",
            "chrome-",
            "tile",
            "left",
            "--overlay",
        ],
    );
    assert_eq!(code, 0, "stderr: {err}");
    assert_eq!(out, format!("Added rule 0 to {tool}\n"));
    assert_eq!(err, "");

    std::fs::remove_dir_all(&config).ok();
}

/// A rule added ahead of a narrower rule of the same file takes its windows:
/// `rules add --at` names the rule it turns off.
#[test]
fn rules_add_at_warns_about_the_later_rule_it_shadows() {
    let config = rules_config("rules-add-at-shadow", "[]", &[]);
    let user = config.join("gnome-window-control/rules.json");

    let (stdout, stderr, code) = wctl_config(
        &config,
        &[
            "rules",
            "add",
            "-c",
            "kitty",
            "place",
            "center",
            "top",
            "75%",
            "100%",
            "--min-width",
            "3000",
        ],
    );
    assert_eq!(
        (stdout, stderr.as_str(), code),
        (format!("Added rule 0 to {}\n", user.display()), "", 0)
    );

    let (stdout, stderr, code) = wctl_config(
        &config,
        &[
            "rules", "add", "-c", "kitty", "place", "center", "top", "100%", "100%", "--at", "0",
        ],
    );
    assert_eq!(
        (stdout, stderr.as_str(), code),
        (
            format!("Added rule 0 to {}\n", user.display()),
            "Warning: this rule matches every window rule 1 would, \
             and the first match wins, so rule 1 will never fire.\n",
            0
        )
    );
    std::fs::remove_dir_all(&config).ok();
}

/// A later rule that a rule of an earlier file turns off already is not one
/// the new rule turns off.
#[test]
fn rules_add_at_names_no_later_rule_an_earlier_file_shadows() {
    let config = rules_config(
        "rules-add-at-earlier-file",
        r#"[{"match":{"class":"kitty"},"tile":"left"}]"#,
        &[(
            "50-x.json",
            r#"[{"match":{"class":"kitty","title":"vim"},"center":"both"}]"#,
        )],
    );
    let drop_in = config.join("gnome-window-control/rules.d/50-x.json");
    let drop_in_arg = drop_in.display().to_string();

    let (stdout, stderr, code) = wctl_config(
        &config,
        &[
            "rules",
            "add",
            "--file",
            &drop_in_arg,
            "--at",
            "0",
            "-c",
            "kitty",
            "tile",
            "right",
        ],
    );
    assert_eq!(code, 0, "stderr: {stderr}");
    assert_eq!(stdout, format!("Added rule 0 to {}\n", drop_in.display()));
    assert_eq!(
        stderr,
        "Warning: rule 0 of rules.json already matches every window this rule would, \
         and the first match wins, so the new rule will never fire.\n"
    );
    std::fs::remove_dir_all(&config).ok();
}

/// A rewrite would put U+FFFD over a byte that is not UTF-8, so `rules add`
/// and `rules remove` refuse the file and leave it as it is.
#[test]
fn rules_add_and_remove_refuse_a_file_that_is_not_utf8() {
    let config = rules_config("rules-not-utf8", "", &[]);
    let user = config.join("gnome-window-control/rules.json");
    // "Café" in Latin-1: e9 alone is no UTF-8 sequence.
    let latin1 = b"[{\"match\":{\"title\":\"Caf\xe9\"},\"tile\":\"left\"}]\n";
    std::fs::write(&user, latin1).expect("write rules.json");
    let refusal = format!(
        "Error: Cannot rewrite {}: it has bytes that are not UTF-8, and they would be lost. \
         Save the file as UTF-8 first.\n",
        user.display()
    );

    for args in [
        &["rules", "add", "-c", "kitty", "tile", "right"][..],
        &["rules", "remove", "0"],
    ] {
        assert_eq!(
            wctl_config(&config, args),
            (String::new(), refusal.clone(), 1),
            "{args:?}"
        );
        assert_eq!(std::fs::read(&user).expect("read rules.json"), latin1);
    }
    std::fs::remove_dir_all(&config).ok();
}

/// A rules.json with a second name is refused with nothing changed: a rename
/// would leave the other name on the old rules.
#[cfg(unix)]
#[test]
fn rules_add_and_remove_refuse_a_hard_linked_file() {
    use std::os::unix::fs::MetadataExt;

    let rule = r#"[{"match": {"class": "foot"}, "tile": "right"}]"#;
    let config = rules_config("rules-hard-link", rule, &[]);
    let user = config.join("gnome-window-control/rules.json");
    let second_name = config.join("second-name.json");
    std::fs::hard_link(&user, &second_name).expect("hard link");
    let inode = std::fs::metadata(&user).expect("stat rules.json").ino();
    let refusal = format!(
        "Error: Cannot rewrite {}: it has a second hard link, which the rewrite would cut off. \
         Replace the hard link with a symlink, or edit the file by hand.\n",
        user.display()
    );

    for args in [
        &["rules", "add", "-c", "kitty", "tile", "left"][..],
        &["rules", "remove", "0"][..],
    ] {
        let (stdout, stderr, code) = wctl_config(&config, args);
        assert_eq!(
            (stdout.as_str(), stderr.as_str(), code),
            ("", refusal.as_str(), 1),
            "{args:?}"
        );
        assert_eq!(
            std::fs::read_to_string(&user).expect("read rules.json"),
            rule
        );
        let metadata = std::fs::metadata(&user).expect("stat rules.json");
        assert_eq!((metadata.ino(), metadata.nlink()), (inode, 2));
    }
    std::fs::remove_dir_all(&config).ok();
}
