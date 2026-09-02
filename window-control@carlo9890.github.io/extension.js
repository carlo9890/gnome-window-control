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
const DBUS_ERROR_INVALID_ARGS = 'org.freedesktop.DBus.Error.InvalidArgs';

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
    constructor() {
        this._dbusImpl = Gio.DBusExportedObject.wrapJSObject(
            DBUS_INTERFACE_XML,
            this
        );
        // WaitForWindow state. The 'window-created' handler is connected only
        // while at least one waiter is pending, so an idle extension costs nothing.
        this._waiters = [];
        this._windowCreatedId = 0;
        this._trackedWindows = new Map();   // Meta.Window -> [signal handler ids]
        // Mutter exposes no "has been mapped" getter, so record it: a window
        // seen unhidden once has been placed, and that never becomes untrue.
        this._shownWindows = new WeakSet();
        this._createdWhileWatching = new WeakSet();
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
    // comparison would report failure for every successful call.
    _frameIsPinned(win) {
        return win.is_fullscreen() || _maximizeFlags(win) !== 0;
    }

    // Helper: Build the match predicate for a (kind, value) selector as used by
    // WaitForWindow. Returns null for an unknown kind or a non-numeric pid.
    _matchPredicate(kind, value) {
        switch (kind) {
        case 'class':
            return w => w.get_wm_class() === value;
        case 'title':
            return w => w.get_title() === value;
        case 'substring':
            return w => (w.get_title() || '').includes(value);
        case 'pid': {
            const pid = Number(value);
            if (!Number.isInteger(pid) || pid <= 0)
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
    // Returns true on success, false if the window is missing or the action throws.
    _actOnWindow(windowId, label, action) {
        try {
            const win = this._findWindowById(windowId);
            if (!win) {
                console.debug(`[Window Control] ${label}(${windowId}) -> false (window not found)`);
                return false;
            }
            action(win);
            console.debug(`[Window Control] ${label}(${windowId}) -> true`);
            return true;
        } catch (e) {
            console.error(`[Window Control] ${label}() error: ${e.message}`);
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
        console.debug('[Window Control] ActivateByTitle() called');
        try {
            const win = this._findWindowByPredicate(w => w.get_title() === title);
            if (win) {
                win.activate(global.get_current_time());
                console.debug('[Window Control] ActivateByTitle() -> true');
                return true;
            }
            console.debug('[Window Control] ActivateByTitle() -> false (not found)');
            return false;
        } catch (e) {
            console.error(`[Window Control] ActivateByTitle() error: ${e.message}`);
            return false;
        }
    }

    // ActivateByTitleSubstring: Activate window by title substring
    ActivateByTitleSubstring(substring) {
        console.debug('[Window Control] ActivateByTitleSubstring() called');
        try {
            const win = this._findWindowByPredicate(w => {
                const title = w.get_title();
                return title && title.includes(substring);
            });
            if (win) {
                win.activate(global.get_current_time());
                console.debug('[Window Control] ActivateByTitleSubstring() -> true');
                return true;
            }
            console.debug('[Window Control] ActivateByTitleSubstring() -> false (not found)');
            return false;
        } catch (e) {
            console.error(`[Window Control] ActivateByTitleSubstring() error: ${e.message}`);
            return false;
        }
    }

    // ActivateByWmClass: Activate window by WM class (exact match)
    ActivateByWmClass(wmClass) {
        console.debug('[Window Control] ActivateByWmClass() called');
        try {
            const win = this._findWindowByPredicate(w => w.get_wm_class() === wmClass);
            if (win) {
                win.activate(global.get_current_time());
                console.debug('[Window Control] ActivateByWmClass() -> true');
                return true;
            }
            console.debug('[Window Control] ActivateByWmClass() -> false (not found)');
            return false;
        } catch (e) {
            console.error(`[Window Control] ActivateByWmClass() error: ${e.message}`);
            return false;
        }
    }

    // ActivateByPid: Activate window by PID
    ActivateByPid(pid) {
        console.debug(`[Window Control] ActivateByPid(${pid}) called`);
        try {
            const win = this._findWindowByPredicate(w => w.get_pid() === pid);
            if (win) {
                win.activate(global.get_current_time());
                console.debug(`[Window Control] ActivateByPid(${pid}) -> true`);
                return true;
            }
            console.debug(`[Window Control] ActivateByPid(${pid}) -> false (not found)`);
            return false;
        } catch (e) {
            console.error(`[Window Control] ActivateByPid() error: ${e.message}`);
            return false;
        }
    }

    // Focus: Focus a window by ID (without raising)
    Focus(windowId) {
        return this._actOnWindow(windowId, 'Focus',
            win => win.focus(global.get_current_time()));
    }

    // GetFocused: Get the currently focused window
    GetFocused() {
        console.debug(`[Window Control] GetFocused() called`);
        try {
            const win = this._findWindowByPredicate(w => w.has_focus());
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

    // Move: Move window to position
    Move(windowId, x, y) {
        console.debug(`[Window Control] Move(${windowId}, ${x}, ${y}) called`);
        try {
            // Validate coordinates are reasonable numbers
            if (typeof x !== 'number' || typeof y !== 'number' ||
                !Number.isFinite(x) || !Number.isFinite(y)) {
                console.debug(`[Window Control] Move: Invalid coordinates`);
                return false;
            }
            
            const win = this._findWindowById(windowId);
            if (win) {
                if (this._frameIsPinned(win)) {
                    console.debug(`[Window Control] Move(${windowId}) -> false (frame pinned)`);
                    return false;
                }
                win.move_frame(true, x, y);
                console.debug(`[Window Control] Move(${windowId}, ${x}, ${y}) -> true`);
                return true;
            }
            console.debug(`[Window Control] Move(${windowId}) -> false (window not found)`);
            return false;
        } catch (e) {
            console.error(`[Window Control] Move() error: ${e.message}`);
            return false;
        }
    }

    // Resize: Resize window (keeps position)
    Resize(windowId, width, height) {
        console.debug(`[Window Control] Resize(${windowId}, ${width}, ${height}) called`);
        try {
            // Validate dimensions are positive finite numbers
            if (typeof width !== 'number' || typeof height !== 'number' ||
                !Number.isFinite(width) || !Number.isFinite(height) ||
                width <= 0 || height <= 0) {
                console.debug(`[Window Control] Resize: Invalid dimensions (must be positive)`);
                return false;
            }
            
            const win = this._findWindowById(windowId);
            if (win) {
                if (this._frameIsPinned(win)) {
                    console.debug(`[Window Control] Resize(${windowId}) -> false (frame pinned)`);
                    return false;
                }
                const rect = win.get_frame_rect();
                win.move_resize_frame(true, rect.x, rect.y, width, height);
                console.debug(`[Window Control] Resize(${windowId}, ${width}, ${height}) -> true`);
                return true;
            }
            console.debug(`[Window Control] Resize(${windowId}) -> false (window not found)`);
            return false;
        } catch (e) {
            console.error(`[Window Control] Resize() error: ${e.message}`);
            return false;
        }
    }

    // MoveResize: Move and resize window atomically
    MoveResize(windowId, x, y, width, height) {
        console.debug(`[Window Control] MoveResize(${windowId}, ${x}, ${y}, ${width}, ${height}) called`);
        try {
            // Validate all parameters
            if (typeof x !== 'number' || typeof y !== 'number' ||
                typeof width !== 'number' || typeof height !== 'number' ||
                !Number.isFinite(x) || !Number.isFinite(y) ||
                !Number.isFinite(width) || !Number.isFinite(height) ||
                width <= 0 || height <= 0) {
                console.debug(`[Window Control] MoveResize: Invalid parameters`);
                return false;
            }
            
            const win = this._findWindowById(windowId);
            if (win) {
                if (this._frameIsPinned(win)) {
                    console.debug(`[Window Control] MoveResize(${windowId}) -> false (frame pinned)`);
                    return false;
                }
                win.move_resize_frame(true, x, y, width, height);
                console.debug(`[Window Control] MoveResize(${windowId}) -> true`);
                return true;
            }
            console.debug(`[Window Control] MoveResize(${windowId}) -> false (window not found)`);
            return false;
        } catch (e) {
            console.error(`[Window Control] MoveResize() error: ${e.message}`);
            return false;
        }
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
            const windows = this._getAllWindows();
            const result = [];

            for (let i = 0; i < numWorkspaces; i++) {
                const workspace = manager.get_workspace_by_index(i);
                result.push({
                    index: i,
                    name: Meta.prefs_get_workspace_name(i) || '',
                    is_active: i === activeIndex,
                    // located_on_workspace() is true on every workspace for a sticky window
                    window_count: windows.filter(w => w.located_on_workspace(workspace)).length,
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
        console.debug(`[Window Control] MoveToWorkspace(${windowId}, ${workspaceIndex}) called`);
        try {
            if (!this._isValidIndex(workspaceIndex, global.workspace_manager.get_n_workspaces())) {
                console.debug(`[Window Control] MoveToWorkspace(${windowId}) -> false (invalid index)`);
                return false;
            }
            const win = this._findWindowById(windowId);
            if (!win) {
                console.debug(`[Window Control] MoveToWorkspace(${windowId}) -> false (window not found)`);
                return false;
            }
            win.change_workspace_by_index(workspaceIndex, false);
            const moved = !win.is_on_all_workspaces() &&
                win.get_workspace()?.index() === workspaceIndex;
            console.debug(`[Window Control] MoveToWorkspace(${windowId}) -> ${moved}`);
            return moved;
        } catch (e) {
            console.error(`[Window Control] MoveToWorkspace() error: ${e.message}`);
            return false;
        }
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
                invocation.return_dbus_error('org.freedesktop.DBus.Error.Failed', e.message);
        }
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
    }

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
            win.connect('shown', evaluate),
            win.connect('unmanaged', () => this._untrackWindow(win)),
        ];
        this._trackedWindows.set(win, ids);
        evaluate();
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
    // 'notify::wm-class' fires. Handlers cost four connections per window and
    // only exist while a wait is pending.
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
        waiter.invocation.return_dbus_error('org.freedesktop.DBus.Error.Failed', message);
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

    // SetSticky: Set window sticky state (on all workspaces)
    SetSticky(windowId, sticky) {
        return this._actOnWindow(windowId, 'SetSticky',
            win => sticky ? win.stick() : win.unstick());
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
        this._dbusImpl.unexport();
    }
}

export default class WindowControlExtension extends Extension {
    enable() {
        console.log(`[${this.metadata.name}] Enabling extension...`);

        try {
            this._service = new WindowControlService();
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
