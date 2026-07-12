// Window Control Extension for GNOME Shell
// D-Bus interface for listing and controlling windows

import Gio from 'gi://Gio';
import Meta from 'gi://Meta';
import { Extension } from 'resource:///org/gnome/shell/extensions/extension.js';
import { DBUS_INTERFACE_XML } from './dbus-interface.js';

const DBUS_OBJECT_PATH = '/org/gnome/Shell/Extensions/WindowControl';

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
function _isFullyMaximized(win) {
    if (typeof win.get_maximized === 'function') {
        return win.get_maximized() === Meta.MaximizeFlags.BOTH;      // GNOME <= 48
    }
    return win.get_maximize_flags() === Meta.MaximizeFlags.BOTH;     // GNOME 49+
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

// D-Bus service implementation
class WindowControlService {
    constructor() {
        this._dbusImpl = Gio.DBusExportedObject.wrapJSObject(
            DBUS_INTERFACE_XML,
            this
        );
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
        
        console.log(`[Window Control] _getAllWindows(): found ${actors.length} actors, ${windows.length} normal windows`);
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

    // Helper: Look up a window by ID and run an action on it, with the uniform
    // find / try-catch / result contract shared by the simple boolean handlers.
    // Returns true on success, false if the window is missing or the action throws.
    _actOnWindow(windowId, label, action) {
        try {
            const win = this._findWindowById(windowId);
            if (!win) {
                console.log(`[Window Control] ${label}(${windowId}) -> false (window not found)`);
                return false;
            }
            action(win);
            console.log(`[Window Control] ${label}(${windowId}) -> true`);
            return true;
        } catch (e) {
            console.error(`[Window Control] ${label}() error: ${e.message}`);
            return false;
        }
    }

    // List: Get all windows as array of tuples
    List() {
        console.log(`[Window Control] List() called`);
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
            console.log(`[Window Control] List() returning ${result.length} windows`);
            return result;
        } catch (e) {
            console.error(`[Window Control] List() error: ${e.message}`);
            return [];
        }
    }

    // ListDetailed: Get all windows as JSON string with full details
    ListDetailed() {
        console.log(`[Window Control] ListDetailed() called`);
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
            
            console.log(`[Window Control] ListDetailed() returning ${result.length} windows`);
            return JSON.stringify(result);
        } catch (e) {
            console.error(`[Window Control] ListDetailed() error: ${e.message}`);
            return '[]';
        }
    }

    // ListMonitors: Get all monitors with their properties
    ListMonitors() {
        console.log(`[Window Control] ListMonitors() called`);
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

            console.log(`[Window Control] ListMonitors() returning ${result.length} monitors`);
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
        console.log(`[Window Control] ActivateByTitle("${title}") called`);
        try {
            const win = this._findWindowByPredicate(w => w.get_title() === title);
            if (win) {
                win.activate(global.get_current_time());
                console.log(`[Window Control] ActivateByTitle("${title}") -> true`);
                return true;
            }
            console.log(`[Window Control] ActivateByTitle("${title}") -> false (not found)`);
            return false;
        } catch (e) {
            console.error(`[Window Control] ActivateByTitle() error: ${e.message}`);
            return false;
        }
    }

    // ActivateByTitleSubstring: Activate window by title substring
    ActivateByTitleSubstring(substring) {
        console.log(`[Window Control] ActivateByTitleSubstring("${substring}") called`);
        try {
            const win = this._findWindowByPredicate(w => {
                const title = w.get_title();
                return title && title.includes(substring);
            });
            if (win) {
                win.activate(global.get_current_time());
                console.log(`[Window Control] ActivateByTitleSubstring("${substring}") -> true`);
                return true;
            }
            console.log(`[Window Control] ActivateByTitleSubstring("${substring}") -> false (not found)`);
            return false;
        } catch (e) {
            console.error(`[Window Control] ActivateByTitleSubstring() error: ${e.message}`);
            return false;
        }
    }

    // ActivateByWmClass: Activate window by WM class (exact match)
    ActivateByWmClass(wmClass) {
        console.log(`[Window Control] ActivateByWmClass("${wmClass}") called`);
        try {
            const win = this._findWindowByPredicate(w => w.get_wm_class() === wmClass);
            if (win) {
                win.activate(global.get_current_time());
                console.log(`[Window Control] ActivateByWmClass("${wmClass}") -> true`);
                return true;
            }
            console.log(`[Window Control] ActivateByWmClass("${wmClass}") -> false (not found)`);
            return false;
        } catch (e) {
            console.error(`[Window Control] ActivateByWmClass() error: ${e.message}`);
            return false;
        }
    }

    // ActivateByPid: Activate window by PID
    ActivateByPid(pid) {
        console.log(`[Window Control] ActivateByPid(${pid}) called`);
        try {
            const win = this._findWindowByPredicate(w => w.get_pid() === pid);
            if (win) {
                win.activate(global.get_current_time());
                console.log(`[Window Control] ActivateByPid(${pid}) -> true`);
                return true;
            }
            console.log(`[Window Control] ActivateByPid(${pid}) -> false (not found)`);
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
        console.log(`[Window Control] GetFocused() called`);
        try {
            const win = this._findWindowByPredicate(w => w.has_focus());
            if (win) {
                const id = win.get_id();
                const title = win.get_title() || '';
                const wmClass = win.get_wm_class() || '';
                console.log(`[Window Control] GetFocused() -> ${id}, "${title}", "${wmClass}"`);
                return [id, title, wmClass];
            }
            console.log(`[Window Control] GetFocused() -> no focused window`);
            return [0, '', ''];
        } catch (e) {
            console.error(`[Window Control] GetFocused() error: ${e.message}`);
            return [0, '', ''];
        }
    }

    // Move: Move window to position
    Move(windowId, x, y) {
        console.log(`[Window Control] Move(${windowId}, ${x}, ${y}) called`);
        try {
            // Validate coordinates are reasonable numbers
            if (typeof x !== 'number' || typeof y !== 'number' ||
                !Number.isFinite(x) || !Number.isFinite(y)) {
                console.log(`[Window Control] Move: Invalid coordinates`);
                return false;
            }
            
            const win = this._findWindowById(windowId);
            if (win) {
                win.move_frame(true, x, y);
                console.log(`[Window Control] Move(${windowId}, ${x}, ${y}) -> true`);
                return true;
            }
            console.log(`[Window Control] Move(${windowId}) -> false (window not found)`);
            return false;
        } catch (e) {
            console.error(`[Window Control] Move() error: ${e.message}`);
            return false;
        }
    }

    // Resize: Resize window (keeps position)
    Resize(windowId, width, height) {
        console.log(`[Window Control] Resize(${windowId}, ${width}, ${height}) called`);
        try {
            // Validate dimensions are positive finite numbers
            if (typeof width !== 'number' || typeof height !== 'number' ||
                !Number.isFinite(width) || !Number.isFinite(height) ||
                width <= 0 || height <= 0) {
                console.log(`[Window Control] Resize: Invalid dimensions (must be positive)`);
                return false;
            }
            
            const win = this._findWindowById(windowId);
            if (win) {
                const rect = win.get_frame_rect();
                win.move_resize_frame(true, rect.x, rect.y, width, height);
                console.log(`[Window Control] Resize(${windowId}, ${width}, ${height}) -> true`);
                return true;
            }
            console.log(`[Window Control] Resize(${windowId}) -> false (window not found)`);
            return false;
        } catch (e) {
            console.error(`[Window Control] Resize() error: ${e.message}`);
            return false;
        }
    }

    // MoveResize: Move and resize window atomically
    MoveResize(windowId, x, y, width, height) {
        console.log(`[Window Control] MoveResize(${windowId}, ${x}, ${y}, ${width}, ${height}) called`);
        try {
            // Validate all parameters
            if (typeof x !== 'number' || typeof y !== 'number' ||
                typeof width !== 'number' || typeof height !== 'number' ||
                !Number.isFinite(x) || !Number.isFinite(y) ||
                !Number.isFinite(width) || !Number.isFinite(height) ||
                width <= 0 || height <= 0) {
                console.log(`[Window Control] MoveResize: Invalid parameters`);
                return false;
            }
            
            const win = this._findWindowById(windowId);
            if (win) {
                win.move_resize_frame(true, x, y, width, height);
                console.log(`[Window Control] MoveResize(${windowId}) -> true`);
                return true;
            }
            console.log(`[Window Control] MoveResize(${windowId}) -> false (window not found)`);
            return false;
        } catch (e) {
            console.error(`[Window Control] MoveResize() error: ${e.message}`);
            return false;
        }
    }

    // GetGeometry: Get window geometry
    GetGeometry(windowId) {
        console.log(`[Window Control] GetGeometry(${windowId}) called`);
        try {
            const win = this._findWindowById(windowId);
            if (win) {
                const rect = win.get_frame_rect();
                console.log(`[Window Control] GetGeometry(${windowId}) -> (${rect.x}, ${rect.y}, ${rect.width}, ${rect.height})`);
                return [rect.x, rect.y, rect.width, rect.height];
            }
            console.log(`[Window Control] GetGeometry(${windowId}) -> not found`);
            return [-1, -1, -1, -1];
        } catch (e) {
            console.error(`[Window Control] GetGeometry() error: ${e.message}`);
            return [-1, -1, -1, -1];
        }
    }

    // GetWorkarea: Get usable workspace area for a monitor
    GetWorkarea(monitorIndex) {
        console.log(`[Window Control] GetWorkarea(${monitorIndex}) called`);
        try {
            // Validate monitor index
            const numMonitors = global.display.get_n_monitors();
            if (typeof monitorIndex !== "number" ||
                !Number.isFinite(monitorIndex) ||
                monitorIndex < 0 ||
                monitorIndex >= numMonitors) {
                console.log(`[Window Control] GetWorkarea: Invalid monitor index ${monitorIndex} (valid: 0-${numMonitors-1})`);
                return [-1, -1, -1, -1];
            }

            // Get active workspace
            const workspace = global.workspace_manager.get_active_workspace();

            // Get work area for the specified monitor
            const rect = workspace.get_work_area_for_monitor(monitorIndex);

            console.log(`[Window Control] GetWorkarea(${monitorIndex}) -> (${rect.x}, ${rect.y}, ${rect.width}, ${rect.height})`);
            return [rect.x, rect.y, rect.width, rect.height];
        } catch (e) {
            console.error(`[Window Control] GetWorkarea() error: ${e.message}`);
            return [-1, -1, -1, -1];
        }
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
