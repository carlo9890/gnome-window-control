// SPDX-FileCopyrightText: 2026 hko9890
// SPDX-License-Identifier: MIT
// Overlay windows: a window that a rules.json rule marks "overlay": true stays
// above the other windows and out of Alt+Tab and the overview, and is
// minimized when the user turns to another window or the overview has opened.
// Its caller brings it back with an ordinary activate.
//
// rules.js decides which windows are overlays; this file holds what being one
// means, and undoes it when a window stops being one.

import GLib from 'gi://GLib';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import { minimizeWindow } from './window-helpers.js';

// A focus change away from an overlay hides it only when the change still
// holds this long after: wl-copy and wl-paste map a surface that takes the
// focus for a moment and hands it back.
const FOCUS_LOSS_GRACE_MS = 250;

export class WindowOverlays {
    constructor() {
        this._windows = new Map();
        this._focusId = 0;
        this._overviewId = 0;
    }

    add(win) {
        if (this._windows.has(win))
            return;
        const entry = { ids: [], graceId: 0, madeAbove: false };
        // Only an "above" the overlay set is taken back when it ends, so one
        // the user or the client set stays -- also one set again after the
        // overlay set its own.
        if (!win.is_above()) {
            win.make_above();
            entry.madeAbove = true;
        }
        entry.ids = [
            win.connect('unmanaged', () => this._forget(win, true)),
            win.connect('notify::above', () => {
                entry.madeAbove = false;
            }),
        ];
        // Alt+Tab, the overview and the workspace thumbnails read this
        // property of the window object. Mutter's own skip-taskbar state stays
        // unset: a window that has it set cannot be minimized, and minimize
        // is how an overlay hides. The notify makes an open overview drop
        // the window it already shows.
        Object.defineProperty(win, 'skip_taskbar', { get: () => true, configurable: true });
        win.notify('skip-taskbar');
        this._windows.set(win, entry);
        this._syncWatch();
        console.debug(`[Window Control] overlay -> ${win.get_id()}: on`);
    }

    remove(win) {
        const entry = this._windows.get(win);
        if (!entry)
            return;
        if (entry.madeAbove && win.is_above())
            win.unmake_above();
        this._forget(win, false);
        console.debug(`[Window Control] overlay -> ${win.get_id()}: off`);
    }

    destroy() {
        for (const win of [...this._windows.keys()])
            this.remove(win);
    }

    get size() {
        return this._windows.size;
    }

    has(win) {
        return this._windows.has(win);
    }

    // An unmanaged window gets no notify: the overview would take it back.
    _forget(win, unmanaged) {
        const entry = this._windows.get(win);
        for (const id of entry.ids)
            win.disconnect(id);
        this._removeGrace(entry);
        delete win.skip_taskbar;
        if (!unmanaged)
            win.notify('skip-taskbar');
        this._windows.delete(win);
        this._syncWatch();
    }

    _syncWatch() {
        if (this._windows.size > 0 && !this._focusId) {
            this._focusId = global.display.connect('notify::focus-window', () => this._focusChanged());
            // 'shown', not 'showing': a touchpad gesture emits 'showing' as it
            // starts, and the user can still cancel it.
            this._overviewId = Main.overview.connect('shown', () => this._hideAll());
        } else if (this._windows.size === 0 && this._focusId) {
            global.display.disconnect(this._focusId);
            this._focusId = 0;
            Main.overview.disconnect(this._overviewId);
            this._overviewId = 0;
        }
    }

    _focusChanged() {
        const focus = global.display.focus_window;
        const workspace = global.workspace_manager.get_active_workspace();
        for (const [win, entry] of this._windows) {
            if (this._holdsFocus(win, focus)) {
                this._removeGrace(entry);
                continue;
            }
            // No focused window at all is not a turn to another window: the
            // shell's own menus and dialogs take the keyboard that way.
            // An overlay on another workspace is out of sight already, and
            // moving it there takes its focus.
            if (!focus || win.minimized || !win.located_on_workspace(workspace))
                continue;
            // Each turn to another window starts the grace period again.
            this._removeGrace(entry);
            entry.graceId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, FOCUS_LOSS_GRACE_MS, () => {
                entry.graceId = 0;
                const now = global.display.focus_window;
                if (now && !this._holdsFocus(win, now))
                    this._hide(win, 'focus moved to another window');
                return GLib.SOURCE_REMOVE;
            });
        }
    }

    // The overlay's own dialogs count as the overlay.
    _holdsFocus(win, focus) {
        return focus === win || (focus !== null && win.is_ancestor_of_transient(focus));
    }

    _hideAll() {
        for (const win of this._windows.keys())
            this._hide(win, 'overview opened');
    }

    _hide(win, reason) {
        if (win.minimized)
            return;
        if (minimizeWindow(win, true))
            console.debug(`[Window Control] overlay -> ${win.get_id()}: hidden, ${reason}`);
        else
            console.debug(`[Window Control] overlay -> ${win.get_id()}: cannot be minimized, left shown`);
    }

    _removeGrace(entry) {
        if (entry.graceId) {
            GLib.source_remove(entry.graceId);
            entry.graceId = 0;
        }
    }
}
