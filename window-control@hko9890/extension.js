// Window Control Extension for GNOME Shell
// D-Bus interface for listing and controlling windows

import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Meta from 'gi://Meta';
import { Extension } from 'resource:///org/gnome/shell/extensions/extension.js';

// D-Bus interface XML definition
const DBUS_INTERFACE_XML = `
<node>
  <interface name="org.gnome.Shell.Extensions.WindowControl">
    <!--
      List: Get all windows as array of tuples
      Returns: a(tssssbiiii)
        t - window ID (uint64)
        s - title
        s - wm_class
        s - wm_class_instance
        s - sandboxed_app_id
        b - is_focused
        i - workspace index (-1 if on all)
        i - monitor index
        i - PID
        i - window type enum value
    -->
    <method name="List">
      <arg type="a(tssssbiiii)" direction="out" name="windows"/>
    </method>

    <!--
      ListDetailed: Get all windows as JSON string with full details
      Returns: s - JSON string
    -->
    <method name="ListDetailed">
      <arg type="s" direction="out" name="windows_json"/>
    </method>

    <!--
      Activate: Activate (focus and raise) a window by ID
      Args: t - window ID
      Returns: b - success
    -->
    <method name="Activate">
      <arg type="t" direction="in" name="window_id"/>
      <arg type="b" direction="out" name="success"/>
    </method>

    <!--
      ActivateByTitle: Activate window by exact title match
      Args: s - title (exact match)
      Returns: b - success
    -->
    <method name="ActivateByTitle">
      <arg type="s" direction="in" name="title"/>
      <arg type="b" direction="out" name="success"/>
    </method>

    <!--
      ActivateByTitleSubstring: Activate window by title substring
      Args: s - substring to match
      Returns: b - success
    -->
    <method name="ActivateByTitleSubstring">
      <arg type="s" direction="in" name="substring"/>
      <arg type="b" direction="out" name="success"/>
    </method>

    <!--
      ActivateByWmClass: Activate window by WM class
      Args: s - wm_class (exact match)
      Returns: b - success
    -->
    <method name="ActivateByWmClass">
      <arg type="s" direction="in" name="wm_class"/>
      <arg type="b" direction="out" name="success"/>
    </method>

    <!--
      ActivateByPid: Activate window by PID
      Args: i - process ID
      Returns: b - success
    -->
    <method name="ActivateByPid">
      <arg type="i" direction="in" name="pid"/>
      <arg type="b" direction="out" name="success"/>
    </method>

    <!--
      Focus: Focus a window by ID (without raising)
      Args: t - window ID
      Returns: b - success
    -->
    <method name="Focus">
      <arg type="t" direction="in" name="window_id"/>
      <arg type="b" direction="out" name="success"/>
    </method>

    <!--
      GetFocused: Get the currently focused window
      Returns: (tss)
        t - window ID (0 if none)
        s - title
        s - wm_class
    -->
    <method name="GetFocused">
      <arg type="t" direction="out" name="window_id"/>
      <arg type="s" direction="out" name="title"/>
      <arg type="s" direction="out" name="wm_class"/>
    </method>

    <!-- Geometry Methods -->

    <!--
      Move: Move window to position
      Args: t - window ID, i - x, i - y
      Returns: b - success
    -->
    <method name="Move">
      <arg type="t" direction="in" name="window_id"/>
      <arg type="i" direction="in" name="x"/>
      <arg type="i" direction="in" name="y"/>
      <arg type="b" direction="out" name="success"/>
    </method>

    <!--
      Resize: Resize window
      Args: t - window ID, i - width, i - height
      Returns: b - success
    -->
    <method name="Resize">
      <arg type="t" direction="in" name="window_id"/>
      <arg type="i" direction="in" name="width"/>
      <arg type="i" direction="in" name="height"/>
      <arg type="b" direction="out" name="success"/>
    </method>

    <!--
      MoveResize: Move and resize window atomically
      Args: t - window ID, i - x, i - y, i - width, i - height
      Returns: b - success
    -->
    <method name="MoveResize">
      <arg type="t" direction="in" name="window_id"/>
      <arg type="i" direction="in" name="x"/>
      <arg type="i" direction="in" name="y"/>
      <arg type="i" direction="in" name="width"/>
      <arg type="i" direction="in" name="height"/>
      <arg type="b" direction="out" name="success"/>
    </method>

    <!--
      GetGeometry: Get window geometry
      Args: t - window ID
      Returns: (iiii) - x, y, width, height (-1,-1,-1,-1 if not found)
    -->
    <method name="GetGeometry">
      <arg type="t" direction="in" name="window_id"/>
      <arg type="i" direction="out" name="x"/>
      <arg type="i" direction="out" name="y"/>
      <arg type="i" direction="out" name="width"/>
      <arg type="i" direction="out" name="height"/>
    </method>

    <!-- State Methods -->

    <!--
      Minimize: Minimize window
      Args: t - window ID
      Returns: b - success
    -->
    <method name="Minimize">
      <arg type="t" direction="in" name="window_id"/>
      <arg type="b" direction="out" name="success"/>
    </method>

    <!--
      Unminimize: Unminimize (restore) window
      Args: t - window ID
      Returns: b - success
    -->
    <method name="Unminimize">
      <arg type="t" direction="in" name="window_id"/>
      <arg type="b" direction="out" name="success"/>
    </method>

    <!--
      Maximize: Maximize window
      Args: t - window ID
      Returns: b - success
    -->
    <method name="Maximize">
      <arg type="t" direction="in" name="window_id"/>
      <arg type="b" direction="out" name="success"/>
    </method>

    <!--
      Unmaximize: Unmaximize window
      Args: t - window ID
      Returns: b - success
    -->
    <method name="Unmaximize">
      <arg type="t" direction="in" name="window_id"/>
      <arg type="b" direction="out" name="success"/>
    </method>

    <!--
      Fullscreen: Make window fullscreen
      Args: t - window ID
      Returns: b - success
    -->
    <method name="Fullscreen">
      <arg type="t" direction="in" name="window_id"/>
      <arg type="b" direction="out" name="success"/>
    </method>

    <!--
      Unfullscreen: Exit fullscreen mode
      Args: t - window ID
      Returns: b - success
    -->
    <method name="Unfullscreen">
      <arg type="t" direction="in" name="window_id"/>
      <arg type="b" direction="out" name="success"/>
    </method>

    <!--
      SetAbove: Set window always-on-top state
      Args: t - window ID, b - above (true = always on top)
      Returns: b - success
    -->
    <method name="SetAbove">
      <arg type="t" direction="in" name="window_id"/>
      <arg type="b" direction="in" name="above"/>
      <arg type="b" direction="out" name="success"/>
    </method>

    <!--
      SetSticky: Set window sticky state (on all workspaces)
      Args: t - window ID, b - sticky
      Returns: b - success
    -->
    <method name="SetSticky">
      <arg type="t" direction="in" name="window_id"/>
      <arg type="b" direction="in" name="sticky"/>
      <arg type="b" direction="out" name="success"/>
    </method>

    <!--
      Close: Close window (polite request, allows save dialogs)
      Args: t - window ID
      Returns: b - success
    -->
    <method name="Close">
      <arg type="t" direction="in" name="window_id"/>
      <arg type="b" direction="out" name="success"/>
    </method>
  </interface>
</node>
`;

