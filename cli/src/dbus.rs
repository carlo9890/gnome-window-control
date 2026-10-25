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
const NO_SESSION_BUS: &str = "Run wctl from the user's graphical session, or set \
     DBUS_SESSION_BUS_ADDRESS to its bus (sudo, ssh and cron do not set it).";

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
/// Matched on the error NAME alone. UnknownMethod is not here: GDBus raises
/// it both for a missing object (the extension is not running) and for a
/// missing method (the extension is too old), and only its detail, which GDBus
/// translates into the shell's locale, tells them apart. `map_err` asks the
/// object instead (see `serves_object`).
///
/// The detail of a named error is never consulted: the extension forwards
/// arbitrary exception messages under org.freedesktop.DBus.Error.Failed or
/// org.gnome.gjs.JSError.*, and a message that happened to contain "does not
/// exist" must not send the user to re-enable an extension that just answered.
fn is_extension_not_running(err: &zbus::Error) -> bool {
    match err {
        zbus::Error::MethodError(name, _, _) => {
            matches!(name.as_str(), ERROR_SERVICE_UNKNOWN | ERROR_DISABLED)
        }
        // A session bus that cannot be reached at all is `map_connect_err`'s
        // case, and says so by its own message.
        _ => false,
    }
}

fn is_unknown_method(err: &zbus::Error) -> bool {
    matches!(err, zbus::Error::MethodError(name, _, _) if name.as_str() == ERROR_UNKNOWN_METHOD)
}

/// Classify a failed call as "the reply never came".
///
/// The client-side bound in `session_connection` gives up by racing a timer
/// against the reply, and zbus reports that as an `io::Error` of kind
/// `TimedOut` rather than a D-Bus error. `NoReply`/`Timeout` from the bus
/// daemon mean the same thing from further away, so both classify the same.
///
/// This is matched on the error VALUE, not its text.
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

