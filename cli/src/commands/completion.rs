// SPDX-FileCopyrightText: 2026 hko9890
// SPDX-License-Identifier: MIT
//! Shell completion scripts.
//!
//! The scripts are hand written and embedded rather than generated, because
//! they complete live window IDs from `wctl list --json` -- something no
//! generator produces. They are checked into `cli/completions/` so a shell can
//! lint them (`bash -n`, `zsh -n`) without running the binary.

use crate::fail::{Fail, Result};

pub const BASH: &str = include_str!("../../completions/wctl.bash");
pub const ZSH: &str = include_str!("../../completions/_wctl");

pub fn completion(args: &[String]) -> Result<()> {
    match args.first().map(String::as_str).unwrap_or("") {
        "bash" => {
            print!("{BASH}");
            Ok(())
        }
        "zsh" => {
            print!("{ZSH}");
            Ok(())
        }
        "" => Err(Fail::error("Usage: wctl completion <bash|zsh>")),
        other => Err(Fail::error(format!(
            "Unknown shell: {other}. Supported: bash, zsh"
        ))),
    }
}
