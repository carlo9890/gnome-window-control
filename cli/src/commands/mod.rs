// SPDX-FileCopyrightText: 2026 hko9890
// SPDX-License-Identifier: MIT
//! The commands, grouped the way `wctl help` groups them.

pub mod completion;
pub mod geometry;
pub mod query;
pub mod state;
pub mod wait;
pub mod wsmon;

use serde_json::Value;

use crate::fail::{Fail, Result, EXIT_NOT_FOUND};

/// Report the result of a boolean D-Bus action.
///
/// The extension answers `false` for a window it cannot find, so the failure
/// message goes to stdout -- the shape the bash client's `report_result` had,
/// and the shape the suites assert. The caller supplies the `Fail`, because it
/// is the caller that knows which `EXIT_*` code the refusal deserves.
pub fn report(ok: bool, success: &str, failure: Fail) -> Result<()> {
    if ok {
        println!("{success}");
        Ok(())
    } else {
        Err(failure)
    }
}

/// `report` for a failure that costs something to build.
///
/// The geometry commands have to ask the extension why it refused, so the
/// message must not be built on the success path.
pub fn report_with(ok: bool, success: &str, failure: impl FnOnce() -> Fail) -> Result<()> {
    if ok {
        println!("{success}");
        Ok(())
    } else {
        Err(failure())
    }
}

pub fn not_found(id: u64) -> Fail {
    Fail::plain(format!("Window not found: {id}")).with_code(EXIT_NOT_FOUND)
}

/// Parse the lone optional `--json` flag shared by several commands.
pub fn parse_json_flag(args: &[String]) -> Result<bool> {
    let mut json = false;
    for arg in args {
        match arg.as_str() {
            "--json" => json = true,
            other if other.starts_with('-') => {
                return Err(Fail::error(format!("Unknown option: {other}")))
            }
            other => return Err(Fail::error(format!("Unexpected argument: {other}"))),
        }
    }
    Ok(json)
}

/// Render a JSON scalar the way `jq -r` renders it, for table cells.
pub fn cell(value: Option<&Value>) -> String {
    match value {
        Some(Value::String(text)) => text.clone(),
        Some(Value::Null) | None => "null".to_string(),
        Some(other) => other.to_string(),
    }
}
