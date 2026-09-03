// SPDX-FileCopyrightText: 2026 hko9890
// SPDX-License-Identifier: MIT
//! Block until a matching window is shown, then print its ID.
//!
//! The extension defers the D-Bus reply until mutter has mapped and placed the
//! window. That matters: a geometry command on a window that exists but is not
//! yet shown is overridden by the initial placement, which is exactly the
//! "launch, then place" script this command exists for.

use std::time::Duration;

use crate::fail::{Fail, Result, EXIT_TIMEOUT};
use crate::model::Ctx;
use crate::selector;

const USAGE: &str =
    "Usage: wctl wait -c <CLASS> | -t <TITLE> | -s <SUBSTR> | -p <PID> [--timeout <SECONDS>]";

/// Seconds the client waits beyond the extension's own timeout, as a guard
/// against a shell that never replies at all.
const CLIENT_GRACE_SECONDS: u64 = 5;

pub fn wait(ctx: &mut Ctx, args: &[String]) -> Result<()> {
    let mut kind: Option<selector::Kind> = None;
    let mut value = String::new();
    let mut timeout = "10".to_string();

    let mut index = 0;
    while index < args.len() {
        let arg = args[index].as_str();
        match arg {
            "-c" | "-t" | "-s" | "-p" => {
                if args.len() - index < 2 {
                    return Err(Fail::error(format!("Option {arg} requires an argument")));
                }
                if kind.is_some() {
                    return Err(Fail::error(USAGE));
                }
                kind = Some(selector::kind_for_option(arg)?);
                value = args[index + 1].clone();
                index += 2;
            }
            "--timeout" => {
                if args.len() - index < 2 {
                    return Err(Fail::error("Option --timeout requires a value"));
                }
                timeout = args[index + 1].clone();
                index += 2;
            }
            _ => return Err(Fail::error(USAGE)),
        }
    }

    let Some(kind) = kind else {
        return Err(Fail::error(USAGE));
    };
    if kind == selector::Kind::Pid && !selector::is_window_id(&value) {
        return Err(Fail::error("PID must be a number"));
    }

    let seconds = parse_timeout(&timeout)?;
    let client_bound = Duration::from_secs(seconds as u64 + CLIENT_GRACE_SECONDS);

    let id = ctx
        .bus
        .wait_for_window(kind.name(), &value, seconds * 1000, client_bound)?;

    if id == 0 {
        return Err(Fail::error(format!(
            "Timed out after {seconds}s waiting for a window ({kind}: {value})"
        ))
        .with_code(EXIT_TIMEOUT));
    }

    println!("{id}");
    Ok(())
}

fn parse_timeout(token: &str) -> Result<i32> {
    let positive = token.starts_with(|c: char| c.is_ascii_digit() && c != '0')
        && token.chars().all(|c| c.is_ascii_digit());
    let seconds = if positive {
        token.parse::<i32>().ok()
    } else {
        None
    };
    // A timeout large enough to overflow the millisecond argument is refused
    // here rather than by the extension.
    seconds
        .filter(|s| s.checked_mul(1000).is_some())
        .ok_or_else(|| Fail::error("Timeout must be a positive number of seconds"))
}
