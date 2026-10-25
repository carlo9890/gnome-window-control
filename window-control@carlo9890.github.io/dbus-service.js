// SPDX-FileCopyrightText: 2026 hko9890
// SPDX-License-Identifier: MIT
// The D-Bus service: one exported object and its method handlers.

import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Meta from 'gi://Meta';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import { DBUS_INTERFACE_XML } from './dbus-interface.js';
import { matchPredicate } from './rules-format.js';
import {
    isFullyMaximized, maximizeFlags, maximizeWindow, unmaximizeWindow,
} from './window-helpers.js';

// Parsed once and kept for the life of the shell, never per enable(). GJS
// cache_build()s the info it exports and never releases it, and GLib keys that
// method cache by the info's address without holding a reference. An info
// parsed per enable() is freed after disable(), and a later one allocated at
// the same address inherits the stale cache: every call then fails with
// "No such method" while introspection still lists the method.
const DBUS_INTERFACE_INFO = Gio.DBusInterfaceInfo.new_for_xml(DBUS_INTERFACE_XML);

// Reported by GetCapabilities. A name here is a promise a caller may rely on,
// so it is added together with the feature and never removed while the
// feature is served. 'rules' means rules.json is read and applied;
// 'rules-title-affix' means its title_prefix and title_suffix match keys are
// known -- an extension without it refuses a file that carries one, whole;
// 'rules-class-prefix' means the same for its class_prefix match key;
// 'keybindings' means the tile shortcuts in the settings schema are served,
// and is left out when their registration failed;
// 'no-animation' means MinimizeNoAnimation and UnminimizeNoAnimation are;
// 'activate-no-animation' means ActivateNoAnimation is.
const CAPABILITIES = [
    'rules', 'rules-title-affix', 'rules-class-prefix', 'keybindings', 'no-animation',
    'activate-no-animation',
];

// The match kinds the D-Bus methods take. rules.json has more (see
// MATCH_KINDS in rules-format.js); those stay out of this interface.
const SELECTOR_KINDS = ['class', 'title', 'substring', 'pid'];

export const DBUS_OBJECT_PATH = '/org/gnome/Shell/Extensions/WindowControl';
const DBUS_ERROR_DISABLED = 'org.gnome.Shell.Extensions.WindowControl.Disabled';
const DBUS_ERROR_NOT_FOUND = 'org.gnome.Shell.Extensions.WindowControl.NotFound';
const DBUS_ERROR_REFUSED = 'org.gnome.Shell.Extensions.WindowControl.Refused';
const DBUS_ERROR_TIMEOUT = 'org.gnome.Shell.Extensions.WindowControl.Timeout';
const DBUS_ERROR_INVALID_ARGS = 'org.freedesktop.DBus.Error.InvalidArgs';
const DBUS_ERROR_FAILED = 'org.freedesktop.DBus.Error.Failed';

// A failure that must reach the caller as a specific D-Bus error name.
//
// Gio.DBusError.new_for_dbus_error() does not work here: it returns a
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
// warning for every ordinary refusal.
class NamedError extends Error {
    constructor(name, message) {
        super(message);
        this.dbusName = name;
    }
}

function _workspaceIndex(win) {
    return win.is_on_all_workspaces() ? -1 : (win.get_workspace()?.index() ?? -1);
}

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

