// SPDX-FileCopyrightText: 2026 hko9890
// SPDX-License-Identifier: MIT
// Window Control Extension for GNOME Shell
// D-Bus interface for listing and controlling windows

import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Meta from 'gi://Meta';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import { Extension } from 'resource:///org/gnome/shell/extensions/extension.js';
import { DBUS_INTERFACE_XML } from './dbus-interface.js';

const DBUS_OBJECT_PATH = '/org/gnome/Shell/Extensions/WindowControl';
const DBUS_ERROR_DISABLED = 'org.gnome.Shell.Extensions.WindowControl.Disabled';
const DBUS_ERROR_NOT_FOUND = 'org.gnome.Shell.Extensions.WindowControl.NotFound';
const DBUS_ERROR_REFUSED = 'org.gnome.Shell.Extensions.WindowControl.Refused';
const DBUS_ERROR_TIMEOUT = 'org.gnome.Shell.Extensions.WindowControl.Timeout';
const DBUS_ERROR_INVALID_ARGS = 'org.freedesktop.DBus.Error.InvalidArgs';
const DBUS_ERROR_FAILED = 'org.freedesktop.DBus.Error.Failed';

// A failure that must reach the caller as a specific D-Bus error NAME.
//
// Do NOT reach for Gio.DBusError.new_for_dbus_error() here. That returns a
// GLib.Error, and GJS answers a thrown GLib.Error with
// g_dbus_method_invocation_return_gerror(); an unregistered domain then goes on
// the wire as org.gtk.GDBus.UnmappedGError.Quark._g_2dio_2derror_2dquark.Code36
// with the real name buried in the message text, where no caller can switch on
// it (measured against GNOME 46).
//
// A plain Error is not subject to that: GJS's synchronous dispatch forwards
// `e.name` verbatim once it contains a dot. The handlers are async anyway, and
// answer with return_dbus_error() themselves, for a different reason -- that
// same synchronous path also calls logError(), which would write a journal
// WARNING for every ordinary refusal and break this file's logging invariant.
class NamedError extends Error {
    constructor(name, message) {
        super(message);
        this.dbusName = name;
    }
}

function _areFiniteNumbers(values) {
    return values.every(v => typeof v === 'number' && Number.isFinite(v));
}

function _arePositiveNumbers(values) {
    return _areFiniteNumbers(values) && values.every(v => v > 0);
}

// Window type enum to string mapping
const WINDOW_TYPE_NAMES = {
    [Meta.WindowType.NORMAL]: 'normal',
    [Meta.WindowType.DESKTOP]: 'desktop',
    [Meta.WindowType.DOCK]: 'dock',
    [Meta.WindowType.DIALOG]: 'dialog',
    [Meta.WindowType.MODAL_DIALOG]: 'modal_dialog',
    [Meta.WindowType.TOOLBAR]: 'toolbar',
    [Meta.WindowType.MENU]: 'menu',
    [Meta.WindowType.UTILITY]: 'utility',
    [Meta.WindowType.SPLASHSCREEN]: 'splashscreen',
    [Meta.WindowType.DROPDOWN_MENU]: 'dropdown_menu',
    [Meta.WindowType.POPUP_MENU]: 'popup_menu',
    [Meta.WindowType.TOOLTIP]: 'tooltip',
    [Meta.WindowType.NOTIFICATION]: 'notification',
    [Meta.WindowType.COMBO]: 'combo',
    [Meta.WindowType.DND]: 'dnd',
    [Meta.WindowType.OVERRIDE_OTHER]: 'override_other',
};

// GNOME 49 changed the Meta.Window maximize API: maximize()/unmaximize() no
// longer take a Meta.MaximizeFlags argument, and get_maximized() was removed in
// favor of get_maximize_flags()/is_maximized() (verified against mutter 49.0
// window.h). global.get_window_actors() and the rest of the Meta.Window API used
// here are unchanged across GNOME 45-50. Detect the pre-49 API via the removed
// get_maximized() method so a single extension.js works on all supported shells.
function _maximizeFlags(win) {
    if (typeof win.get_maximized === 'function') {
        return win.get_maximized();                                  // GNOME <= 48
    }
    return win.get_maximize_flags();                                 // GNOME 49+
}

function _isFullyMaximized(win) {
    return _maximizeFlags(win) === Meta.MaximizeFlags.BOTH;
}

function _maximizeWindow(win) {
    if (typeof win.get_maximized === 'function') {
        win.maximize(Meta.MaximizeFlags.BOTH);                       // GNOME <= 48
    } else {
        win.maximize();                                              // GNOME 49+
    }
}

function _unmaximizeWindow(win) {
    if (typeof win.get_maximized === 'function') {
        win.unmaximize(Meta.MaximizeFlags.BOTH);                     // GNOME <= 48
    } else {
        win.unmaximize();                                            // GNOME 49+
    }
}

// D-Bus service implementation.
//
// Logging invariant: every per-call line below uses console.debug(), never
// console.log(). GJS maps console.log() to G_LOG_LEVEL_MESSAGE, which journald
// records at priority 5 (notice) and shows WITHOUT G_MESSAGES_DEBUG set — so a
// console.log() here writes a line to the user's journal on every D-Bus call,
// and those lines persist across the session. console.debug() is priority 7 and
// stays gated behind G_MESSAGES_DEBUG. For the same reason, no log line may
// contain window content or a caller-supplied match value — not a title, and not
// a WM class: titles leak document names, URLs and message contents into a log
// that outlives the process that asked for them, and a class says which
// applications the user runs. Log the method name and the outcome, not the
// content. WaitForWindow is the one exception: it logs its `kind` argument, and
// elides the `value` matched against. `kind` is only safe to log AFTER
// _matchPredicate() has proved it is one of the four keywords
// (class|title|substring|pid) -- before that it is an arbitrary caller-supplied
// string, and logging it would let any process on the session bus write what it
// likes, newlines included, into the user's journal.
class WindowControlService {
    constructor(metadata) {
        this._dbusImpl = Gio.DBusExportedObject.wrapJSObject(
            DBUS_INTERFACE_XML,
            this
        );
        // Reported by GetVersion. Read from the metadata the SHELL loaded, not
        // from metadata.json on disk: those two disagreeing is the whole point
        // of the method, because on Wayland an install lands on disk and the
        // shell keeps running the old copy until the user logs out.
        this._version = String(metadata.version);
        // WaitForWindow state. The 'window-created' handler is connected only
        // while at least one waiter is pending, so an idle extension costs nothing.
        this._waiters = [];
        this._windowCreatedId = 0;
        this._trackedWindows = new Map();   // Meta.Window -> [signal handler ids]
        // Mutter exposes no "has been mapped" getter, so record it: a window
        // seen unhidden once has been placed, and that never becomes untrue.
        this._shownWindows = new WeakSet();
        this._createdWhileWatching = new WeakSet();
        // WaitForGeometry state, one entry per pending call.
        this._geometryWatchers = [];
    }

