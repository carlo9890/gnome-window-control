// SPDX-FileCopyrightText: 2026 hko9890
// SPDX-License-Identifier: MIT
//! How a command reports failure.
//!
//! The bash implementation had two distinct failure shapes and the tests pin
//! both, so they stay separate here:
//!
//!   die "..."           -> "Error: ..." on stderr, exit 1
//!   report_result       -> the message on stdout, exit 1
//!
//! Colour follows the bash rule exactly: it is decided by whether *stdout* is a
//! terminal, even for the message that goes to stderr.

use std::fmt;
use std::io::{IsTerminal, Write};

const RED: &str = "\x1b[31m";
const RESET: &str = "\x1b[0m";

#[derive(Debug)]
pub enum Fail {
    /// Printed to stderr with the red "Error:" prefix.
    Error(String),
    /// Printed to stdout verbatim (the report_result failure path).
    Plain(String),
}

impl Fail {
    pub fn error(msg: impl Into<String>) -> Self {
        Fail::Error(msg.into())
    }

    pub fn plain(msg: impl Into<String>) -> Self {
        Fail::Plain(msg.into())
    }

    /// Write the message on the right stream and return the process exit code.
    pub fn report(&self) -> i32 {
        match self {
            Fail::Error(msg) => {
                let color = std::io::stdout().is_terminal();
                let mut err = std::io::stderr();
                if color {
                    let _ = writeln!(err, "{RED}Error:{RESET} {msg}");
                } else {
                    let _ = writeln!(err, "Error: {msg}");
                }
            }
            Fail::Plain(msg) => println!("{msg}"),
        }
        1
    }
}

impl fmt::Display for Fail {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Fail::Error(msg) | Fail::Plain(msg) => write!(f, "{msg}"),
        }
    }
}

pub type Result<T> = std::result::Result<T, Fail>;
