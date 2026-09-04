// SPDX-FileCopyrightText: 2026 hko9890
// SPDX-License-Identifier: MIT
//! The D-Bus client for the Window Control extension.
//!
//! The session connection is opened lazily, so every argument-validation error
//! is reported without touching the bus. That is what lets the guard tests run
//! headlessly and what the bash client achieved by validating before calling
//! gdbus.

use std::cell::OnceCell;
use std::time::Duration;

use zbus::blocking::connection::Builder;
use zbus::blocking::{Connection, Proxy};
use zbus::zvariant::DynamicType;

use crate::fail::{Fail, Result, EXIT_NOT_FOUND, EXIT_NO_EXTENSION, EXIT_REFUSED, EXIT_TIMEOUT};

pub const DEST: &str = "org.gnome.Shell";
pub const PATH: &str = "/org/gnome/Shell/Extensions/WindowControl";
pub const IFACE: &str = "org.gnome.Shell.Extensions.WindowControl";

const NOT_RUNNING: &str = "Window Control extension is not running. Enable it in GNOME Extensions.";

/// Errors the interface raises by name.
///
/// These replaced the `b success` the geometry methods used to return: a bare
/// false could not say which failure happened, so wctl refetched the window and
/// guessed from its flags -- a guess that could not see tiling at all. The name
/// is now the extension's own account of what it did.
const ERROR_NOT_FOUND: &str = "org.gnome.Shell.Extensions.WindowControl.NotFound";
const ERROR_REFUSED: &str = "org.gnome.Shell.Extensions.WindowControl.Refused";
const ERROR_SETTLE_TIMEOUT: &str = "org.gnome.Shell.Extensions.WindowControl.Timeout";
/// Raised on a pending WaitForWindow/WaitForGeometry when the extension is
/// disabled; the shell is still on the bus, so this is "not running" by name.
const ERROR_DISABLED: &str = "org.gnome.Shell.Extensions.WindowControl.Disabled";
const ERROR_UNKNOWN_METHOD: &str = "org.freedesktop.DBus.Error.UnknownMethod";
/// The bus daemon's answer when nothing owns org.gnome.Shell.
const ERROR_SERVICE_UNKNOWN: &str = "org.freedesktop.DBus.Error.ServiceUnknown";

/// Default reply timeout for every method call except `wait`, which sets its
/// own.
///
/// zbus defaults to no timeout at all, so a shell that is on the bus but whose
/// main loop is wedged would hang wctl forever. The bash client inherited 25 s
/// from both gdbus and busctl, and a hang is worse than an error here: these
/// commands run from keybindings and scripts. 25 s is right for a batch script
/// and far too long for a keybinding, so `--timeout`/`WCTL_TIMEOUT` overrides
/// it (see `main::global_options`).
pub const DEFAULT_TIMEOUT_SECONDS: u64 = 25;

/// Classify a failed call as "the extension is not running".
///
/// Matched on the error NAME wherever one exists. The one text match left is
/// the case GDBus genuinely conflates: it raises UnknownMethod both for a
/// missing object ("Object does not exist at path ...", the extension is not
/// running) and for a missing method ("No such method ...", the extension is
/// too old), and only the detail tells them apart (measured on GNOME 46).
///
/// The detail of any OTHER named error is never consulted: the extension
/// forwards arbitrary exception messages under org.freedesktop.DBus.Error.Failed,
/// and a message that happened to contain "does not exist" must not send the
/// user to re-enable an extension that just answered.
fn is_extension_not_running(err: &zbus::Error) -> bool {
    match err {
        zbus::Error::MethodError(name, detail, _) => match name.as_str() {
            ERROR_SERVICE_UNKNOWN | ERROR_DISABLED => true,
            ERROR_UNKNOWN_METHOD => detail
                .as_deref()
                .is_some_and(|detail| detail.contains("does not exist")),
            _ => false,
        },
        // No bus, or a bus with nobody to answer: the transport's own words.
        other => {
            let text = other.to_string();
            text.contains("was not provided") || text.contains("No route to host")
        }
    }
}

/// Classify a failed call as "the reply never came".
///
/// The client-side bound in `session_connection` gives up by racing a timer
/// against the reply, and zbus reports that as an `io::Error` of kind
/// `TimedOut` rather than a D-Bus error. `NoReply`/`Timeout` from the bus
/// daemon mean the same thing from further away, so both classify the same.
///
/// This is matched on the error VALUE, not its text: unlike the
/// not-running strings below, which had to keep matching the wording gdbus and
/// busctl produced, nothing pins the shape of this one.
fn is_timeout(err: &zbus::Error) -> bool {
    match err {
        zbus::Error::InputOutput(io) => io.kind() == std::io::ErrorKind::TimedOut,
        zbus::Error::MethodError(name, _, _) => matches!(
            name.as_str(),
            "org.freedesktop.DBus.Error.NoReply" | "org.freedesktop.DBus.Error.Timeout"
        ),
        _ => false,
    }
}