// Per-call lines use console.debug(), which GLib drops unless
// G_MESSAGES_DEBUG is set; console.log() would leave a journal line per D-Bus
// call. No line holds a title, a WM class or a match value: titles leak
// document names and URLs into a log that outlives the caller. A caller's
// `kind` is logged only after _matchPredicate() has accepted it, since until
// then it is arbitrary text, newlines included.
export class WindowControlService {
    constructor(metadata) {
        this._dbusImpl = Gio.DBusExportedObject.wrapJSObject(
            DBUS_INTERFACE_INFO,
            this
        );
        // Reported by GetVersion. Read from the metadata the shell loaded, not
        // from metadata.json on disk: those two disagreeing is the whole point
        // of the method, because on Wayland an install lands on disk and the
        // shell keeps running the old copy until the user logs out.
        this._version = String(metadata.version);
        // Set by the extension once WindowKeybindings has registered them.
        this.keybindingsServed = false;
        // WaitForWindow state. A window is tracked only while at least one
        // waiter is pending.
        this._waiters = [];
        this._trackedWindows = new Map();   // Meta.Window -> [signal handler ids]
        // Mutter exposes no "has been mapped" getter, so record it: a window
        // seen unhidden once has been placed, and that never becomes untrue.
        this._shownWindows = new WeakSet();
        // Every window created while the service runs, and a one-shot 'shown'
        // watch on each untracked one until its first map (Meta.Window ->
        // [signal handler ids]), so _isUnshown() knows the answer for all of
        // them. A window costs two handlers until it is first shown, and none
        // after.
        this._createdSinceStart = new WeakSet();
        this._firstShowWatches = new Map();
        this._windowCreatedId = global.display.connect('window-created',
            (display, win) => this._onWindowCreated(win));
        // WaitForGeometry state, one entry per pending call.
        this._geometryWatchers = [];
    }

    // NORMAL windows only: every method works on these.
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

    _findWindowById(id) {
        return this._findWindowByPredicate(win => win.get_id() === id);
    }

    _findWindowByPredicate(predicate) {
        return this._getAllWindows().find(predicate) ?? null;
    }

    _isValidIndex(value, count) {
        return Number.isInteger(value) && value >= 0 && value < count;
    }

    // The state in which mutter drops a frame geometry request outright.
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
    //   maximized VERTICAL  x honoured, y pinned     the move half happens
    //
    // A tiled window reports MAXIMIZE_VERTICAL and nothing else, and GJS has no
    // tiled predicate, so the vertical case cannot be told from the tiled one.
    // Both are refused. For a genuinely tiled window that is exactly right; for
    // a merely vertically-maximized one it refuses a request that would have
    // been half-applied while reporting success.
    //
    // Verifying instead of refusing is not available: move_resize_frame() is
    // asynchronous, and get_frame_rect() read in the same handler still returns
    // the old rect even for a move that succeeds (measured), so a post-call
    // comparison would report failure for every successful call. (Waiting for
    // it to settle is available -- see WaitForGeometry -- but that is a
    // separate call, deliberately: a geometry request must stay cheap.)
    //
    // Returns the reason as a phrase, or null when the frame is free. Naming
    // the state is the point: a client outside the shell can read
    // is_maximized/is_fullscreen for itself but has no tiled predicate at all,
    // so it could never tell the third case from the second.
    _frameRefusal(win) {
        if (win.is_fullscreen())
            return 'the window is fullscreen; unfullscreen it first';
        const flags = maximizeFlags(win);
        if (flags === Meta.MaximizeFlags.BOTH)
            return 'the window is maximized; unmaximize it first';
        if (flags !== 0)
            return 'the window is tiled or maximized on one axis; unmaximize it first';
        return null;
    }

    // Shared preamble for the geometry handlers: find the window and check the
    // frame, raising a named error for either failure.
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

    // The (kind, value) selector predicate, shared with rules.json.
    // See matchPredicate() in rules-format.js for the values it refuses.
    _matchPredicate(kind, value) {
        return SELECTOR_KINDS.includes(kind) ? matchPredicate(kind, value) : null;
    }

    // Has mutter mapped and placed this window at least once?
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

    // True for a window that mutter has created but not yet mapped and
    // placed. A geometry request on such a window is overridden by mutter's
    // initial placement, so WaitForWindow must not reply before it is shown.
    //
    // is_hidden() alone cannot answer this: minimized windows and windows on
    // another workspace are hidden too, and both are placed. For a window
    // created while the service runs the answer is known outright -- its
    // first-show watch records the map, so if it has never been seen unhidden
    // it has never been mapped, whatever the reason it is hidden now, also
    // when it was created minimized or on another workspace.
    //
    // A window that predates the service (it is rebuilt at every enable,
    // and GNOME disables the extension while the screen is locked) has no such
    // history, so it is judged by its current state: hidden while unminimized
    // and on the active workspace is the only shape a not-yet-mapped window can
    // have. Mutter also hides a transient window while a window it is transient
    // for is minimized, so such a window counts as placed.
    _isUnshown(win) {
        if (this._hasBeenShown(win))
            return false;
        if (this._createdSinceStart.has(win))
            return true;
        for (let parent = win.get_transient_for(); parent; parent = parent.get_transient_for()) {
            if (parent.minimized)
                return false;
        }
        return !win.minimized &&
            win.located_on_workspace(global.workspace_manager.get_active_workspace());
    }