    // Helper: Get all windows (NORMAL type only)
    _getAllWindows() {
        const actors = global.get_window_actors();
        const windows = [];
        
        for (const actor of actors) {
            const metaWindow = actor.get_meta_window();
            if (metaWindow && metaWindow.get_window_type() === Meta.WindowType.NORMAL) {
                windows.push(metaWindow);
            }
        }
        
        console.debug(`[Window Control] _getAllWindows(): found ${actors.length} actors, ${windows.length} normal windows`);
        return windows;
    }

    // Helper: Find window by ID
    _findWindowById(id) {
        const windows = this._getAllWindows();
        for (const win of windows) {
            if (win.get_id() === id) {
                return win;
            }
        }
        return null;
    }

    // Helper: Find window by predicate function
    _findWindowByPredicate(predicate) {
        const windows = this._getAllWindows();
        for (const win of windows) {
            if (predicate(win)) {
                return win;
            }
        }
        return null;
    }

    // Helper: true if value is an integer in [0, count)
    _isValidIndex(value, count) {
        return Number.isInteger(value) && value >= 0 && value < count;
    }

    // Helper: true when mutter will drop a frame geometry request outright.
    // move_frame()/move_resize_frame() return without error and the frame does
    // not move, so a handler that reports true would be claiming a move that
    // never happened.
    //
    // Any maximize flag counts, not just BOTH. Measured on GNOME 46 in a nested
    // session, moving a window to (150, 300):
    //
    //   maximized BOTH      x and y both pinned      nothing moves
    //   tiled side by side  x, y, width, height all overwritten by
    //                       constrain_tiling()       nothing moves
    //   maximized VERTICAL  x honoured, y pinned     the move HALF happens
    //
    // A tiled window reports MAXIMIZE_VERTICAL and nothing else, and GJS has no
    // tiled predicate, so the vertical case cannot be told from the tiled one.
    // Both are refused. For a genuinely tiled window that is exactly right; for
    // a merely vertically-maximized one it refuses a request that would have
    // been half-applied -- and half-applied while reporting plain success is
    // the very thing this guard exists to stop. A refusal the caller can act on
    // beats a success that moved the window somewhere it did not ask for.
    //
    // Verifying instead of refusing is not available: move_resize_frame() is
    // asynchronous, and get_frame_rect() read in the same handler still returns
    // the OLD rect even for a move that succeeds (measured), so a post-call
    // comparison would report failure for every successful call. (Waiting for
    // it to settle IS available -- see WaitForGeometry -- but that is a
    // separate call, deliberately: a geometry request must stay cheap.)
    //
    // Returns the reason as a phrase, or null when the frame is free. Naming
    // the state is the point: a client outside the shell can read
    // is_maximized/is_fullscreen for itself but has no tiled predicate at all,
    // so it could never tell the third case from the second.
    _frameRefusal(win) {
        if (win.is_fullscreen())
            return 'the window is fullscreen; unfullscreen it first';
        const flags = _maximizeFlags(win);
        if (flags === Meta.MaximizeFlags.BOTH)
            return 'the window is maximized; unmaximize it first';
        if (flags !== 0)
            return 'the window is tiled or maximized on one axis; unmaximize it first';
        return null;
    }

    // Shared preamble for the geometry handlers: find the window and check the
    // frame, raising a NAMED error for either failure.
    _geometryTarget(windowId, label) {
        const win = this._findWindowById(windowId);
        if (!win) {
            console.debug(`[Window Control] ${label}(${windowId}) -> NotFound`);
            throw new NamedError(DBUS_ERROR_NOT_FOUND, `Window not found: ${windowId}`);
        }
        const refusal = this._frameRefusal(win);
        if (refusal) {
            console.debug(`[Window Control] ${label}(${windowId}) -> Refused`);
            throw new NamedError(DBUS_ERROR_REFUSED,
                `Cannot change the geometry of window ${windowId}: ${refusal}`);
        }
        return win;
    }

    // Run a geometry handler body and answer the invocation: an empty reply on
    // success, a named error otherwise.
    //
    // The three geometry methods are async (GJS convention:
    // <Method>Async(params, invocation)) only so they can answer here rather
    // than by throwing. They do no waiting -- see NamedError for why throwing
    // is the wrong shape for a routine refusal.
    _geometryCall(invocation, label, body) {
        try {
            body();
            invocation.return_value(null);
        } catch (e) {
            if (e instanceof NamedError) {
                invocation.return_dbus_error(e.dbusName, e.message);
                return;
            }
            console.error(`[Window Control] ${label}() error: ${e.message}`);
            invocation.return_dbus_error(DBUS_ERROR_FAILED, e.message);
        }
    }