const DBUS_SERVICE_NAME = 'org.gnome.Shell.Extensions.WindowControl';
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
            return [[]];
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
                    appears_focused: win.has_focus(),
                    is_hidden: win.is_hidden(),
                    is_minimized: win.minimized,
                    is_maximized: win.get_maximized() === Meta.MaximizeFlags.BOTH,
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

    // Activate: Activate (focus and raise) a window by ID
    Activate(windowId) {
        console.log(`[Window Control] Activate(${windowId}) called`);
        try {
            const win = this._findWindowById(windowId);
            if (win) {
                win.activate(global.get_current_time());
                console.log(`[Window Control] Activate(${windowId}) -> true`);
                return true;
            }
            console.log(`[Window Control] Activate(${windowId}) -> false (window not found)`);
            return false;
        } catch (e) {
            console.error(`[Window Control] Activate() error: ${e.message}`);
            return false;
        }
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
        console.log(`[Window Control] Focus(${windowId}) called`);
        try {
            const win = this._findWindowById(windowId);
            if (win) {
                win.focus(global.get_current_time());
                console.log(`[Window Control] Focus(${windowId}) -> true`);
                return true;
            }
            console.log(`[Window Control] Focus(${windowId}) -> false (window not found)`);
            return false;
        } catch (e) {
            console.error(`[Window Control] Focus() error: ${e.message}`);
            return false;
        }
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

    // Minimize: Minimize window
    Minimize(windowId) {
        console.log(`[Window Control] Minimize(${windowId}) called`);
        try {
            const win = this._findWindowById(windowId);
            if (win) {
                win.minimize();
                console.log(`[Window Control] Minimize(${windowId}) -> true`);
                return true;
            }
            console.log(`[Window Control] Minimize(${windowId}) -> false (window not found)`);
            return false;
        } catch (e) {
            console.error(`[Window Control] Minimize() error: ${e.message}`);
            return false;
        }
    }

    // Unminimize: Unminimize (restore) window
    Unminimize(windowId) {
        console.log(`[Window Control] Unminimize(${windowId}) called`);
        try {
            const win = this._findWindowById(windowId);
            if (win) {
                win.unminimize();
                console.log(`[Window Control] Unminimize(${windowId}) -> true`);
                return true;
            }
            console.log(`[Window Control] Unminimize(${windowId}) -> false (window not found)`);
            return false;
        } catch (e) {
            console.error(`[Window Control] Unminimize() error: ${e.message}`);
            return false;
        }
    }

    // Maximize: Maximize window
    Maximize(windowId) {
        console.log(`[Window Control] Maximize(${windowId}) called`);
        try {
            const win = this._findWindowById(windowId);
            if (win) {
                win.maximize(Meta.MaximizeFlags.BOTH);
                console.log(`[Window Control] Maximize(${windowId}) -> true`);
                return true;
            }
            console.log(`[Window Control] Maximize(${windowId}) -> false (window not found)`);
            return false;
        } catch (e) {
            console.error(`[Window Control] Maximize() error: ${e.message}`);
            return false;
        }
    }

    // Unmaximize: Unmaximize window
    Unmaximize(windowId) {
        console.log(`[Window Control] Unmaximize(${windowId}) called`);
        try {
            const win = this._findWindowById(windowId);
            if (win) {
                win.unmaximize(Meta.MaximizeFlags.BOTH);
                console.log(`[Window Control] Unmaximize(${windowId}) -> true`);
                return true;
            }
            console.log(`[Window Control] Unmaximize(${windowId}) -> false (window not found)`);
            return false;
        } catch (e) {
            console.error(`[Window Control] Unmaximize() error: ${e.message}`);
            return false;
        }
    }

    // Fullscreen: Make window fullscreen
    Fullscreen(windowId) {
        console.log(`[Window Control] Fullscreen(${windowId}) called`);
        try {
            const win = this._findWindowById(windowId);
            if (win) {
                win.make_fullscreen();
                console.log(`[Window Control] Fullscreen(${windowId}) -> true`);
                return true;
            }
            console.log(`[Window Control] Fullscreen(${windowId}) -> false (window not found)`);
            return false;
        } catch (e) {
            console.error(`[Window Control] Fullscreen() error: ${e.message}`);
            return false;
        }
    }

    // Unfullscreen: Exit fullscreen mode
    Unfullscreen(windowId) {
        console.log(`[Window Control] Unfullscreen(${windowId}) called`);
        try {
            const win = this._findWindowById(windowId);
            if (win) {
                win.unmake_fullscreen();
                console.log(`[Window Control] Unfullscreen(${windowId}) -> true`);
                return true;
            }
            console.log(`[Window Control] Unfullscreen(${windowId}) -> false (window not found)`);
            return false;
        } catch (e) {
            console.error(`[Window Control] Unfullscreen() error: ${e.message}`);
            return false;
        }
    }

    // SetAbove: Set window always-on-top state
    SetAbove(windowId, above) {
        console.log(`[Window Control] SetAbove(${windowId}, ${above}) called`);
        try {
            const win = this._findWindowById(windowId);
            if (win) {
                if (above) {
                    win.make_above();
                } else {
                    win.unmake_above();
                }
                console.log(`[Window Control] SetAbove(${windowId}, ${above}) -> true`);
                return true;
            }
            console.log(`[Window Control] SetAbove(${windowId}) -> false (window not found)`);
            return false;
        } catch (e) {
            console.error(`[Window Control] SetAbove() error: ${e.message}`);
            return false;
        }
    }

    // SetSticky: Set window sticky state (on all workspaces)
    SetSticky(windowId, sticky) {
        console.log(`[Window Control] SetSticky(${windowId}, ${sticky}) called`);
        try {
            const win = this._findWindowById(windowId);
            if (win) {
                if (sticky) {
                    win.stick();
                } else {
                    win.unstick();
                }
                console.log(`[Window Control] SetSticky(${windowId}, ${sticky}) -> true`);
                return true;
            }
            console.log(`[Window Control] SetSticky(${windowId}) -> false (window not found)`);
            return false;
        } catch (e) {
            console.error(`[Window Control] SetSticky() error: ${e.message}`);
            return false;
        }
    }

    // Close: Close window (polite request)
    Close(windowId) {
        console.log(`[Window Control] Close(${windowId}) called`);
        try {
            const win = this._findWindowById(windowId);
            if (win) {
                win.delete(global.get_current_time());
                console.log(`[Window Control] Close(${windowId}) -> true`);
                return true;
            }
            console.log(`[Window Control] Close(${windowId}) -> false (window not found)`);
            return false;
        } catch (e) {
            console.error(`[Window Control] Close() error: ${e.message}`);
            return false;
        }
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