    // Look up a window by ID and run an action on it, for the simple boolean
    // handlers. Returns false if the window is missing or the action returns
    // false -- which is how an action that reads its result back
    // (MoveToWorkspace, SetSticky) reports a change mutter declined. An action
    // that returns nothing counts as success.
    _actOnWindow(windowId, label, action) {
        const win = this._findWindowById(windowId);
        if (!win) {
            console.debug(`[Window Control] ${label}(${windowId}) -> false (window not found)`);
            return false;
        }
        const ok = action(win) !== false;
        console.debug(`[Window Control] ${label}(${windowId}) -> ${ok}`);
        return ok;
    }

    // The ActivateBy* contract. Activates the first window matching
    // (kind, value) and returns true; false if none does or the value is one
    // _matchPredicate refuses. `kind` is one of this file's own keywords, never
    // caller-supplied, so it is safe to log; the value is not logged.
    _activateMatching(kind, value) {
        const label = `ActivateBy(${kind})`;
        console.debug(`[Window Control] ${label} called`);
        const predicate = this._matchPredicate(kind, value);
        const win = predicate ? this._findWindowByPredicate(predicate) : null;
        if (win) {
            win.activate(global.get_current_time());
            console.debug(`[Window Control] ${label} -> true`);
            return true;
        }
        console.debug(`[Window Control] ${label} -> false (not found)`);
        return false;
    }

    // Element order is the List signature a(tssssbiiii) in dbus-interface.js.
    List() {
        console.debug('[Window Control] List() called');
        const result = this._getAllWindows().map(win => [
            win.get_id(),
            win.get_title() || '',
            win.get_wm_class() || '',
            win.get_wm_class_instance() || '',
            win.get_sandboxed_app_id() || '',
            win.has_focus(),
            _workspaceIndex(win),
            win.get_monitor(),
            win.get_pid(),
            win.get_window_type(),
        ]);
        console.debug(`[Window Control] List() returning ${result.length} windows`);
        return result;
    }