    // Helper: Build the match predicate for a (kind, value) selector, shared
    // by WaitForWindow and the ActivateBy* methods so the two families cannot
    // disagree about which window a value names. Returns null for an unknown
    // kind, an empty substring (which would match every window) or a pid that
    // is not a positive decimal integer: get_pid() is 0 for a window whose
    // client pid is unknown, so 0 must never be matchable.
    _matchPredicate(kind, value) {
        switch (kind) {
        case 'class':
            return w => w.get_wm_class() === value;
        case 'title':
            return w => w.get_title() === value;
        case 'substring':
            if (value === '')
                return null;
            return w => (w.get_title() || '').includes(value);
        case 'pid': {
            if (!/^[0-9]+$/.test(value))
                return null;
            const pid = Number(value);
            if (!Number.isSafeInteger(pid) || pid <= 0)
                return null;
            return w => w.get_pid() === pid;
        }
        default:
            return null;
        }
    }

    // Helper: has mutter mapped and placed this window at least once?
    // Recorded rather than inferred -- a window seen unhidden has been placed,
    // and that never stops being true, whereas is_hidden() flips with minimize
    // and workspace changes.
    _hasBeenShown(win) {
        if (this._shownWindows.has(win))
            return true;
        if (!win.is_hidden()) {
            this._shownWindows.add(win);
            return true;
        }
        return false;
    }

    // Helper: true for a window that mutter has created but not yet mapped and
    // placed. A geometry request on such a window is overridden by mutter's
    // initial placement, so WaitForWindow must not reply before it is shown.
    //
    // is_hidden() alone cannot answer this: minimized windows and windows on
    // another workspace are hidden too, and both are placed. For a window
    // watched since 'window-created' the answer is known outright -- if it has
    // never been seen unhidden it has never been mapped, whatever the reason it
    // is hidden now. That is the case the old test got wrong: a window created
    // on a non-active workspace, or created minimized, failed its
    // minimized/workspace clauses and was called shown while mutter had not yet
    // placed it.
    //
    // A window that predates the current watch has no such history, so it falls
    // back to the old reading: hidden while unminimized and on the active
    // workspace is the only shape a not-yet-mapped window can have.
    _isUnshown(win) {
        if (this._hasBeenShown(win))
            return false;
        if (this._createdWhileWatching.has(win))
            return true;
        return !win.minimized &&
            win.located_on_workspace(global.workspace_manager.get_active_workspace());
    }

    // Helper: Look up a window by ID and run an action on it, with the uniform
    // find / try-catch / result contract shared by the simple boolean handlers.
    // Returns false if the window is missing, the action throws, or the action
    // returns false -- which is how an action that reads its result back
    // (MoveToWorkspace, SetSticky) reports a change mutter declined. An action
    // that returns nothing counts as success.
    _actOnWindow(windowId, label, action) {
        try {
            const win = this._findWindowById(windowId);
            if (!win) {
                console.debug(`[Window Control] ${label}(${windowId}) -> false (window not found)`);
                return false;
            }
            const ok = action(win) !== false;
            console.debug(`[Window Control] ${label}(${windowId}) -> ${ok}`);
            return ok;
        } catch (e) {
            console.error(`[Window Control] ${label}() error: ${e.message}`);
            return false;
        }
    }

    // Helper: the ActivateBy* contract. Activates the first window matching
    // (kind, value) and returns true; false if none does or the value is one
    // _matchPredicate refuses. `kind` is one of this file's own keywords, never
    // caller-supplied, so it is safe to log; the value is not logged.
    _activateMatching(kind, value) {
        const label = `ActivateBy(${kind})`;
        console.debug(`[Window Control] ${label} called`);
        try {
            const predicate = this._matchPredicate(kind, value);
            const win = predicate ? this._findWindowByPredicate(predicate) : null;
            if (win) {
                win.activate(global.get_current_time());
                console.debug(`[Window Control] ${label} -> true`);
                return true;
            }
            console.debug(`[Window Control] ${label} -> false (not found)`);
            return false;
        } catch (e) {
            console.error(`[Window Control] ${label} error: ${e.message}`);
            return false;
        }
    }

    // List: Get all windows as array of tuples
    List() {
        console.debug(`[Window Control] List() called`);
        try {
            const windows = this._getAllWindows();
            const result = windows.map(win => {
                const workspace = win.get_workspace();
                const workspaceIndex = win.is_on_all_workspaces() ? -1 : (workspace ? workspace.index() : -1);
                return [
                    win.get_id(),                              // t - window ID
                    win.get_title() || '',                     // s - title
                    win.get_wm_class() || '',                  // s - wm_class
                    win.get_wm_class_instance() || '',         // s - wm_class_instance
                    win.get_sandboxed_app_id() || '',          // s - sandboxed_app_id
                    win.has_focus(),                           // b - is_focused
                    workspaceIndex,                            // i - workspace index
                    win.get_monitor(),                         // i - monitor index
                    win.get_pid(),                             // i - PID
                    win.get_window_type(),                     // i - window type enum
                ];
            });
            console.debug(`[Window Control] List() returning ${result.length} windows`);
            return result;
        } catch (e) {
            console.error(`[Window Control] List() error: ${e.message}`);
            return [];
        }
    }

    // ListDetailed: Get all windows as JSON string with full details
    ListDetailed() {
        console.debug(`[Window Control] ListDetailed() called`);
        try {
            const windows = this._getAllWindows();
            const result = [];
            
            for (const win of windows) {
                const workspace = win.get_workspace();
                const workspaceIndex = win.is_on_all_workspaces() ? -1 : (workspace ? workspace.index() : -1);
                const frameRect = win.get_frame_rect();
                const windowType = win.get_window_type();
                
                result.push({
                    id: win.get_id(),
                    title: win.get_title() || '',
                    wm_class: win.get_wm_class() || '',
                    wm_class_instance: win.get_wm_class_instance() || '',
                    sandboxed_app_id: win.get_sandboxed_app_id() || '',
                    gtk_application_id: win.get_gtk_application_id() || '',
                    has_focus: win.has_focus(),
                    // appears-focused is a distinct Meta.Window property (e.g. true when
                    // an attached modal dialog holds focus); keep it separate from has_focus.
                    // It is a GObject property, not a method -- accessed without parens.
                    // Fall back to has_focus() defensively if the property is ever absent.
                    appears_focused: win.appears_focused ?? win.has_focus(),
                    is_hidden: win.is_hidden(),
                    is_minimized: win.minimized,
                    is_maximized: _isFullyMaximized(win),
                    is_fullscreen: win.is_fullscreen(),
                    is_above: win.is_above(),
                    is_on_all_workspaces: win.is_on_all_workspaces(),
                    is_skip_taskbar: win.is_skip_taskbar(),
                    workspace_index: workspaceIndex,
                    monitor_index: win.get_monitor(),
                    pid: win.get_pid(),
                    window_type: windowType,
                    window_type_name: WINDOW_TYPE_NAMES[windowType] || 'unknown',
                    frame_rect: {
                        x: frameRect.x,
                        y: frameRect.y,
                        width: frameRect.width,
                        height: frameRect.height,
                    },
                });
            }
            
            console.debug(`[Window Control] ListDetailed() returning ${result.length} windows`);
            return JSON.stringify(result);
        } catch (e) {
            console.error(`[Window Control] ListDetailed() error: ${e.message}`);
            return '[]';
        }
    }

