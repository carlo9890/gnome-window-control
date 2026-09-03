// SPDX-FileCopyrightText: 2026 hko9890
// SPDX-License-Identifier: MIT
//! Window documents and the per-invocation context.
//!
//! Windows are kept as `serde_json::Value` rather than a struct: `list --json`
//! and `info --json` must emit the extension's document unchanged, including
//! key order (the crate enables serde_json's `preserve_order`), and a struct
//! would have to mirror every field to round-trip it.

use std::rc::Rc;

use serde_json::Value;

use crate::dbus::Bus;
use crate::fail::{Fail, Result, EXIT_NOT_FOUND};

pub type Window = Value;

pub fn parse_array(json: &str, what: &str) -> Result<Vec<Value>> {
    match serde_json::from_str::<Value>(json) {
        Ok(Value::Array(items)) => Ok(items),
        Ok(_) | Err(_) => Err(Fail::error(format!("Failed to parse {what} JSON: {json}"))),
    }
}

pub fn text<'a>(window: &'a Value, key: &str) -> &'a str {
    window.get(key).and_then(Value::as_str).unwrap_or("")
}

pub fn number(window: &Value, key: &str) -> i64 {
    window.get(key).and_then(Value::as_i64).unwrap_or(0)
}

pub fn flag(window: &Value, key: &str) -> bool {
    window.get(key).and_then(Value::as_bool).unwrap_or(false)
}

pub fn id(window: &Value) -> u64 {
    window.get("id").and_then(Value::as_u64).unwrap_or(0)
}

/// The window's frame rectangle as (x, y, width, height).
pub fn frame_rect(window: &Value) -> (i64, i64, i64, i64) {
    let rect = window.get("frame_rect");
    let field = |key: &str| {
        rect.and_then(|r| r.get(key))
            .and_then(Value::as_i64)
            .unwrap_or(0)
    };
    (field("x"), field("y"), field("width"), field("height"))
}

/// State shared by the selector resolver and the command that follows it.
///
/// `ListDetailed` is fetched at most once per invocation: resolving `-c kitty`
/// needs the window list, and so does the `info` that runs right after it.
pub struct Ctx {
    pub bus: Bus,
    windows: Option<Rc<Vec<Window>>>,
}

impl Ctx {
    pub fn new() -> Self {
        Ctx {
            bus: Bus::new(),
            windows: None,
        }
    }

    pub fn windows(&mut self) -> Result<Rc<Vec<Window>>> {
        if let Some(cached) = &self.windows {
            return Ok(Rc::clone(cached));
        }
        let json = self.bus.call_json("ListDetailed")?;
        let windows = Rc::new(parse_array(&json, "window list")?);
        self.windows = Some(Rc::clone(&windows));
        Ok(windows)
    }

    /// Discard the cached window list so the next `windows()` refetches.
    ///
    /// Needed when a call has already been made against the extension and the
    /// answer says the world changed: the cache was taken before that call, so
    /// reusing it would diagnose the failure from stale data.
    pub fn invalidate_windows(&mut self) {
        self.windows = None;
    }

    /// Find a window by ID, with the bash client's "Error: Window not found"
    /// wording (used by the commands that need the window's own geometry).
    pub fn window_by_id(&mut self, id: u64) -> Result<Window> {
        let windows = self.windows()?;
        windows
            .iter()
            .find(|w| crate::model::id(w) == id)
            .cloned()
            .ok_or_else(|| Fail::error(format!("Window not found: {id}")).with_code(EXIT_NOT_FOUND))
    }
}
