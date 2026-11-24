// SPDX-FileCopyrightText: 2026 hko9890
// SPDX-License-Identifier: MIT
// Keyboard shortcuts that do what `wctl tile focused <position>` and
// `wctl rules apply` do, without a process spawn per key. The keys are in
// schemas/*.gschema.xml.

import Meta from 'gi://Meta';
import Shell from 'gi://Shell';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import { nextWidePosition, tileRect } from './rules-format.js';
import { moveResizeFrame, workareaOf } from './window-helpers.js';

// Settings key -> tile position. The cycle key is handled apart, because its
// position depends on where the window is. Every key named here must exist in
// the schema: GSettings aborts the shell on a key it does not know, so _add
// refuses one that the schema of an older version, installed while this code
// runs, lacks.
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
const APPLY_RULES_BINDING = 'apply-rules';

// PER_WINDOW: mutter hands the focused window to the handler and does not call
// it when there is none -- the flags its own window shortcuts (maximize,
// minimize, close) carry. IGNORE_AUTOREPEAT: holding the key must not queue a
// burst of move-resize requests.
const WINDOW_FLAGS = Meta.KeyBindingFlags.PER_WINDOW | Meta.KeyBindingFlags.IGNORE_AUTOREPEAT;
// apply-rules acts on every open window, so it needs no focused window.
const GLOBAL_FLAGS = Meta.KeyBindingFlags.IGNORE_AUTOREPEAT;

export class WindowKeybindings {
    constructor(placer, applyRules) {
        this._placer = placer;
        this._applyRules = applyRules;
        this._names = [];
    }

    // All or none: when one shortcut cannot be registered, the ones before it
    // go too, and the extension runs without shortcuts.
    enable(settings) {
        const handlers = [
            ...Object.entries(TILE_BINDINGS).map(([name, position]) =>
                [name, WINDOW_FLAGS, (display, win) => this._tile(name, win, position)]),
            [CYCLE_WIDE_BINDING, WINDOW_FLAGS, (display, win) => this._cycleWide(win)],
            [APPLY_RULES_BINDING, GLOBAL_FLAGS, () => this._applyRules()],
        ];
        for (const [name, flags, handler] of handlers) {
            if (!this._add(name, settings, flags, handler)) {
                this.disable();
                console.warn(`[Window Control] cannot register the ${name} shortcut; keyboard shortcuts disabled`);
                return;
            }
        }
        console.debug(`[Window Control] ${this._names.length} keyboard shortcut(s) registered`);
    }

    disable() {
        for (const name of this._names)
            Main.wm.removeKeybinding(name);
        this._names = [];
    }

    // Whether the shortcuts are served: all of them, or none (see enable).
    get registered() {
        return this._names.length > 0;
    }

    _add(name, settings, flags, handler) {
        if (!settings.settings_schema.has_key(name))
            return false;
        // NORMAL: a shortcut that moves a window has no meaning in the overview
        // or on the lock screen.
        const action = Main.wm.addKeybinding(name, settings, flags, Shell.ActionMode.NORMAL, handler);
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
    // fullscreen one: mutter drops a frame requested there (see _frameRefusal
    // in dbus-service.js).
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

    // The target is taken at the press, on the monitor the window is on then:
    // a maximized window is placed only once its restore has landed (see
    // WindowPlacer), and a later press replaces this one.
    _place(win, position, workarea) {
        const target = tileRect(position, workarea);
        this._placer.place(win, () => {
            moveResizeFrame(win, target);
            console.debug(`[Window Control] shortcut -> ${win.get_id()}: tile ${position}`);
        });
    }
}