    // ListMonitors: Get all monitors with their properties
    ListMonitors() {
        console.debug(`[Window Control] ListMonitors() called`);
        try {
            const numMonitors = global.display.get_n_monitors();
            const primaryMonitor = global.display.get_primary_monitor();
            const result = [];

            for (let i = 0; i < numMonitors; i++) {
                const geometry = global.display.get_monitor_geometry(i);
                const scale = global.display.get_monitor_scale(i);

                result.push({
                    index: i,
                    x: geometry.x,
                    y: geometry.y,
                    width: geometry.width,
                    height: geometry.height,
                    is_primary: i === primaryMonitor,
                    connector: "",  // Connector name not available via stable API
                    scale: scale,
                });
            }

            console.debug(`[Window Control] ListMonitors() returning ${result.length} monitors`);
            return JSON.stringify(result);
        } catch (e) {
            console.error(`[Window Control] ListMonitors() error: ${e.message}`);
            return '[]';
        }
    }

    // Activate: Activate (focus and raise) a window by ID
    Activate(windowId) {
        return this._actOnWindow(windowId, 'Activate',
            win => win.activate(global.get_current_time()));
    }

    // ActivateByTitle: Activate window by exact title match
    ActivateByTitle(title) {
        return this._activateMatching('title', title);
    }

    // ActivateByTitleSubstring: Activate window by title substring
    ActivateByTitleSubstring(substring) {
        return this._activateMatching('substring', substring);
    }

    // ActivateByWmClass: Activate window by WM class (exact match)
    ActivateByWmClass(wmClass) {
        return this._activateMatching('class', wmClass);
    }

    // ActivateByPid: Activate window by PID. The int32 goes through the same
    // predicate as the string form, so 0 and negatives are refused here too.
    ActivateByPid(pid) {
        return this._activateMatching('pid', String(pid));
    }

    // Focus: Focus a window by ID (without raising)
    Focus(windowId) {
        return this._actOnWindow(windowId, 'Focus',
            win => win.focus(global.get_current_time()));
    }

    // GetFocused: Get the currently focused window. Mutter keeps it as a
    // property, so this is one read rather than a walk over every actor; the
    // NORMAL filter every other method applies still holds, so a focused
    // dialog reports "no focused window" as it always has.
    GetFocused() {
        console.debug(`[Window Control] GetFocused() called`);
        try {
            const focused = global.display.focus_window;
            const win = focused && focused.get_window_type() === Meta.WindowType.NORMAL
                ? focused : null;
            if (win) {
                const id = win.get_id();
                const title = win.get_title() || '';
                const wmClass = win.get_wm_class() || '';
                console.debug(`[Window Control] GetFocused() -> ${id}`);
                return [id, title, wmClass];
            }
            console.debug(`[Window Control] GetFocused() -> no focused window`);
            return [0, '', ''];
        } catch (e) {
            console.error(`[Window Control] GetFocused() error: ${e.message}`);
            return [0, '', ''];
        }
    }

    // Move: Move window to position. Raises instead of returning a flag; see
    // the ERRORS block in dbus-interface.js.
    MoveAsync([windowId, x, y], invocation) {
        console.debug(`[Window Control] Move(${windowId}, ${x}, ${y}) called`);
        this._geometryCall(invocation, 'Move', () => {
            if (!_areFiniteNumbers([x, y])) {
                throw new NamedError(DBUS_ERROR_INVALID_ARGS,
                    'Move: x and y must be finite numbers');
            }
            const win = this._geometryTarget(windowId, 'Move');
            win.move_frame(true, x, y);
            console.debug(`[Window Control] Move(${windowId}) -> ok`);
        });
    }

    // Resize: Resize window (keeps position). Raises on failure.
    ResizeAsync([windowId, width, height], invocation) {
        console.debug(`[Window Control] Resize(${windowId}, ${width}, ${height}) called`);
        this._geometryCall(invocation, 'Resize', () => {
            if (!_arePositiveNumbers([width, height])) {
                throw new NamedError(DBUS_ERROR_INVALID_ARGS,
                    'Resize: width and height must be positive finite numbers');
            }
            const win = this._geometryTarget(windowId, 'Resize');
            const rect = win.get_frame_rect();
            win.move_resize_frame(true, rect.x, rect.y, width, height);
            console.debug(`[Window Control] Resize(${windowId}) -> ok`);
        });
    }

    // MoveResize: Move and resize window atomically. Raises on failure.
    MoveResizeAsync([windowId, x, y, width, height], invocation) {
        console.debug(`[Window Control] MoveResize(${windowId}, ${x}, ${y}, ${width}, ${height}) called`);
        this._geometryCall(invocation, 'MoveResize', () => {
            if (!_areFiniteNumbers([x, y]) || !_arePositiveNumbers([width, height])) {
                throw new NamedError(DBUS_ERROR_INVALID_ARGS,
                    'MoveResize: x and y must be finite and width and height positive');
            }
            const win = this._geometryTarget(windowId, 'MoveResize');
            win.move_resize_frame(true, x, y, width, height);
            console.debug(`[Window Control] MoveResize(${windowId}) -> ok`);
        });
    }