fn map_err(err: zbus::Error) -> Fail {
    if is_timeout(&err) {
        return Fail::error(
            "GNOME Shell did not reply in time. Raise --timeout, or check that the shell is responding.",
        )
        .with_code(EXIT_TIMEOUT);
    }

    // The extension writes these messages, and they are the whole reason the
    // geometry methods raise: it is the only party that can see the difference
    // between a missing window, a pinned frame and a tiled one.
    if let zbus::Error::MethodError(name, detail, _) = &err {
        let message = detail.clone().unwrap_or_else(|| name.to_string());
        match name.as_str() {
            // Extension-said-no goes to stdout, the shape the suites pin.
            ERROR_NOT_FOUND => return Fail::plain(message).with_code(EXIT_NOT_FOUND),
            ERROR_REFUSED => return Fail::plain(message).with_code(EXIT_REFUSED),
            ERROR_SETTLE_TIMEOUT => return Fail::error(message).with_code(EXIT_TIMEOUT),
            _ => {}
        }
    }

    // BEFORE the UnknownMethod check below: is_extension_not_running() claims
    // the "Object does not exist" shape of UnknownMethod, and only "No such
    // method" falls through to be reported as an outdated extension.
    if is_extension_not_running(&err) {
        return Fail::error(NOT_RUNNING).with_code(EXIT_NO_EXTENSION);
    }

    // The shell is on the bus and serving the object, but not this method -- so
    // what it loaded is older than this binary. On Wayland that is the ordinary
    // state right after an upgrade, until the user logs out.
    if let zbus::Error::MethodError(name, detail, _) = &err {
        if name.as_str() == ERROR_UNKNOWN_METHOD {
            let message = detail.clone().unwrap_or_else(|| name.to_string());
            return Fail::error(format!(
                "{message}. The extension GNOME Shell has loaded is older than this wctl. \
                 Check with 'wctl version --json', then restart the shell \
                 (log out and back in on Wayland)."
            ))
            .with_code(EXIT_NO_EXTENSION);
        }
    }

    Fail::error(format!("D-Bus call failed: {err}"))
}

/// A session connection whose method calls give up after `timeout`.
fn session_connection(timeout: Duration) -> Result<Connection> {
    Builder::session()
        .map_err(map_err)?
        .method_timeout(timeout)
        .build()
        .map_err(map_err)
}

fn proxy(conn: &Connection) -> Result<Proxy<'_>> {
    Proxy::new(conn, DEST, PATH, IFACE).map_err(map_err)
}

pub struct Bus {
    conn: OnceCell<Connection>,
    /// How long a method call waits for the shell to reply. Stored rather than
    /// applied at construction, because the connection is opened lazily.
    timeout: Duration,
}

impl Bus {
    pub fn new(timeout: Duration) -> Self {
        Bus {
            conn: OnceCell::new(),
            timeout,
        }
    }

    fn conn(&self) -> Result<&Connection> {
        if let Some(conn) = self.conn.get() {
            return Ok(conn);
        }
        let conn = session_connection(self.timeout)?;
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

    /// Call a method whose reply carries no value.
    ///
    /// The geometry methods raise a named error instead of answering `false`,
    /// so a reply at all IS the success, and `map_err` has already classified
    /// anything else.
    pub fn call_unit<B>(&self, method: &str, body: &B) -> Result<()>
    where
        B: serde::ser::Serialize + DynamicType,
    {
        self.call(method, body)
    }

    /// Call a method on its OWN connection, whose reply timeout is
    /// `client_bound` rather than the shared one.
    ///
    /// The blocking methods below get this because the shared connection gives
    /// up after the reply timeout and they are entitled to block far longer:
    /// the extension applies its own timeout and answers when it expires, so
    /// the client bound is only a guard against a shell that never replies at
    /// all. The global `--timeout` therefore does not shorten them.
    fn call_bounded<B, R>(&self, method: &str, body: &B, client_bound: Duration) -> Result<R>
    where
        B: serde::ser::Serialize + DynamicType,
        R: serde::de::DeserializeOwned + zbus::zvariant::Type,
    {
        let conn = session_connection(client_bound)?;
        let reply = proxy(&conn)?.call(method, body);
        reply.map_err(map_err)
    }

    /// The extension version the running shell has loaded.
    pub fn get_version(&self) -> Result<String> {
        self.call("GetVersion", &())
    }

    pub fn get_focused(&self) -> Result<(u64, String, String)> {
        self.call("GetFocused", &())
    }

    pub fn get_workarea(&self, monitor: i32) -> Result<(i32, i32, i32, i32)> {
        self.call("GetWorkarea", &(monitor,))
    }

    /// Block until the extension reports a matching window (0 once its
    /// `timeout_ms` expires), or the client-side bound elapses.
    pub fn wait_for_window(
        &self,
        kind: &str,
        value: &str,
        timeout_ms: i32,
        client_bound: Duration,
    ) -> Result<u64> {
        self.call_bounded("WaitForWindow", &(kind, value, timeout_ms), client_bound)
    }

    /// Block until the window's frame has held still for `quiet_ms`, and return
    /// it.
    pub fn wait_for_geometry(
        &self,
        window_id: u64,
        quiet_ms: i32,
        timeout_ms: i32,
        client_bound: Duration,
    ) -> Result<(i32, i32, i32, i32)> {
        self.call_bounded(
            "WaitForGeometry",
            &(window_id, quiet_ms, timeout_ms),
            client_bound,
        )
    }
}
