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
use std::process::{Command, Stdio};

use assert_cmd::cargo::cargo_bin;

/// A bus address that cannot connect, so a command that tries is obvious.
const NO_BUS: &str = "unix:path=/nonexistent/wctl-test-bus";

fn wctl(args: &[&str]) -> (String, i32) {
    let output = Command::new(cargo_bin("wctl"))
        .args(args)
        .env("DBUS_SESSION_BUS_ADDRESS", NO_BUS)
        .output()
        .expect("wctl runs");
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
}

#[test]
fn selector_option_guards() {
    expect_die("Unknown option: -x", &["tile", "-x", "left"]);
    expect_die("Option -c requires an argument", &["tile", "-c"]);
    expect_die("PID must be a number", &["tile", "-p", "abc", "left"]);
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
}

#[test]
fn wait_guards() {
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
    expect_die("Unknown command", &["no-such-command"]);
}

#[test]
fn activate_guards() {
    expect_die("Usage: wctl activate", &["activate"]);
    expect_die("Window ID must be a number", &["activate", "abc"]);
    expect_die("Option -t requires a title argument", &["activate", "-t"]);
    expect_die("Unknown option: -x", &["activate", "-x"]);
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