    // GetGeometry: Get window geometry
    GetGeometry(windowId) {
        console.debug(`[Window Control] GetGeometry(${windowId}) called`);
        try {
            const win = this._findWindowById(windowId);
            if (win) {
                const rect = win.get_frame_rect();
                console.debug(`[Window Control] GetGeometry(${windowId}) -> (${rect.x}, ${rect.y}, ${rect.width}, ${rect.height})`);
                return [rect.x, rect.y, rect.width, rect.height];
            }
            console.debug(`[Window Control] GetGeometry(${windowId}) -> not found`);
            return [-1, -1, -1, -1];
        } catch (e) {
            console.error(`[Window Control] GetGeometry() error: ${e.message}`);
            return [-1, -1, -1, -1];
        }
    }

    // GetVersion: the extension version the RUNNING shell has loaded.
    //
    // Deliberately not read from metadata.json: that file is what is on disk,
    // and on Wayland an install lands there while the shell keeps serving the
    // old code until the user logs out. Reporting the loaded value is what lets
    // a caller detect exactly that.
    GetVersion() {
        console.debug(`[Window Control] GetVersion() -> ${this._version}`);
        return this._version;
    }

    // GetWorkarea: Get usable workspace area for a monitor
    GetWorkarea(monitorIndex) {
        console.debug(`[Window Control] GetWorkarea(${monitorIndex}) called`);
        try {
            // Validate monitor index
            const numMonitors = global.display.get_n_monitors();
            if (typeof monitorIndex !== "number" ||
                !Number.isFinite(monitorIndex) ||
                monitorIndex < 0 ||
                monitorIndex >= numMonitors) {
                console.debug(`[Window Control] GetWorkarea: Invalid monitor index ${monitorIndex} (valid: 0-${numMonitors-1})`);
                return [-1, -1, -1, -1];
            }

            // Get active workspace
            const workspace = global.workspace_manager.get_active_workspace();

            // Get work area for the specified monitor
            const rect = workspace.get_work_area_for_monitor(monitorIndex);

            console.debug(`[Window Control] GetWorkarea(${monitorIndex}) -> (${rect.x}, ${rect.y}, ${rect.width}, ${rect.height})`);
            return [rect.x, rect.y, rect.width, rect.height];
        } catch (e) {
            console.error(`[Window Control] GetWorkarea() error: ${e.message}`);
            return [-1, -1, -1, -1];
        }
    }

    // ListWorkspaces: Get all workspaces as JSON string
    ListWorkspaces() {
        console.debug(`[Window Control] ListWorkspaces() called`);
        try {
            const manager = global.workspace_manager;
            const numWorkspaces = manager.get_n_workspaces();
            const activeIndex = manager.get_active_workspace_index();
            // One pass over the windows rather than one per workspace: a
            // sticky window is located on every workspace, any other on the
            // one it reports (or none, mid-move).
            const counts = new Array(numWorkspaces).fill(0);
            let sticky = 0;
            for (const win of this._getAllWindows()) {
                if (win.is_on_all_workspaces()) {
                    sticky++;
                    continue;
                }
                const index = win.get_workspace()?.index();
                if (this._isValidIndex(index, numWorkspaces))
                    counts[index]++;
            }
            const result = [];

            for (let i = 0; i < numWorkspaces; i++) {
                result.push({
                    index: i,
                    name: Meta.prefs_get_workspace_name(i) || '',
                    is_active: i === activeIndex,
                    window_count: counts[i] + sticky,
                });
            }

            console.debug(`[Window Control] ListWorkspaces() returning ${result.length} workspaces`);
            return JSON.stringify(result);
        } catch (e) {
            console.error(`[Window Control] ListWorkspaces() error: ${e.message}`);
            return '[]';
        }
    }

    // ActivateWorkspace: Switch to a workspace by index.
    // While the Activities overview is shown, Meta.Workspace.activate() leaves
    // the active workspace unchanged (verified on GNOME 46), so the overview is
    // hidden first. The result is read back rather than assumed, so a switch
    // that did not take effect reports false.
    ActivateWorkspace(workspaceIndex) {
        console.debug(`[Window Control] ActivateWorkspace(${workspaceIndex}) called`);
        try {
            const manager = global.workspace_manager;
            if (!this._isValidIndex(workspaceIndex, manager.get_n_workspaces())) {
                console.debug(`[Window Control] ActivateWorkspace(${workspaceIndex}) -> false (invalid index)`);
                return false;
            }
            if (Main.overview.visible)
                Main.overview.hide();
            manager.get_workspace_by_index(workspaceIndex).activate(global.get_current_time());
            const switched = manager.get_active_workspace_index() === workspaceIndex;
            console.debug(`[Window Control] ActivateWorkspace(${workspaceIndex}) -> ${switched}`);
            return switched;
        } catch (e) {
            console.error(`[Window Control] ActivateWorkspace() error: ${e.message}`);
            return false;
        }
    }

    // MoveToWorkspace: Move a window to a workspace by index.
    // change_workspace_by_index() returns void and declines silently for a
    // window mutter holds on all workspaces -- and with the GNOME default
    // workspaces-only-on-primary=true that is every window on a secondary
    // monitor. Reporting the call as a success there would claim a move that
    // never happened, so the workspace is read back, the way ActivateWorkspace
    // reads back its switch. The assignment is synchronous, so this sees the
    // final state.
    MoveToWorkspace(windowId, workspaceIndex) {
        if (!this._isValidIndex(workspaceIndex, global.workspace_manager.get_n_workspaces())) {
            console.debug(`[Window Control] MoveToWorkspace(${windowId}, ${workspaceIndex}) -> false (invalid index)`);
            return false;
        }
        return this._actOnWindow(windowId, 'MoveToWorkspace', win => {
            win.change_workspace_by_index(workspaceIndex, false);
            return !win.is_on_all_workspaces() &&
                win.get_workspace()?.index() === workspaceIndex;
        });
    }

