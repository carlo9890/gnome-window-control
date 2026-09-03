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
//!
//! On top of that, a failure carries an exit code that classifies it, so a
//! caller can tell "no such window" from "the shell refused" from "the shell
//! never answered" without matching English prose. `EXIT_ERROR` stays the
//! default for everything unclassified -- usage errors above all -- so a script
//! testing for a non-zero status is unaffected and only the classified cases
//! moved.

use std::fmt;
use std::io::{IsTerminal, Write};

const RED: &str = "\x1b[31m";
const RESET: &str = "\x1b[0m";

/// Anything not classified below: a usage error, a malformed reply, an
/// ambiguous selector. This is the default, and it is what every failure
/// returned before the classified codes existed.
pub const EXIT_ERROR: i32 = 1;
/// The window, workspace or monitor the command names does not exist.
pub const EXIT_NOT_FOUND: i32 = 2;
/// The target exists and the shell declined to act on it -- a frame pinned by
/// maximize, fullscreen or tiling, or a window mutter holds on all workspaces.
pub const EXIT_REFUSED: i32 = 3;
/// The reply did not arrive in time: `wait` expired, or the shell's main loop
/// is wedged.
pub const EXIT_TIMEOUT: i32 = 4;
/// Nothing is serving the interface: the extension is disabled or not
/// installed.
pub const EXIT_NO_EXTENSION: i32 = 5;

/// Which stream the message belongs on.
enum Stream {
    /// stderr, with the red "Error:" prefix (the bash `die` shape).
    Stderr,
    /// stdout, verbatim (the bash `report_result` shape).
    Stdout,
}

pub struct Fail {
    message: String,
    stream: Stream,
    code: i32,
}

impl Fail {
    pub fn error(msg: impl Into<String>) -> Self {
        Fail {
            message: msg.into(),
            stream: Stream::Stderr,
            code: EXIT_ERROR,
        }
    }

    pub fn plain(msg: impl Into<String>) -> Self {
        Fail {
            message: msg.into(),
            stream: Stream::Stdout,
            code: EXIT_ERROR,
        }
    }

    /// Classify this failure with one of the `EXIT_*` codes.
    pub fn with_code(mut self, code: i32) -> Self {
        self.code = code;
        self
    }

    /// Write the message on the right stream and return the process exit code.
    pub fn report(&self) -> i32 {
        match self.stream {
            Stream::Stderr => {
                let color = std::io::stdout().is_terminal();
                let mut err = std::io::stderr();
                if color {
                    let _ = writeln!(err, "{RED}Error:{RESET} {}", self.message);
                } else {
                    let _ = writeln!(err, "Error: {}", self.message);
                }
            }
            Stream::Stdout => println!("{}", self.message),
        }
        self.code
    }
}

impl fmt::Debug for Fail {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "Fail({}, exit {})", self.message, self.code)
    }
}

impl fmt::Display for Fail {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "{}", self.message)
    }
}

pub type Result<T> = std::result::Result<T, Fail>;
