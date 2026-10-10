// SPDX-FileCopyrightText: 2026 hko9890
// SPDX-License-Identifier: MIT
// Window rules: put a new window on a well-defined spot, driven by
// ~/.config/gnome-window-control/rules.json. On GNOME 49 and later the window
// is drawn there from its first frame; on every shell the rule is applied the
// moment mutter shows the window.
//
// The file is a JSON array. Each rule names the windows it applies to and
// what to do with them, in the vocabulary wctl already has:
//
//   [
//     {"match": {"class": "kitty"},        "tile": "left"},
//     {"match": {"substr": "Report"},      "place": ["right", "top", "50%", "100%"]},
//     {"match": {"title": "Calculator"},   "center": "both", "monitor": 1},
//     {"match": {"class": "Slack"},        "workspace": 2}
//   ]
//
// match:     class (exact WM class), title (exact), substr (title contains).
//            Several keys must all match.
// place:     [X, Y, WIDTH, HEIGHT] with the tokens of `wctl place`.
// tile:      a `wctl tile` position.
// center:    horizontal | vertical | both, keeps the window's own size.
// workspace: index; one beyond the last appends a single workspace.
// monitor:   index; the workarea place/tile/center resolve against.
//
// The first matching rule wins, in file order, and is applied exactly once per
// window. A window that resizes itself later is left alone. The file is
// re-read on every change.
//
// The grammar itself -- the token vocabulary, the tile grid and every
// validation message -- lives in rules-format.js, which imports nothing so the
// headless check can load it. This file is the half that touches windows.

import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Meta from 'gi://Meta';
import { centerRect, compileRules, resolvePlaceRect, tileRect } from './rules-format.js';
import { afterUnmaximize, maximizeFlags, workareaOf } from './window-helpers.js';

const CONFIG_DIR = GLib.build_filenamev([GLib.get_user_config_dir(), 'gnome-window-control']);
const RULES_FILE = 'rules.json';

// A Wayland client's app_id and first real title can land after the window is
// shown, so a shown window that matched nothing yet stays under evaluation this
// long before it is given up on. Without the bound, a title change hours later
// would re-place a window the user has long since arranged.
const LATE_IDENTITY_GRACE_MS = 2000;

// Collapse the burst of file events one save produces into a single reload.
const RELOAD_DEBOUNCE_MS = 100;

// Meta.Window's 'configure' signal hands a handler the window's initial
// configuration before the client has drawn anything. Mutter 48 has the signal
// too, but applies what the handler sets through a different code path that was
// never checked here, so it is used from 49 on: get_maximize_flags() is the
// method that release added (see window-helpers.js).
const PLACES_BEFORE_FIRST_FRAME = Meta.WindowConfig !== undefined &&
    typeof Meta.Window.prototype.get_maximize_flags === 'function';

export class WindowRules {
    constructor() {
        this._rules = [];
        this._windowCreatedId = 0;
        this._tracked = new Map();        // Meta.Window -> {ids, graceId, applyId, shown, headStart, cancel}
        this._fileMonitor = null;
        this._fileMonitorId = 0;
        this._reloadId = 0;
        this._loadCancellable = null;
    }

    // Never throws: window rules are secondary to the D-Bus service, so a
    // config-dir or monitor failure logs and leaves the extension running
    // rather than failing enable() and leaving the service exported but the
    // extension marked broken. The file is read either way: without the
    // directory there is none, and without the monitor it is read once.
    enable() {
        const dir = Gio.File.new_for_path(CONFIG_DIR);
        try {
            dir.make_directory_with_parents(null);
        } catch (e) {
            if (!e.matches(Gio.IOErrorEnum, Gio.IOErrorEnum.EXISTS))
                console.error(`[Window Control] cannot create ${CONFIG_DIR}: ${e.message}`);
        }
        this._load();
        try {
            // The directory rather than the file: a file monitor misses an editor
            // that saves by writing a new file and renaming it over the old one.
            this._fileMonitor = dir.monitor_directory(Gio.FileMonitorFlags.NONE, null);
            this._fileMonitorId = this._fileMonitor.connect('changed', (monitor, file) => {
                if (file.get_basename() === RULES_FILE)
                    this._scheduleReload();
            });
        } catch (e) {
            console.error(`[Window Control] ${RULES_FILE} is not watched for changes: ${e.message}`);
        }
    }

    disable() {
        if (this._reloadId) {
            GLib.source_remove(this._reloadId);
            this._reloadId = 0;
        }
        this._loadCancellable?.cancel();
        this._loadCancellable = null;
        if (this._fileMonitor) {
            this._fileMonitor.disconnect(this._fileMonitorId);
            this._fileMonitor.cancel();
            this._fileMonitor = null;
        }
        this._rules = [];
        this._syncWatch();
    }