    // MoveToMonitor: Move a window to a monitor by index
    MoveToMonitor(windowId, monitorIndex) {
        if (!this._isValidIndex(monitorIndex, global.display.get_n_monitors())) {
            console.debug(`[Window Control] MoveToMonitor(${windowId}, ${monitorIndex}) -> false (invalid index)`);
            return false;
        }
        return this._actOnWindow(windowId, 'MoveToMonitor',
            win => win.move_to_monitor(monitorIndex));
    }

    // WaitForWindow: Reply with the ID of a shown window matching (kind, value),
    // either immediately if one exists or when one appears, or 0 after timeoutMs.
    // Async handler (GJS convention: <Method>Async(params, invocation)) so the
    // shell main loop is never blocked; the reply is sent from a signal handler
    // or the timeout source.
    WaitForWindowAsync([kind, value, timeoutMs], invocation) {
        // `kind` is NOT logged yet: it is caller-supplied and unvalidated here,
        // so interpolating it would write an arbitrary remote string -- embedded
        // newlines included -- into the journal, which is exactly what the
        // logging invariant above forbids. It is logged only once
        // _matchPredicate() has proved it is one of the four keywords.
        console.debug(`[Window Control] WaitForWindow() called`);
        let waiter = null;
        try {
            const predicate = this._matchPredicate(kind, value);
            if (!predicate || !Number.isInteger(timeoutMs) || timeoutMs <= 0) {
                console.debug(`[Window Control] WaitForWindow() -> InvalidArgs`);
                invocation.return_dbus_error(DBUS_ERROR_INVALID_ARGS,
                    `WaitForWindow: kind must be class|title|substring|pid (pid numeric) and timeout_ms > 0`);
                return;
            }
            console.debug(`[Window Control] WaitForWindow(${kind}, ..., ${timeoutMs}) validated`);

            const existing = this._findWindowByPredicate(w => predicate(w) && !this._isUnshown(w));
            if (existing) {
                console.debug(`[Window Control] WaitForWindow(${kind}) -> ${existing.get_id()} (already present)`);
                invocation.return_value(new GLib.Variant('(t)', [existing.get_id()]));
                return;
            }

            waiter = { predicate, invocation, timeoutId: 0 };
            waiter.timeoutId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, timeoutMs, () => {
                waiter.timeoutId = 0;
                console.debug(`[Window Control] WaitForWindow(${kind}) -> 0 (timeout)`);
                this._finishWaiter(waiter, 0);
                return GLib.SOURCE_REMOVE;
            });
            this._waiters.push(waiter);
            this._startWatching();
            this._trackExistingWindows();
        } catch (e) {
            console.error(`[Window Control] WaitForWindow() error: ${e.message}`);
            // Once the waiter is registered it owns the invocation and its
            // timeout will reply, so answering here too would reply twice on the
            // same invocation. Retire it instead, which replies exactly once.
            if (waiter && this._waiters.includes(waiter))
                this._failWaiter(waiter, e.message);
            else
                invocation.return_dbus_error(DBUS_ERROR_FAILED, e.message);
        }
    }

    // WaitForGeometry: reply once the window's frame has held still for
    // quiet_ms, with the rect as it then stands.
    //
    // Async (GJS convention: <Method>Async(params, invocation)) for the same
    // reason WaitForWindow is: the reply comes from a signal handler or a timer
    // and the shell main loop is never blocked.
    //
    // The quiet period is a heuristic and is meant to be. What it removes is
    // the SAMPLING: a client outside the shell can only poll get_frame_rect()
    // and compare, which costs a round trip per sample and still races the
    // compositor. Here every change is a signal, so the timer only has to
    // outlast the gap between two of them.
    WaitForGeometryAsync([windowId, quietMs, timeoutMs], invocation) {
        console.debug(`[Window Control] WaitForGeometry(${windowId}, ${quietMs}, ${timeoutMs}) called`);
        let watcher = null;
        try {
            if (!Number.isInteger(quietMs) || quietMs <= 0 ||
                !Number.isInteger(timeoutMs) || timeoutMs < quietMs) {
                console.debug(`[Window Control] WaitForGeometry() -> InvalidArgs`);
                invocation.return_dbus_error(DBUS_ERROR_INVALID_ARGS,
                    'WaitForGeometry: quiet_ms > 0 and timeout_ms >= quiet_ms');
                return;
            }

            const win = this._findWindowById(windowId);
            if (!win) {
                console.debug(`[Window Control] WaitForGeometry(${windowId}) -> NotFound`);
                invocation.return_dbus_error(DBUS_ERROR_NOT_FOUND,
                    `Window not found: ${windowId}`);
                return;
            }

            watcher = { win, windowId, invocation, quietMs, quietId: 0, timeoutId: 0, signalIds: [] };
            // Registered BEFORE anything is connected, and each id is stored
            // as it is obtained: a throw part-way through then lands in the
            // catch below, which retires the watcher and disconnects whatever
            // was connected. Registering after would leave those handlers
            // attached for the window's whole life, `bump` arming timers that
            // settle nothing.
            this._geometryWatchers.push(watcher);
            const bump = () => this._restartQuietPeriod(watcher);
            watcher.signalIds.push(win.connect('size-changed', bump));
            watcher.signalIds.push(win.connect('position-changed', bump));
            watcher.signalIds.push(win.connect('unmanaged', () => this._failGeometryWatcher(
                watcher, DBUS_ERROR_NOT_FOUND,
                `Window ${windowId} closed while waiting for its frame to settle`)));

            // The quiet period is attached BEFORE the overall timeout. A caller
            // is allowed to pass timeout_ms === quiet_ms, and GLib dispatches
            // sources of equal priority that come ready together in the order
            // they were attached -- so with the timeout first, a frame that was
            // never moving would answer Timeout instead of settling.
            //
            // Starting it now is also what lets an ALREADY still frame settle,
            // rather than waiting for a change that never comes.
            this._restartQuietPeriod(watcher);
            watcher.timeoutId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, timeoutMs, () => {
                watcher.timeoutId = 0;
                console.debug(`[Window Control] WaitForGeometry(${windowId}) -> Timeout`);
                this._failGeometryWatcher(watcher, DBUS_ERROR_TIMEOUT,
                    `Window ${windowId} frame did not settle within ${timeoutMs} ms`);
                return GLib.SOURCE_REMOVE;
            });
        } catch (e) {
            console.error(`[Window Control] WaitForGeometry() error: ${e.message}`);
            // Once registered the watcher owns the invocation and one of its
            // timers will reply, so answering here too would reply twice.
            if (watcher && this._geometryWatchers.includes(watcher))
                this._failGeometryWatcher(watcher, DBUS_ERROR_FAILED, e.message);
            else
                invocation.return_dbus_error(DBUS_ERROR_FAILED, e.message);
        }
    }

    // Every frame change restarts the quiet timer, so it only fires once the
    // frame has been still for the whole period.
    _restartQuietPeriod(watcher) {
        if (watcher.quietId)
            GLib.source_remove(watcher.quietId);
        watcher.quietId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, watcher.quietMs, () => {
            watcher.quietId = 0;
            this._settleGeometryWatcher(watcher);
            return GLib.SOURCE_REMOVE;
        });
    }

    // Drop a watcher's timers, signal handlers and list entry. Returns false if
    // it was already retired, which is what keeps the quiet timer, the overall
    // timeout and 'unmanaged' from replying twice when they race.
    _retireGeometryWatcher(watcher) {
        const index = this._geometryWatchers.indexOf(watcher);
        if (index === -1)
            return false;
        this._geometryWatchers.splice(index, 1);
        if (watcher.quietId) {
            GLib.source_remove(watcher.quietId);
            watcher.quietId = 0;
        }
        if (watcher.timeoutId) {
            GLib.source_remove(watcher.timeoutId);
            watcher.timeoutId = 0;
        }
        for (const id of watcher.signalIds)
            watcher.win.disconnect(id);
        watcher.signalIds = [];
        return true;
    }

    _settleGeometryWatcher(watcher) {
        if (!this._retireGeometryWatcher(watcher))
            return;
        const rect = watcher.win.get_frame_rect();
        console.debug(`[Window Control] WaitForGeometry(${watcher.windowId}) -> settled`);
        watcher.invocation.return_value(
            new GLib.Variant('(iiii)', [rect.x, rect.y, rect.width, rect.height]));
    }

    _failGeometryWatcher(watcher, name, message) {
        if (!this._retireGeometryWatcher(watcher))
            return;
        watcher.invocation.return_dbus_error(name, message);
    }

    _cancelGeometryWatchers() {
        const pending = [...this._geometryWatchers];
        for (const watcher of pending) {
            this._failGeometryWatcher(watcher, DBUS_ERROR_DISABLED,
                'Window Control extension disabled');
        }
        if (pending.length > 0)
            console.debug(`[Window Control] cancelled ${pending.length} pending WaitForGeometry call(s)`);
    }

    // Connect 'window-created' (idempotent).
    _startWatching() {
        if (this._windowCreatedId)
            return;
        this._windowCreatedId = global.display.connect('window-created',
            (display, win) => this._onWindowCreated(win));
    }

    // Disconnect 'window-created' and every per-window handler.
    _stopWatching() {
        if (this._windowCreatedId) {
            global.display.disconnect(this._windowCreatedId);
            this._windowCreatedId = 0;
        }
        for (const win of [...this._trackedWindows.keys()])
            this._untrackWindow(win);
    }

    // A new window may not carry its wm_class or title yet when 'window-created'
    // fires (on Wayland the app id arrives with a later commit), and it is not
    // shown (mapped and placed) until the client commits its first buffer, so
    // evaluate now and again when either property is set and when the window is
    // shown. Handlers are dropped once the window matched, was unmanaged, or no
    // waiter is left.
    _onWindowCreated(win) {
        // Remember that this window was watched from creation: _isUnshown()
        // needs to tell "mutter has not mapped it yet" from "mapped, currently
        // hidden", and for a window seen from the start that is knowable.
        this._createdWhileWatching.add(win);
        this._trackWindow(win);
        this._evaluateWindow(win);
    }

    // Connect the per-window handlers. Does not evaluate: the caller has
    // either just scanned every window (WaitForWindow) or evaluates itself.
    //
    // 'window-type' is watched too: on Wayland a toplevel is created NORMAL
    // and a later gtk_surface.set_modal retypes it to MODAL_DIALOG, so a
    // window that was the wrong type at one evaluation may be the right one
    // at the next, and the reverse.
    _trackWindow(win) {
        const evaluate = () => {
            this._evaluateWindow(win);
            // Handlers stay connected while ANY waiter is pending: a waiter this
            // window did not satisfy may still be waiting for a title or class
            // that changes later. _finishWaiter() untracks everything through
            // _stopWatching() once the last waiter is gone.
            if (this._waiters.length === 0)
                this._untrackWindow(win);
        };
        const ids = [
            win.connect('notify::wm-class', evaluate),
            win.connect('notify::title', evaluate),
            win.connect('notify::window-type', evaluate),
            win.connect('shown', evaluate),
            win.connect('unmanaged', () => this._untrackWindow(win)),
        ];
        this._trackedWindows.set(win, ids);
    }

    // Track every window that already exists when a waiter registers.
    //
    // 'window-created' only fires for windows created after _startWatching(),
    // so without this two cases never wake a waiter: the window created in the
    // gap just before the call, which has already missed the signal and is
    // still unshown; and any window already on screen whose title or class
    // changes later -- `wait -t 'Report.pdf - LibreOffice Writer'` against an
    // already-open LibreOffice, or `wait -c` against a Wayland client whose
    // app_id lands after mapping.
    //
    // The predicate is deliberately not applied: on Wayland wm_class and title
    // arrive after creation, so a window that cannot match yet may match once
    // 'notify::wm-class' fires. Nothing is evaluated here either -- the caller
    // has just scanned every shown window, so a second pass cannot match.
    // Handlers cost five connections per window and only exist while a wait
    // is pending.
    _trackExistingWindows() {
        for (const win of this._getAllWindows()) {
            if (!this._trackedWindows.has(win))
                this._trackWindow(win);
        }
    }

    _untrackWindow(win) {
        const ids = this._trackedWindows.get(win);
        if (!ids)
            return;
        for (const id of ids)
            win.disconnect(id);
        this._trackedWindows.delete(win);
    }

    // Reply to every waiter the window satisfies. Returns true if any did.
    // An unshown window never satisfies a waiter (see _isUnshown).
    _evaluateWindow(win) {
        if (win.get_window_type() !== Meta.WindowType.NORMAL || this._isUnshown(win))
            return false;
        let matched = false;
        for (const waiter of [...this._waiters]) {
            if (waiter.predicate(win)) {
                console.debug(`[Window Control] WaitForWindow -> ${win.get_id()} (window appeared)`);
                this._finishWaiter(waiter, win.get_id());
                matched = true;
            }
        }
        return matched;
    }

    _finishWaiter(waiter, windowId) {
        this._retireWaiter(waiter);
        waiter.invocation.return_value(new GLib.Variant('(t)', [windowId]));
        if (this._waiters.length === 0)
            this._stopWatching();
    }

    // Retire a registered waiter with a D-Bus error instead of a window ID.
    _failWaiter(waiter, message) {
        this._retireWaiter(waiter);
        waiter.invocation.return_dbus_error(DBUS_ERROR_FAILED, message);
        if (this._waiters.length === 0)
            this._stopWatching();
    }

    // Drop a waiter's timeout source and remove it from the pending list, so
    // exactly one reply can still be sent on its invocation.
    _retireWaiter(waiter) {
        if (waiter.timeoutId) {
            GLib.source_remove(waiter.timeoutId);
            waiter.timeoutId = 0;
        }
        this._waiters = this._waiters.filter(w => w !== waiter);
    }

    // Fail every pending WaitForWindow call and drop all signal handlers and
    // timeout sources. Called from disable(); leaves nothing behind.
    _cancelWaiters() {
        const pending = this._waiters;
        this._waiters = [];
        for (const waiter of pending) {
            if (waiter.timeoutId)
                GLib.source_remove(waiter.timeoutId);
            waiter.invocation.return_dbus_error(DBUS_ERROR_DISABLED, 'Window Control extension disabled');
        }
        this._stopWatching();
        if (pending.length > 0)
            console.debug(`[Window Control] cancelled ${pending.length} pending WaitForWindow call(s)`);
    }

    // Minimize: Minimize window
    Minimize(windowId) {
        return this._actOnWindow(windowId, 'Minimize', win => win.minimize());
    }

    // Unminimize: Unminimize (restore) window
    Unminimize(windowId) {
        return this._actOnWindow(windowId, 'Unminimize', win => win.unminimize());
    }

    // Maximize: Maximize window
    Maximize(windowId) {
        return this._actOnWindow(windowId, 'Maximize', win => _maximizeWindow(win));
    }

    // Unmaximize: Unmaximize window
    Unmaximize(windowId) {
        return this._actOnWindow(windowId, 'Unmaximize', win => _unmaximizeWindow(win));
    }

    // Fullscreen: Make window fullscreen
    Fullscreen(windowId) {
        return this._actOnWindow(windowId, 'Fullscreen', win => win.make_fullscreen());
    }

    // Unfullscreen: Exit fullscreen mode
    Unfullscreen(windowId) {
        return this._actOnWindow(windowId, 'Unfullscreen', win => win.unmake_fullscreen());
    }

    // SetAbove: Set window always-on-top state
    SetAbove(windowId, above) {
        return this._actOnWindow(windowId, 'SetAbove',
            win => above ? win.make_above() : win.unmake_above());
    }

    // SetSticky: Set window sticky state (on all workspaces).
    // unstick() only withdraws the window's own request; mutter still holds a
    // window on all workspaces while it is on a secondary monitor with
    // workspaces-only-on-primary set (the GNOME default), so the state is read
    // back the way MoveToWorkspace reads back its move.
    SetSticky(windowId, sticky) {
        return this._actOnWindow(windowId, 'SetSticky', win => {
            if (sticky)
                win.stick();
            else
                win.unstick();
            return win.is_on_all_workspaces() === sticky;
        });
    }

    // Close: Close window (polite request)
    Close(windowId) {
        return this._actOnWindow(windowId, 'Close',
            win => win.delete(global.get_current_time()));
    }

    export() {
        this._dbusImpl.export(Gio.DBus.session, DBUS_OBJECT_PATH);
    }

    unexport() {
        this._cancelWaiters();
        this._cancelGeometryWatchers();
        this._dbusImpl.unexport();
    }
}

export default class WindowControlExtension extends Extension {
    enable() {
        console.log(`[${this.metadata.name}] Enabling extension...`);

        try {
            this._service = new WindowControlService(this.metadata);
            this._service.export();
            console.log(`[${this.metadata.name}] D-Bus service registered at ${DBUS_OBJECT_PATH}`);
        } catch (e) {
            console.error(`[${this.metadata.name}] Failed to register D-Bus service: ${e.message}`);
            throw e;
        }

        console.log(`[${this.metadata.name}] Extension enabled`);
    }

    disable() {
        console.log(`[${this.metadata.name}] Disabling extension...`);

        if (this._service) {
            try {
                this._service.unexport();
                this._service = null;
                console.log(`[${this.metadata.name}] D-Bus service unregistered`);
            } catch (e) {
                console.error(`[${this.metadata.name}] Failed to unregister D-Bus service: ${e.message}`);
            }
        }

        console.log(`[${this.metadata.name}] Extension disabled`);
    }
}
