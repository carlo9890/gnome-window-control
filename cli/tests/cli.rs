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

    // An explicit flag is a usage error whatever the command, because the user
    // typed it for this invocation.
    expect_die(
        "--timeout must be a positive number of seconds",
        &["--timeout", "abc", "help"],
    );
}

#[test]
fn wctl_timeout_environment_guards() {
    for value in ["abc", "0", "2.5"] {
        let (out, code) = wctl_env(&["list"], Some(value));
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
    expect_die("Usage: wctl focus", &["focus", "focused", "junk"]);
    expect_die("Usage: wctl close", &["close", "-c", "kitty", "now"]);
    expect_die("Usage: wctl workspace", &["workspace", "1", "2"]);
}

/// A window titled `--json` is still addressable: the output flags are taken
/// from the argument list, but never out of a selector's value slot.
#[test]
fn output_flags_are_not_taken_from_a_selector_value() {
    expect_not("Usage", &["tile", "-t", "--json", "left"]);
    expect_not(
        "Usage",
        &["place", "-s", "--settled", "0", "0", "100", "100"],
    );
    expect_not("Usage", &["info", "-t", "--json"]);
    expect_not("Usage", &["center", "--json", "-c", "--settled"]);
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
/// `add` and `remove` do try the bus after writing, for the extension-version
/// warning, but an unreachable bus is silent -- so every case here must still
/// succeed against NO_BUS.
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

    // A selector naming an existing window is refused, and names the three
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

    // None of those refusals touched the file.
    assert_eq!(read(), before, "a refused add must not rewrite the file");

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
    let (_, code) = wctl(&["rules", "remove", "--file", &path, "0"]);
    assert_eq!(code, 0);
    let (out, _) = wctl(&["rules", "list", "--file", &path]);
    assert!(!out.contains("title=Calc"), "printed: {out}");
    assert!(out.contains("class=kitty"), "printed: {out}");

    // An index past the end is a not-found, not a usage error.
    let (_, code) = wctl(&["rules", "remove", "--file", &path, "99"]);
    assert_eq!(code, 2, "out-of-range index should be EXIT_NOT_FOUND");

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

/// `wctl rules test` is the one subcommand that needs a shell, so only its
/// guards are headless. The cases below must all fail BEFORE the bus call:
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
