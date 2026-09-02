// SPDX-FileCopyrightText: 2026 hko9890
// SPDX-License-Identifier: MIT
//! The D-Bus client for the Window Control extension.
//!
//! The session connection is opened lazily, so every argument-validation error
//! is reported without touching the bus. That is what lets the guard tests run
//! headlessly and what the bash client achieved by validating before calling
//! gdbus.

use std::cell::OnceCell;
use std::sync::mpsc;
use std::thread;
use std::time::Duration;

use zbus::blocking::{Connection, Proxy};
use zbus::zvariant::DynamicType;

use crate::fail::{Fail, Result};

pub const DEST: &str = "org.gnome.Shell";
pub const PATH: &str = "/org/gnome/Shell/Extensions/WindowControl";
pub const IFACE: &str = "org.gnome.Shell.Extensions.WindowControl";

const NOT_RUNNING: &str = "Window Control extension is not running. Enable it in GNOME Extensions.";

/// Classify a failed call as "the extension is not running".
///
/// The bash client matched these substrings in the gdbus/busctl error text so
/// that the same fault produced the same actionable hint on either transport.
/// The same strings appear in the zbus error text, so the rule is unchanged.
fn is_extension_not_running(err: &str) -> bool {
    err.contains("was not provided")
        || err.contains("does not exist")
        || err.contains("No route to host")
        || err.contains("ServiceUnknown")
}

fn map_err(err: zbus::Error) -> Fail {
    let text = err.to_string();
    if is_extension_not_running(&text) {
        Fail::error(NOT_RUNNING)
    } else {
        Fail::error(format!("D-Bus call failed: {text}"))
    }
}

fn connect() -> Result<Connection> {
    Connection::session().map_err(map_err)
}

fn proxy(conn: &Connection) -> Result<Proxy<'_>> {
    Proxy::new(conn, DEST, PATH, IFACE).map_err(map_err)
}

#[derive(Default)]
pub struct Bus {
    conn: OnceCell<Connection>,
}

impl Bus {
    pub fn new() -> Self {
        Self::default()
    }

    fn conn(&self) -> Result<&Connection> {
        if let Some(conn) = self.conn.get() {
            return Ok(conn);
        }
        let conn = connect()?;
        // set() cannot fail: get() above returned None and we are single threaded.
        let _ = self.conn.set(conn);
        Ok(self.conn.get().expect("connection was just stored"))
    }

    /// Call a method whose reply is a single value.
    pub fn call<B, R>(&self, method: &str, body: &B) -> Result<R>
    where
        B: serde::ser::Serialize + DynamicType,
        R: serde::de::DeserializeOwned + zbus::zvariant::Type,
    {
        let conn = self.conn()?;
        proxy(conn)?.call(method, body).map_err(map_err)
    }

    /// Call a method that returns a JSON document as a string.
    pub fn call_json(&self, method: &str) -> Result<String> {
        self.call(method, &())
    }

    /// Call a method that returns a success flag.
    pub fn call_bool<B>(&self, method: &str, body: &B) -> Result<bool>
    where
        B: serde::ser::Serialize + DynamicType,
    {
        self.call(method, body)
    }

    pub fn get_focused(&self) -> Result<(u64, String, String)> {
        self.call("GetFocused", &())
    }

    pub fn get_workarea(&self, monitor: i32) -> Result<(i32, i32, i32, i32)> {
        self.call("GetWorkarea", &(monitor,))
    }

    /// Block until the extension reports a matching window, or the client-side
    /// bound elapses.
    ///
    /// The extension already applies `timeout_ms` and answers with 0 when it
    /// expires. The client bound is only a guard against a shell that never
    /// replies at all, which is what the bash client bought with gdbus
    /// `--timeout`. zbus has no per-call timeout in the blocking API, so the
    /// call runs on a worker thread and the main thread waits with a deadline.
    pub fn wait_for_window(
        &self,
        kind: &str,
        value: &str,
        timeout_ms: i32,
        client_bound: Duration,
    ) -> Result<u64> {
        let conn = self.conn()?.clone();
        let kind = kind.to_string();
        let value = value.to_string();
        let (tx, rx) = mpsc::channel();

        thread::spawn(move || {
            let reply = proxy(&conn).and_then(|p| {
                p.call::<_, _, u64>("WaitForWindow", &(kind, value, timeout_ms))
                    .map_err(map_err)
            });
            let _ = tx.send(reply);
        });

        match rx.recv_timeout(client_bound) {
            Ok(reply) => reply,
            Err(_) => Err(Fail::error("D-Bus call failed: Timeout was reached")),
        }
    }
}