/// Map a failed call to the message and exit code wctl reports.
///
/// `serves_object` is asked only for an UnknownMethod, to tell an extension
/// that is not running from one too old to serve the method.
fn map_err(err: zbus::Error, serves_object: impl FnOnce() -> bool) -> Fail {
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

    if is_extension_not_running(&err) || (is_unknown_method(&err) && !serves_object()) {
        return Fail::error(NOT_RUNNING).with_code(EXIT_NO_EXTENSION);
    }

    // The shell is serving the object, but not this method -- so what it
    // loaded is older than this binary. On Wayland that is the ordinary
    // state right after an upgrade, until the user logs out.
    if let zbus::Error::MethodError(name, detail, _) = &err {
        if is_unknown_method(&err) {
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

/// Classify a failure to open the session connection.
///
/// No bus at the address, a malformed `DBUS_SESSION_BUS_ADDRESS` and a refused
/// handshake are all zbus variants of one fact: wctl reached no session bus.
/// The extension may be fine -- sudo, ssh and cron run without the graphical
/// session's bus address -- so the hint names the bus, not the extension. It
/// keeps exit 5 by position, not by the error text, and the transport's own
/// words stay in the message, because they name the address that is wrong.
///
/// No timeout branch: zbus 5 applies `method_timeout` to method calls only,
/// never to the connect and the handshake, so a failure here is never the
/// shell being slow to reply.
fn map_connect_err(err: zbus::Error) -> Fail {
    Fail::error(format!(
        "Cannot connect to the session bus: {err}. {NO_SESSION_BUS}"
    ))
    .with_code(EXIT_NO_EXTENSION)
}

/// A session connection whose method calls give up after `timeout`.
fn session_connection(timeout: Duration) -> Result<Connection> {
    Builder::session()
        .map_err(map_connect_err)?
        .method_timeout(timeout)
        .build()
        .map_err(map_connect_err)
}

fn proxy(conn: &Connection) -> Result<Proxy<'_>> {
    Proxy::new(conn, DEST, PATH, IFACE).map_err(|err| map_err(err, || false))
}

/// Is the extension's object exported on `conn`?
///
/// Asked through org.freedesktop.DBus.Properties, which GDBus answers for
/// every exported object, so the answer does not depend on which methods the
/// loaded extension has: one too old to serve GetVersion is still found.
fn serves_object(conn: &Connection) -> bool {
    conn.call_method(
        Some(DEST),
        PATH,
        Some("org.freedesktop.DBus.Properties"),
        "GetAll",
        &(IFACE,),
    )
    .is_ok()
}

fn call_on<B, R>(conn: &Connection, method: &str, body: &B) -> Result<R>
where
    B: serde::ser::Serialize + DynamicType,
    R: serde::de::DeserializeOwned + zbus::zvariant::Type,
{
    proxy(conn)?
        .call(method, body)
        .map_err(|err| map_err(err, || serves_object(conn)))
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
        call_on(self.conn()?, method, body)
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
        call_on(&session_connection(client_bound)?, method, body)
    }

    /// The extension version the running shell has loaded.
    pub fn get_version(&self) -> Result<String> {
        self.call("GetVersion", &())
    }

    /// The feature names the loaded extension reports.
    ///
    /// A name, not a version number: extensions.gnome.org replaces the `version`
    /// field in metadata.json with its own upload number, so an install from
    /// there reports a number this project never released.
    pub fn get_capabilities(&self) -> Result<Vec<String>> {
        self.call("GetCapabilities", &())
    }

    /// The feature names the loaded extension reports, or `None` when nobody
    /// answered.
    ///
    /// `None` is no bus, no shell, a disabled extension or a shell that stayed
    /// silent. `Some` is an answer, and it is empty for an extension whose
    /// object is served but that is too old to serve GetCapabilities at all. A
    /// caller that must not fail without a shell acts on `Some` alone.
    ///
    /// It runs on its OWN connection with `bound` as the reply timeout, because
    /// the caller has already done its work: a shell that never answers must
    /// cost a moment, not the full `--timeout` a real call is entitled to.
    pub fn reported_capabilities(&self, bound: Duration) -> Option<Vec<String>> {
        let conn = session_connection(bound).ok()?;
        let proxy = proxy(&conn).ok()?;
        match proxy.call::<_, _, Vec<String>>("GetCapabilities", &()) {
            Ok(names) => Some(names),
            Err(err) if is_unknown_method(&err) => serves_object(&conn).then(Vec::new),
            Err(_) => None,
        }
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

#[cfg(test)]
mod tests {
    use super::*;

    use crate::fail::EXIT_ERROR;

    fn method_error(name: &str, detail: &str) -> zbus::Error {
        let reply = zbus::Message::method_call(PATH, "Probe")
            .expect("a valid path and member")
            .build(&())
            .expect("an empty body");
        zbus::Error::MethodError(
            zbus::names::ErrorName::try_from(name)
                .expect("a valid error name")
                .into(),
            Some(detail.to_string()),
            reply,
        )
    }

    fn timed_out() -> zbus::Error {
        zbus::Error::InputOutput(std::sync::Arc::new(std::io::Error::from(
            std::io::ErrorKind::TimedOut,
        )))
    }

    /// The exit code, whether the message goes to stdout, and the message.
    fn mapped(fail: Fail) -> (i32, bool, String) {
        (fail.code(), fail.is_plain(), fail.to_string())
    }

    /// `map_err` for an error whose classification must not ask the object.
    fn mapped_unasked(err: zbus::Error) -> (i32, bool, String) {
        mapped(map_err(err, || panic!("the object was asked")))
    }

    /// The two UnknownMethod details GDBus gives, in English and in German:
    /// the detail is translated, so it must not decide anything.
    fn unknown_method_details() -> [&'static str; 4] {
        [
            "Object does not exist at path \u{201c}/org/gnome/Shell/Extensions/WindowControl\u{201d}",
            "No such method \u{201c}GetCapabilities\u{201d}",
            "Objekt existiert nicht im Pfad \u{bb}/org/gnome/Shell/Extensions/WindowControl\u{ab}",
            "Keine derartige Methode \u{bb}GetCapabilities\u{ab}",
        ]
    }

    #[test]
    fn named_extension_errors_keep_their_code_and_stream() {
        assert_eq!(
            mapped_unasked(method_error(ERROR_NOT_FOUND, "Window 7 not found")),
            (2, true, "Window 7 not found".to_string())
        );
        assert_eq!(
            mapped_unasked(method_error(ERROR_REFUSED, "Window 7 is maximized")),
            (3, true, "Window 7 is maximized".to_string())
        );
        assert_eq!(
            mapped_unasked(method_error(ERROR_SETTLE_TIMEOUT, "No window matched")),
            (4, false, "No window matched".to_string())
        );
    }

    #[test]
    fn a_reply_that_never_came_is_a_timeout() {
        for err in [
            method_error("org.freedesktop.DBus.Error.NoReply", "no reply"),
            method_error("org.freedesktop.DBus.Error.Timeout", "timed out"),
            timed_out(),
        ] {
            let (code, plain, _) = mapped_unasked(err);
            assert_eq!((code, plain), (4, false));
        }
    }

    #[test]
    fn nobody_serving_the_interface_is_not_running() {
        for err in [
            method_error(ERROR_SERVICE_UNKNOWN, "The name is not activatable"),
            method_error(ERROR_DISABLED, "The extension was disabled"),
        ] {
            assert_eq!(mapped_unasked(err), (5, false, NOT_RUNNING.to_string()));
        }
    }

    #[test]
    fn an_unknown_method_without_the_object_is_not_running_in_any_locale() {
        for detail in unknown_method_details() {
            let err = method_error(ERROR_UNKNOWN_METHOD, detail);
            assert_eq!(
                mapped(map_err(err, || false)),
                (5, false, NOT_RUNNING.to_string()),
                "detail: {detail}"
            );
        }
    }

    #[test]
    fn an_unknown_method_on_a_served_object_is_an_outdated_extension_in_any_locale() {
        for detail in unknown_method_details() {
            let err = method_error(ERROR_UNKNOWN_METHOD, detail);
            let (code, plain, message) = mapped(map_err(err, || true));
            assert_eq!((code, plain), (5, false), "detail: {detail}");
            assert!(
                message.contains("older than this wctl"),
                "printed: {message}"
            );
        }
    }

    #[test]
    fn the_detail_of_a_generic_failure_is_never_read() {
        let (code, plain, message) = mapped_unasked(method_error(
            "org.freedesktop.DBus.Error.Failed",
            "Workspace 9 does not exist",
        ));
        assert_eq!((code, plain), (EXIT_ERROR, false));
        assert!(
            message.starts_with("D-Bus call failed: "),
            "printed: {message}"
        );
    }

    #[test]
    fn a_session_bus_that_cannot_be_reached_names_the_bus() {
        for err in [
            zbus::Error::Address("Invalid address".to_string()),
            zbus::Error::Handshake("refused".to_string()),
        ] {
            let (code, plain, message) = mapped(map_connect_err(err));
            assert_eq!((code, plain), (5, false));
            assert!(
                message.starts_with("Cannot connect to the session bus: ")
                    && message.ends_with(NO_SESSION_BUS)
                    && !message.contains(NOT_RUNNING),
                "printed: {message}"
            );
        }
    }
}