    _scheduleReload() {
        if (this._reloadId)
            GLib.source_remove(this._reloadId);
        this._reloadId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, RELOAD_DEBOUNCE_MS, () => {
            this._reloadId = 0;
            this._load();
            return GLib.SOURCE_REMOVE;
        });
    }

    // Asynchronous, so the read never blocks the compositor. A newer read
    // and disable() both cancel the one in flight, and a cancelled read changes
    // nothing.
    _load() {
        this._loadCancellable?.cancel();
        const cancellable = new Gio.Cancellable();
        this._loadCancellable = cancellable;
        const file = Gio.File.new_for_path(GLib.build_filenamev([CONFIG_DIR, RULES_FILE]));
        file.load_contents_async(cancellable, (source, result) => {
            if (cancellable.is_cancelled())
                return;
            let text;
            try {
                const [, bytes] = source.load_contents_finish(result);
                text = new TextDecoder().decode(bytes);
            } catch (e) {
                // Rules the file no longer yields must not stay active, whatever
                // the reason it cannot be read.
                this._rules = [];
                this._syncWatch();
                if (e.matches(Gio.IOErrorEnum, Gio.IOErrorEnum.NOT_FOUND))
                    console.log(`[Window Control] no ${RULES_FILE}; window rules off`);
                else
                    console.error(`[Window Control] ${RULES_FILE}: cannot read: ${e.message}; window rules off`);
                return;
            }
            this._compile(text);
        });
    }

    _compile(text) {
        try {
            this._rules = compileRules(text);
            console.log(`[Window Control] ${RULES_FILE}: ${this._rules.length} rule(s) loaded`);
        } catch (e) {
            this._rules = [];
            console.warn(`[Window Control] ${RULES_FILE}: ${e.message}; window rules off`);
        }
        this._syncWatch();
    }

    // 'window-created' is connected only while there is a rule to apply, so an
    // empty or absent file costs nothing per window.
    _syncWatch() {
        if (this._rules.length > 0 && !this._windowCreatedId) {
            this._windowCreatedId = global.display.connect('window-created',
                (display, win) => this._track(win));
        } else if (this._rules.length === 0 && this._windowCreatedId) {
            global.display.disconnect(this._windowCreatedId);
            this._windowCreatedId = 0;
            for (const win of [...this._tracked.keys()])
                this._untrack(win);
        }
    }

    // A new window may carry neither wm_class nor title yet, and mutter has
    // not placed it, so evaluate again whenever those change and once it is
    // shown. A frame requested through the window before 'shown' is pointless:
    // mutter's initial placement overrides it. The one earlier way in is the
    // initial configuration (see _preplace).
    _track(win) {
        const entry = { ids: [], graceId: 0, applyId: 0, shown: false, headStart: null };
        const evaluate = () => this._evaluate(win);
        entry.ids = [
            win.connect('notify::wm-class', evaluate),
            win.connect('notify::title', evaluate),
            win.connect('notify::window-type', evaluate),
            win.connect('shown', () => {
                entry.shown = true;
                evaluate();
            }),
            win.connect('unmanaged', () => this._untrack(win)),
        ];
        if (PLACES_BEFORE_FIRST_FRAME)
            entry.ids.push(win.connect('configure', (w, config) => this._preplace(win, config)));
        this._tracked.set(win, entry);
        this._evaluate(win);
    }

    _untrack(win) {
        const entry = this._tracked.get(win);
        if (!entry)
            return;
        for (const id of entry.ids)
            win.disconnect(id);
        if (entry.graceId)
            GLib.source_remove(entry.graceId);
        if (entry.applyId)
            GLib.source_remove(entry.applyId);
        entry.cancel?.();
        this._tracked.delete(win);
    }

    _matchIndex(win) {
        return this._rules.findIndex(rule => rule.predicates.every(p => p(win)));
    }

    // Put the rule's frame into the window's initial configuration: mutter
    // then skips its own placement and asks the client for that size, so the
    // first frame is drawn in place instead of jumping there afterwards.
    //
    // A head start, not the rule's application: the client may commit another
    // size, its identity may not have arrived yet, and `center` needs a size
    // the window does not have yet. So the window stays tracked and the rule
    // is applied in full once it is shown, exactly as on an older shell.
    _preplace(win, config) {
        try {
            // Wayland clients only: for an X11 window mutter reads the frame
            // back as the client's size hints, and one with server-side
            // decorations then comes out larger by its title bar.
            if (!config.get_is_initial() ||
                win.get_client_type() !== Meta.WindowClientType.WAYLAND ||
                win.get_window_type() !== Meta.WindowType.NORMAL ||
                win.is_fullscreen() || maximizeFlags(win) !== 0)
                return;
            const index = this._matchIndex(win);
            if (index < 0)
                return;
            const rule = this._rules[index];
            if (!rule.geometry || rule.geometry.kind === 'center')
                return;
            // Without a monitor in the rule, the one mutter's own placement
            // would pick: a window with a parent goes over that parent, any
            // other window under the pointer. The window has no position to
            // derive one from yet.
            const monitor = rule.monitor ?? win.get_transient_for()?.get_monitor() ??
                global.display.get_current_monitor();
            if (monitor < 0 || monitor >= global.display.get_n_monitors())
                return;
            const target = this._resolve(rule.geometry, win, workareaOf(win, monitor));
            if (!target)
                return;
            config.set_position(target.x, target.y);
            config.set_size(target.width, target.height);
            this._tracked.get(win).headStart = { rule, monitor };
            console.debug(`[Window Control] rules[${index}] -> ${win.get_id()}: ${rule.geometry.kind} set before the first frame`);
        } catch (e) {
            console.error(`[Window Control] rules: initial configuration: ${e.message}`);
        }
    }

    _evaluate(win) {
        const entry = this._tracked.get(win);
        if (!entry || entry.applyId || win.get_window_type() !== Meta.WindowType.NORMAL)
            return;
        // Tracked since creation, so "never seen unhidden and 'shown' not yet
        // fired" is exactly "mutter has not placed it yet".
        if (!entry.shown && win.is_hidden())
            return;
        entry.shown = true;
        const index = this._matchIndex(win);
        if (index >= 0) {
            const rule = this._rules[index];
            // A rule that took the head start resolves against the same
            // monitor again: literal coordinates can have put the frame on
            // another one, and its workarea would resize the window.
            const headStartMonitor = entry.headStart?.rule === rule ? entry.headStart.monitor : null;
            // Not from inside the 'shown' emission: mutter is still applying
            // the client's first committed size there, and a frame requested
            // that early is overwritten by it (measured on GNOME 46: the
            // position stuck, the size did not). One trip through the main
            // loop is enough. The 'unmanaged' handler stays connected until
            // then, so a window that closes first is never touched.
            entry.applyId = GLib.idle_add(GLib.PRIORITY_DEFAULT, () => {
                entry.applyId = 0;
                this._untrack(win);
                this._apply(win, rule, index, headStartMonitor);
                return GLib.SOURCE_REMOVE;
            });
            return;
        }
        if (!entry.graceId) {
            entry.graceId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, LATE_IDENTITY_GRACE_MS, () => {
                entry.graceId = 0;
                this._untrack(win);
                return GLib.SOURCE_REMOVE;
            });
        }
    }

    _apply(win, rule, index, headStartMonitor) {
        const id = win.get_id();
        try {
            if (rule.workspace !== null)
                win.change_workspace_by_index(rule.workspace, true);
            if (rule.monitor !== null) {
                if (rule.monitor >= global.display.get_n_monitors()) {
                    console.debug(`[Window Control] rules[${index}] -> ${id}: no such monitor, skipped`);
                    return;
                }
                win.move_to_monitor(rule.monitor);
            }
            if (!rule.geometry) {
                console.debug(`[Window Control] rules[${index}] -> ${id}: applied`);
                return;
            }
            if (win.is_fullscreen()) {
                console.debug(`[Window Control] rules[${index}] -> ${id}: fullscreen, geometry skipped`);
                return;
            }
            if (maximizeFlags(win) === 0) {
                this._placeFrame(win, rule, index, headStartMonitor);
                return;
            }
            // A client that restores itself maximized, or one mutter
            // auto-maximized for filling the screen, would have the request
            // dropped outright (see _frameRefusal in extension.js). The rule
            // asked for a rectangle, so the rectangle wins -- once the restore
            // has landed (see afterUnmaximize). The window stays tracked until
            // then so 'unmanaged' and disable() can still cancel it.
            const entry = { ids: [], graceId: 0, applyId: 0, shown: true, cancel: null };
            entry.cancel = afterUnmaximize(win, landed => {
                this._tracked.delete(win);
                if (landed)
                    this._placeFrame(win, rule, index, headStartMonitor);
            });
            this._tracked.set(win, entry);
        } catch (e) {
            console.error(`[Window Control] rules[${index}] -> ${id}: ${e.message}`);
        }
    }

    _placeFrame(win, rule, index, headStartMonitor) {
        const id = win.get_id();
        try {
            const workarea = workareaOf(win, rule.monitor ?? headStartMonitor ?? win.get_monitor());
            const target = this._resolve(rule.geometry, win, workarea);
            if (!target) {
                console.debug(`[Window Control] rules[${index}] -> ${id}: resolves to nothing on this workarea, skipped`);
                return;
            }
            win.move_resize_frame(true, target.x, target.y, target.width, target.height);
            console.debug(`[Window Control] rules[${index}] -> ${id}: ${rule.geometry.kind} applied`);
        } catch (e) {
            console.error(`[Window Control] rules[${index}] -> ${id}: ${e.message}`);
        }
    }

    _resolve(geometry, win, workarea) {
        switch (geometry.kind) {
        case 'place':
            return resolvePlaceRect(geometry.tokens, workarea);
        case 'tile':
            return tileRect(geometry.position, workarea);
        case 'center':
            return centerRect(geometry.axis, win.get_frame_rect(), workarea);
        default:
            return null;
        }
    }
}
