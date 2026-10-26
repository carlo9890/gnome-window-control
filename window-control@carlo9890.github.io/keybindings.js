// SPDX-FileCopyrightText: 2026 hko9890
// SPDX-License-Identifier: MIT
// Keyboard shortcuts: tile the focused window to a grid position, the way a
// `wctl tile focused <position>` would, without a process spawn per key.
//
// The shortcuts are GSettings keys (schemas/*.gschema.xml), one per tile
// position plus `cycle-wide`, so a user rebinds one with dconf or gsettings
// and never edits this file. The grid and the position names are the ones
// rules.json and wctl use, from rules-format.js.

import Meta from 'gi://Meta';
import Shell from 'gi://Shell';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import { nextWidePosition, tileRect } from './rules-format.js';
import { UnmaximizeWait, maximizeFlags, workareaOf } from './window-helpers.js';

// Settings key -> tile position. The cycle key is handled apart, because its
// position depends on where the window is. Every key named here must exist in
// the schema: GSettings aborts the shell on a key it does not know, which the
// registration check in _add cannot detect.
const TILE_BINDINGS = {
    'tile-top-left': 'top-left',
    'tile-top-center': 'top-center',
    'tile-top-right': 'top-right',
    'tile-left': 'left',
    'tile-center': 'center',
    'tile-right': 'right',
    'tile-bottom-left': 'bottom-left',
    'tile-bottom-center': 'bottom-center',
    'tile-bottom-right': 'bottom-right',
};
const CYCLE_WIDE_BINDING = 'cycle-wide';

export class WindowKeybindings {
    constructor() {
        this._names = [];
        this._pending = new Map();        // Meta.Window -> UnmaximizeWait
    }

    // All or none: when one shortcut cannot be registered, the ones before it
    // go too, and the extension runs without shortcuts.
    enable(settings) {
        const handlers = [
            ...Object.entries(TILE_BINDINGS).map(([name, position]) =>
                [name, (display, win) => this._tile(name, win, position)]),
            [CYCLE_WIDE_BINDING, (display, win) => this._cycleWide(win)],
        ];
        for (const [name, handler] of handlers) {
            if (!this._add(name, settings, handler)) {
                this.disable();
                console.warn(`[Window Control] cannot register the ${name} shortcut; keyboard shortcuts disabled`);
                return;
            }
        }
        console.log(`[Window Control] ${this._names.length} keyboard shortcut(s) registered`);
    }

    disable() {
        for (const name of this._names)
            Main.wm.removeKeybinding(name);
        this._names = [];
        for (const wait of this._pending.values())
            wait.destroy();
        this._pending.clear();
    }

    // Whether the shortcuts are served: all of them, or none (see enable).
    get registered() {
        return this._names.length > 0;
    }

    _add(name, settings, handler) {
        // PER_WINDOW: mutter hands the focused window to the handler and does
        // not call it when there is none -- the flags its own window shortcuts
        // (maximize, minimize, close) carry. IGNORE_AUTOREPEAT: holding the key
        // must not queue a burst of move-resize requests. NORMAL: a shortcut
        // that moves a window has no meaning in the overview or on the lock
        // screen.
        const action = Main.wm.addKeybinding(name, settings,
            Meta.KeyBindingFlags.PER_WINDOW | Meta.KeyBindingFlags.IGNORE_AUTOREPEAT,
            Shell.ActionMode.NORMAL, handler);
        if (action === Meta.KeyBindingAction.NONE)
            return false;
        this._names.push(name);
        return true;
    }

    _tile(name, win, position) {
        if (!this._actionable(name, win))
            return;
        this._place(win, position, workareaOf(win));
    }

    _cycleWide(win) {
        if (!this._actionable(CYCLE_WIDE_BINDING, win))
            return;
        const workarea = workareaOf(win);
        this._place(win, nextWidePosition(win.get_frame_rect(), workarea), workarea);
    }

    // Only NORMAL windows, the same set the D-Bus surface exposes, and not a
    // fullscreen one: a frame requested there is dropped, as rules.js documents.
    _actionable(name, win) {
        if (!win || win.get_window_type() !== Meta.WindowType.NORMAL) {
            console.debug(`[Window Control] ${name}: no normal window focused`);
            return false;
        }
        if (win.is_fullscreen()) {
            console.debug(`[Window Control] ${name} -> ${win.get_id()}: fullscreen, skipped`);
            return false;
        }
        return true;
    }

    _place(win, position, workarea) {
        const id = win.get_id();
        const target = tileRect(position, workarea);
        const request = () => {
            win.move_resize_frame(true, target.x, target.y, target.width, target.height);
            console.debug(`[Window Control] shortcut -> ${id}: tile ${position}`);
        };
        // A maximized frame drops the request outright (see _frameRefusal in
        // dbus-service.js), and a frame requested while an unmaximize is still
        // in flight is overwritten by the restored size -- the restore an
        // earlier press started included, although the flags already read as
        // unmaximized then. Restore first and place once the restore has
        // landed; a second press before then replaces the first press's
        // target rather than racing it.
        if (maximizeFlags(win) === 0 && !this._pending.has(win)) {
            request();
            return;
        }
        this._cancelPending(win);
        this._pending.set(win, new UnmaximizeWait(win, landed => {
            this._pending.delete(win);
            if (landed)
                request();
        }));
    }

    _cancelPending(win) {
        const wait = this._pending.get(win);
        if (wait) {
            wait.destroy();
            this._pending.delete(win);
        }
    }
}