    ListDetailed() {
        console.debug('[Window Control] ListDetailed() called');
        const result = [];

        for (const win of this._getAllWindows()) {
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
                // Differs from has_focus, e.g. true while an attached modal
                // dialog holds the focus. A property read: Meta.Window also
                // has an appears_focused() method, which this name hides.
                appears_focused: win.appears_focused,
                is_hidden: win.is_hidden(),
                is_minimized: win.minimized,
                is_maximized: isFullyMaximized(win),
                is_fullscreen: win.is_fullscreen(),
                is_above: win.is_above(),
                is_on_all_workspaces: win.is_on_all_workspaces(),
                is_skip_taskbar: win.is_skip_taskbar(),
                workspace_index: _workspaceIndex(win),
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
                // Has mutter mapped and placed it at least once? Exact for a
                // window created since enable; see _isUnshown() for the rest.
                has_been_shown: !this._isUnshown(win),
            });
        }

        console.debug(`[Window Control] ListDetailed() returning ${result.length} windows`);
        return JSON.stringify(result);
    }

    ListMonitors() {
        console.debug('[Window Control] ListMonitors() called');
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
                connector: '',  // Connector name not available via stable API
                scale: scale,
            });
        }

        console.debug(`[Window Control] ListMonitors() returning ${result.length} monitors`);
        return JSON.stringify(result);
    }

    Activate(windowId) {
        return this._actOnWindow(windowId, 'Activate',
            win => win.activate(global.get_current_time()));
    }

    ActivateByTitle(title) {
        return this._activateMatching('title', title);
    }

    ActivateByTitleSubstring(substring) {
        return this._activateMatching('substring', substring);
    }

    ActivateByWmClass(wmClass) {
        return this._activateMatching('class', wmClass);
    }

    // The int32 goes through the same predicate as the string form, so 0 and
    // negatives are refused here too.
    ActivateByPid(pid) {
        return this._activateMatching('pid', String(pid));
    }

    Focus(windowId) {
        return this._actOnWindow(windowId, 'Focus',
            win => win.focus(global.get_current_time()));
    }

    // Mutter keeps the focused window as a property, so this is one read
    // rather than a walk over every actor; the NORMAL filter every other
    // method applies still holds, so a focused dialog reports "no focused
    // window".
    GetFocused() {
        console.debug('[Window Control] GetFocused() called');
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
        console.debug('[Window Control] GetFocused() -> no focused window');
        return [0, '', ''];
    }

    // Raises instead of returning a flag; see the ERRORS block in
    // dbus-interface.js.
    MoveAsync([windowId, x, y], invocation) {
        console.debug(`[Window Control] Move(${windowId}, ${x}, ${y}) called`);
        this._geometryCall(invocation, 'Move', () => {
            const win = this._geometryTarget(windowId, 'Move');
            win.move_frame(true, x, y);
            console.debug(`[Window Control] Move(${windowId}) -> ok`);
        });
    }

    // Keeps the position. Raises on failure.
    ResizeAsync([windowId, width, height], invocation) {
        console.debug(`[Window Control] Resize(${windowId}, ${width}, ${height}) called`);
        this._geometryCall(invocation, 'Resize', () => {
            if (width <= 0 || height <= 0) {
                throw new NamedError(DBUS_ERROR_INVALID_ARGS,
                    'Resize: width and height must be positive');
            }
            const win = this._geometryTarget(windowId, 'Resize');
            const rect = win.get_frame_rect();
            win.move_resize_frame(true, rect.x, rect.y, width, height);
            console.debug(`[Window Control] Resize(${windowId}) -> ok`);
        });
    }

    // One request for both, so mutter applies them together. Raises on failure.
    MoveResizeAsync([windowId, x, y, width, height], invocation) {
        console.debug(`[Window Control] MoveResize(${windowId}, ${x}, ${y}, ${width}, ${height}) called`);
        this._geometryCall(invocation, 'MoveResize', () => {
            if (width <= 0 || height <= 0) {
                throw new NamedError(DBUS_ERROR_INVALID_ARGS,
                    'MoveResize: width and height must be positive');
            }
            const win = this._geometryTarget(windowId, 'MoveResize');
            win.move_resize_frame(true, x, y, width, height);
            console.debug(`[Window Control] MoveResize(${windowId}) -> ok`);
        });
    }

    GetGeometry(windowId) {
        console.debug(`[Window Control] GetGeometry(${windowId}) called`);
        const win = this._findWindowById(windowId);
        if (win) {
            const rect = win.get_frame_rect();
            console.debug(`[Window Control] GetGeometry(${windowId}) -> (${rect.x}, ${rect.y}, ${rect.width}, ${rect.height})`);
            return [rect.x, rect.y, rect.width, rect.height];
        }
        console.debug(`[Window Control] GetGeometry(${windowId}) -> not found`);
        return [-1, -1, -1, -1];
    }

    // The version the running shell has loaded; see the constructor.
    GetVersion() {
        console.debug(`[Window Control] GetVersion() -> ${this._version}`);
        return this._version;
    }

    GetCapabilities() {
        const capabilities = CAPABILITIES.filter(
            name => name !== 'keybindings' || this.keybindingsServed);
        console.debug(`[Window Control] GetCapabilities() -> ${capabilities}`);
        return capabilities;
    }

    // (-1, -1, -1, -1) means one thing only: the index is not a monitor. A
    // lookup that throws reaches GJS, which answers with an error, so a caller
    // never reports a monitor that exists as missing.
    GetWorkarea(monitorIndex) {
        console.debug(`[Window Control] GetWorkarea(${monitorIndex}) called`);
        const numMonitors = global.display.get_n_monitors();
        if (!this._isValidIndex(monitorIndex, numMonitors)) {
            console.debug(`[Window Control] GetWorkarea: Invalid monitor index ${monitorIndex} (valid: 0-${numMonitors - 1})`);
            return [-1, -1, -1, -1];
        }

        const workspace = global.workspace_manager.get_active_workspace();
        const rect = workspace.get_work_area_for_monitor(monitorIndex);

        console.debug(`[Window Control] GetWorkarea(${monitorIndex}) -> (${rect.x}, ${rect.y}, ${rect.width}, ${rect.height})`);
        return [rect.x, rect.y, rect.width, rect.height];
    }

    ListWorkspaces() {
        console.debug('[Window Control] ListWorkspaces() called');
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
    }

    // While the Activities overview is shown, Meta.Workspace.activate() leaves
    // the active workspace unchanged (verified on GNOME 46), so the overview is
    // hidden first. The result is read back rather than assumed, so a switch
    // that did not take effect reports false.
    ActivateWorkspace(workspaceIndex) {
        console.debug(`[Window Control] ActivateWorkspace(${workspaceIndex}) called`);
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
    }

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
            return _workspaceIndex(win) === workspaceIndex;
        });
    }

    MoveToMonitor(windowId, monitorIndex) {
        if (!this._isValidIndex(monitorIndex, global.display.get_n_monitors())) {
            console.debug(`[Window Control] MoveToMonitor(${windowId}, ${monitorIndex}) -> false (invalid index)`);
            return false;
        }
        return this._actOnWindow(windowId, 'MoveToMonitor',
            win => win.move_to_monitor(monitorIndex));
    }

    // Reply with the ID of a shown window matching (kind, value), either
    // immediately if one exists or when one appears, or 0 after timeoutMs.
    // Async handler (GJS convention: <Method>Async(params, invocation)) so the
    // shell main loop is never blocked; the reply is sent from a signal handler
    // or the timeout source.
    WaitForWindowAsync([kind, value, timeoutMs], invocation) {
        // `kind` is not validated yet, so it is not logged here.
        console.debug('[Window Control] WaitForWindow() called');
        let waiter = null;
        try {
            const predicate = this._matchPredicate(kind, value);
            if (!predicate || timeoutMs <= 0) {
                console.debug('[Window Control] WaitForWindow() -> InvalidArgs');
                invocation.return_dbus_error(DBUS_ERROR_INVALID_ARGS,
                    'WaitForWindow: kind must be class|title|substring|pid (pid numeric) and timeout_ms > 0');
                return;
            }
            console.debug(`[Window Control] WaitForWindow(${kind}, ..., ${timeoutMs}) validated`);

            const existing = this._findWindowByPredicate(w => predicate(w) && !this._isUnshown(w));
            if (existing) {
                console.debug(`[Window Control] WaitForWindow(${kind}) -> ${existing.get_id()} (already present)`);
                invocation.return_value(new GLib.Variant('(t)', [existing.get_id()]));
                return;
            }

            waiter = { predicate, invocation, timeoutId: 0, callerWatch: null };
            waiter.timeoutId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, timeoutMs, () => {
                waiter.timeoutId = 0;
                console.debug(`[Window Control] WaitForWindow(${kind}) -> 0 (timeout)`);
                this._finishWaiter(waiter, 0);
                return GLib.SOURCE_REMOVE;
            });
            this._waiters.push(waiter);
            waiter.callerWatch = this._watchCaller(invocation, () => {
                console.debug(`[Window Control] WaitForWindow(${kind}) dropped (caller left the bus)`);
                this._retireWaiter(waiter);
            });
            this._trackExistingWindows();
        } catch (e) {
            console.error(`[Window Control] WaitForWindow() error: ${e.message}`);
            // Caught here, not left to GJS: once the waiter is registered it
            // owns the invocation and its timeout will reply, so an answer from
            // GJS or from here would be a second reply on the same invocation.
            // Retire it instead, which replies exactly once.
            if (waiter && this._waiters.includes(waiter))
                this._failWaiter(waiter, e.message);
            else
                invocation.return_dbus_error(DBUS_ERROR_FAILED, e.message);
        }
    }

    // Reply once the window's frame has held still for quiet_ms, with the rect
    // as it then stands.
    //
    // Async (GJS convention: <Method>Async(params, invocation)) for the same
    // reason WaitForWindow is: the reply comes from a signal handler or a timer
    // and the shell main loop is never blocked.
    //
    // The quiet period is a heuristic and is meant to be. What it removes is
    // the sampling: a client outside the shell can only poll get_frame_rect()
    // and compare, which costs a round trip per sample and still races the
    // compositor -- get_frame_rect() read right after a move still returns the
    // old rectangle, so the first sample is reliably wrong. Here every change is
    // a signal, so the timer only has to outlast the gap between two of them.
    WaitForGeometryAsync([windowId, quietMs, timeoutMs], invocation) {
        console.debug(`[Window Control] WaitForGeometry(${windowId}, ${quietMs}, ${timeoutMs}) called`);
        let watcher = null;
        try {
            if (quietMs <= 0 || timeoutMs < quietMs) {
                console.debug('[Window Control] WaitForGeometry() -> InvalidArgs');
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

            watcher = {
                win, windowId, invocation, quietMs, quietId: 0, timeoutId: 0, signalIds: [], callerWatch: null,
            };
            // Registered before anything is connected, and each id is stored
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
            watcher.callerWatch = this._watchCaller(invocation, () => {
                if (this._retireGeometryWatcher(watcher))
                    console.debug(`[Window Control] WaitForGeometry(${windowId}) dropped (caller left the bus)`);
            });

            // The quiet period is attached before the overall timeout. A caller
            // is allowed to pass timeout_ms === quiet_ms, and GLib dispatches
            // sources of equal priority that come ready together in the order
            // they were attached -- so with the timeout first, a frame that was
            // never moving would answer Timeout instead of settling.
            //
            // Starting it now is also what lets an already still frame settle,
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
            // Caught here, not left to GJS, for the reason WaitForWindow gives:
            // a registered watcher owns the invocation and one of its timers
            // will reply.
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
        this._unwatchCaller(watcher);
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

    // Drop every per-window handler. Teardown passes watchFirstShow = false:
    // it drops every first-show watch anyway.
    _stopWatching(watchFirstShow = true) {
        for (const win of [...this._trackedWindows.keys()])
            this._untrackWindow(win, watchFirstShow);
    }

    // Remember that this window was seen from creation: _isUnshown() needs to
    // tell "mutter has not mapped it yet" from "mapped, currently hidden", and
    // for such a window the record of its first map makes that knowable. With
    // no waiter pending, the first-show watch records it.
    //
    // With one pending, the window is tracked instead. A new window may not
    // carry its wm_class or title yet when 'window-created' fires (on Wayland
    // the app id arrives with a later commit), and it is not shown (mapped and
    // placed) until the client commits its first buffer, so evaluate now and
    // again when either property is set and when the window is shown. Handlers
    // are dropped once the window matched, was unmanaged, or no waiter is left.
    _onWindowCreated(win) {
        this._createdSinceStart.add(win);
        if (this._waiters.length === 0) {
            this._watchFirstShow(win);
            return;
        }
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
            // Handlers stay connected while any waiter is pending: a waiter this
            // window did not satisfy may still be waiting for a title or class
            // that changes later. _retireWaiter() untracks everything through
            // _stopWatching() once the last waiter is gone.
            if (this._waiters.length === 0)
                this._untrackWindow(win);
        };
        const ids = [
            win.connect('notify::wm-class', evaluate),
            win.connect('notify::title', evaluate),
            win.connect('notify::window-type', evaluate),
            // Recorded here, not by _evaluateWindow(): that returns before
            // _isUnshown() for a window that is not NORMAL, and a dialog
            // retyped to NORMAL later must still count as shown.
            win.connect('shown', () => {
                this._shownWindows.add(win);
                evaluate();
            }),
            win.connect('unmanaged', () => this._untrackWindow(win, false)),
        ];
        this._trackedWindows.set(win, ids);
        this._dropFirstShowWatch(win);
    }

    // Track every window that already exists when a waiter registers.
    //
    // 'window-created' tracks only the windows created while a waiter is
    // pending, so without this two cases never wake a waiter: the window
    // created in the gap just before the call, which has already missed the
    // signal and is still unshown; and any window already on screen whose
    // title or class changes later -- `wait -t 'Report.pdf - LibreOffice
    // Writer'` against an already-open LibreOffice, or `wait -c` against a
    // Wayland client whose app_id lands after mapping.
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

    _untrackWindow(win, watchFirstShow = true) {
        const ids = this._trackedWindows.get(win);
        if (!ids)
            return;
        for (const id of ids)
            win.disconnect(id);
        this._trackedWindows.delete(win);
        if (watchFirstShow && this._createdSinceStart.has(win) && !this._shownWindows.has(win))
            this._watchFirstShow(win);
    }

    // Keep one 'shown' handler on a window created while the service runs that
    // is not shown yet and not tracked: without it nothing records its map, and
    // a later wait would take the hidden window for one mutter has not placed.
    _watchFirstShow(win) {
        const ids = [
            win.connect('shown', () => {
                this._shownWindows.add(win);
                this._dropFirstShowWatch(win);
            }),
            win.connect('unmanaged', () => this._dropFirstShowWatch(win)),
        ];
        this._firstShowWatches.set(win, ids);
    }

    _dropFirstShowWatch(win) {
        const ids = this._firstShowWatches.get(win);
        if (!ids)
            return;
        for (const id of ids)
            win.disconnect(id);
        this._firstShowWatches.delete(win);
    }

    // Call onGone once the caller of `invocation` leaves the bus, so a deferred
    // call whose caller was killed does not keep its handlers and timers until
    // timeout_ms. A name watch, not a bare NameOwnerChanged subscription: the
    // watch asks for the owner after it subscribes, so a caller that left
    // before this handler ran (killed right after it sent the call) is seen
    // too; a subscription alone misses it. Returns null for a call with no
    // sender (a peer-to-peer connection), where there is no name to watch.
    _watchCaller(invocation, onGone) {
        const sender = invocation.get_sender();
        if (!sender)
            return null;
        const connection = invocation.get_connection();
        const id = connection.watch_name(sender, Gio.BusNameWatcherFlags.NONE, null, () => onGone());
        return { connection, id };
    }

    _unwatchCaller(entry) {
        if (!entry.callerWatch)
            return;
        entry.callerWatch.connection.unwatch_name(entry.callerWatch.id);
        entry.callerWatch = null;
    }

    // Reply to every waiter the window satisfies. An unshown window never
    // satisfies a waiter (see _isUnshown).
    _evaluateWindow(win) {
        if (win.get_window_type() !== Meta.WindowType.NORMAL || this._isUnshown(win))
            return;
        for (const waiter of [...this._waiters]) {
            if (waiter.predicate(win)) {
                console.debug(`[Window Control] WaitForWindow -> ${win.get_id()} (window appeared)`);
                this._finishWaiter(waiter, win.get_id());
            }
        }
    }

    _finishWaiter(waiter, windowId) {
        this._retireWaiter(waiter);
        waiter.invocation.return_value(new GLib.Variant('(t)', [windowId]));
    }

    _failWaiter(waiter, message) {
        this._retireWaiter(waiter);
        waiter.invocation.return_dbus_error(DBUS_ERROR_FAILED, message);
    }

    // Drop a waiter's timeout source and caller watch and remove it from the
    // pending list, so exactly one reply can still be sent on its invocation.
    // A waiter whose caller left the bus is only retired: there is no one to
    // reply to. The last waiter gone ends the watch.
    _retireWaiter(waiter) {
        if (waiter.timeoutId) {
            GLib.source_remove(waiter.timeoutId);
            waiter.timeoutId = 0;
        }
        this._unwatchCaller(waiter);
        this._waiters = this._waiters.filter(w => w !== waiter);
        if (this._waiters.length === 0)
            this._stopWatching();
    }

    // Fail every pending WaitForWindow call and drop all signal handlers,
    // caller watches and timeout sources. Called from disable(); leaves nothing
    // behind.
    _cancelWaiters() {
        const pending = this._waiters;
        this._waiters = [];
        for (const waiter of pending) {
            if (waiter.timeoutId)
                GLib.source_remove(waiter.timeoutId);
            this._unwatchCaller(waiter);
            waiter.invocation.return_dbus_error(DBUS_ERROR_DISABLED, 'Window Control extension disabled');
        }
        this._stopWatching(false);
        for (const win of [...this._firstShowWatches.keys()])
            this._dropFirstShowWatch(win);
        if (pending.length > 0)
            console.debug(`[Window Control] cancelled ${pending.length} pending WaitForWindow call(s)`);
    }

    Minimize(windowId) {
        return this._actOnWindow(windowId, 'Minimize', win => this._minimize(win, false));
    }

    Unminimize(windowId) {
        return this._actOnWindow(windowId, 'Unminimize', win => win.unminimize());
    }

    // Skip the shell's animation for the minimize or unminimize the
    // caller requests next. Main.wm.skipNextEffect() holds until the actor's
    // next effect of any kind, so a caller arms it only for a request that
    // changes the window's visibility: one that leaves the window as hidden as
    // it was -- already in that state, or on another workspace -- runs no
    // effect, and the skip would swallow a later, unrelated animation instead.
    // The window came out of global.get_window_actors(), so it has an actor.
    _skipNextEffect(win) {
        Main.wm.skipNextEffect(win.get_compositor_private());
    }

    MinimizeNoAnimation(windowId) {
        return this._actOnWindow(windowId, 'MinimizeNoAnimation', win => this._minimize(win, true));
    }

    // Minimize, and return whether the window is minimized. Mutter
    // does not let every window minimize (a skip-taskbar one, for example):
    // minimize() does nothing there, so a skip armed for it would wait for an
    // unrelated effect. Such a window counts only when it is minimized
    // already -- a client can set skip-taskbar on a window it has iconified.
    _minimize(win, skipEffect) {
        if (!win.can_minimize())
            return win.minimized;
        if (skipEffect && !win.is_hidden())
            this._skipNextEffect(win);
        win.minimize();
        return true;
    }

    // Skip the unminimize animation of a window the caller restores
    // next, under the visibility rule of _skipNextEffect.
    _skipUnminimizeEffect(win) {
        if (win.minimized &&
            win.located_on_workspace(global.workspace_manager.get_active_workspace()))
            this._skipNextEffect(win);
    }

    UnminimizeNoAnimation(windowId) {
        return this._actOnWindow(windowId, 'UnminimizeNoAnimation', win => {
            this._skipUnminimizeEffect(win);
            win.unminimize();
        });
    }

    // A minimized window is restored without the animation. activate() does
    // the restore itself, and restores every minimized transient parent with
    // the window.
    ActivateNoAnimation(windowId) {
        return this._actOnWindow(windowId, 'ActivateNoAnimation', win => {
            for (let restored = win; restored; restored = restored.get_transient_for())
                this._skipUnminimizeEffect(restored);
            win.activate(global.get_current_time());
        });
    }

    Maximize(windowId) {
        return this._actOnWindow(windowId, 'Maximize', win => maximizeWindow(win));
    }

    Unmaximize(windowId) {
        return this._actOnWindow(windowId, 'Unmaximize', win => unmaximizeWindow(win));
    }

    Fullscreen(windowId) {
        return this._actOnWindow(windowId, 'Fullscreen', win => win.make_fullscreen());
    }

    Unfullscreen(windowId) {
        return this._actOnWindow(windowId, 'Unfullscreen', win => win.unmake_fullscreen());
    }

    SetAbove(windowId, above) {
        return this._actOnWindow(windowId, 'SetAbove',
            win => above ? win.make_above() : win.unmake_above());
    }

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

    // Asks the client to close; it may refuse or prompt.
    Close(windowId) {
        return this._actOnWindow(windowId, 'Close',
            win => win.delete(global.get_current_time()));
    }

    export() {
        this._dbusImpl.export(Gio.DBus.session, DBUS_OBJECT_PATH);
    }

    // Also tears down a service whose export() failed. Returns whether the
    // object was exported.
    unexport() {
        const exported = this._dbusImpl.get_connection() !== null;
        global.display.disconnect(this._windowCreatedId);
        this._windowCreatedId = 0;
        this._cancelWaiters();
        this._cancelGeometryWatchers();
        if (exported)
            this._dbusImpl.unexport();
        this._dbusImpl = null;
        return exported;
    }
}
