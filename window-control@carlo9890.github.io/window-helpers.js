// SPDX-FileCopyrightText: 2026 hko9890
// SPDX-License-Identifier: MIT
// Helpers shared by the D-Bus service, the window rules, the overlay windows
// and the keyboard shortcuts: the maximize API that changed in GNOME 49, a
// minimize without the animation, the workarea a window resolves against, and
// the wait for an unmaximize to land. Everything here needs Meta; the
// Meta-free selector grammar is in rules-format.js.

import GLib from 'gi://GLib';
import Meta from 'gi://Meta';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

// GNOME 49 changed the Meta.Window maximize API: maximize()/unmaximize() no
// longer take a Meta.MaximizeFlags argument, and get_maximized() was removed in
// favor of get_maximize_flags()/is_maximized(). The rest of the Meta.Window
// API used here is unchanged across GNOME 45-50. Detect the pre-49 API via the
// removed get_maximized() method so a single extension works on all supported
// shells.
export function maximizeFlags(win) {
    if (typeof win.get_maximized === 'function') {
        return win.get_maximized();                                  // GNOME <= 48
    }
    return win.get_maximize_flags();                                 // GNOME 49+
}

export function isFullyMaximized(win) {
    return maximizeFlags(win) === Meta.MaximizeFlags.BOTH;
}

export function maximizeWindow(win) {
    if (typeof win.get_maximized === 'function') {
        win.maximize(Meta.MaximizeFlags.BOTH);                       // GNOME <= 48
    } else {
        win.maximize();                                              // GNOME 49+
    }
}

export function unmaximizeWindow(win) {
    if (typeof win.get_maximized === 'function') {
        win.unmaximize(Meta.MaximizeFlags.BOTH);                     // GNOME <= 48
    } else {
        win.unmaximize();                                            // GNOME 49+
    }
}

// Skip the animation of the next minimize or unminimize. The skip holds until
// the actor's next effect of any kind, so arm it only for a request that
// changes the window's visibility.
export function skipNextEffect(win) {
    Main.wm.skipNextEffect(win.get_compositor_private());
}

// Minimize, and return whether the window is minimized. Mutter
// does not let every window minimize (a skip-taskbar one, for example):
// minimize() does nothing there, so a skip armed for it would wait for an
// unrelated effect. Such a window counts only when it is minimized
// already -- a client can set skip-taskbar on a window it has iconified.
export function minimizeWindow(win, skipEffect) {
    if (!win.can_minimize())
        return win.minimized;
    if (skipEffect && !win.is_hidden())
        skipNextEffect(win);
    win.minimize();
    return true;
}

// For a window whose map was not watched: is it in the one state a window
// mutter has not mapped yet can be in? That is hidden while unminimized and on
// the active workspace. Mutter also hides a transient window while a window it
// is transient for is minimized, so such a window counts as mapped.
export function looksUnmapped(win) {
    if (!win.is_hidden() || win.minimized)
        return false;
    for (let parent = win.get_transient_for(); parent; parent = parent.get_transient_for()) {
        if (parent.minimized)
            return false;
    }
    return win.located_on_workspace(global.workspace_manager.get_active_workspace());
}

// The workarea a window's geometry resolves against: the workspace the window
// is on (a window on all workspaces has none, so the active one then) and the
// given monitor, the window's own by default.
export function workareaOf(win, monitor = win.get_monitor()) {
    const workspace = win.get_workspace() || global.workspace_manager.get_active_workspace();
    return workspace.get_work_area_for_monitor(monitor);
}

// How long to wait for an unmaximize to land before placing the frame anyway.
// A client whose restored size equals its maximized one never reports a
// size change, so the wait has to be bounded.
export const UNMAXIMIZE_SETTLE_MS = 1000;

// Unmaximize, then call `settled(true)` from an idle callback after the next
// 'size-changed' or after UNMAXIMIZE_SETTLE_MS, whichever comes first, or
// `settled(false)` when the window is unmanaged before then. The owner calls
// destroy() to give the wait up; after it, or after `settled`, nothing is left
// behind.
//
// A frame requested while the unmaximize is still in flight is overwritten by
// the restored size, which is why the callers wait at all. 'size-changed' is
// emitted from inside mutter's own move-resize, so the frame is requested from
// an idle callback rather than from the handler: a request made re-entrantly
// is overwritten when the outer call continues.
export class UnmaximizeWait {
    constructor(win, settled) {
        this._win = win;
        this._settled = settled;
        this._idleId = 0;
        this._signalIds = [
            win.connect('size-changed', () => this._settleFromIdle()),
            win.connect('unmanaged', () => {
                this.destroy();
                this._settled(false);
            }),
        ];
        this._timeoutId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, UNMAXIMIZE_SETTLE_MS, () => {
            this._timeoutId = 0;
            this._settleFromIdle();
            return GLib.SOURCE_REMOVE;
        });
        unmaximizeWindow(win);
    }

    destroy() {
        for (const id of this._signalIds)
            this._win.disconnect(id);
        this._signalIds = [];
        if (this._timeoutId) {
            GLib.source_remove(this._timeoutId);
            this._timeoutId = 0;
        }
        if (this._idleId) {
            GLib.source_remove(this._idleId);
            this._idleId = 0;
        }
    }

    _settleFromIdle() {
        if (this._idleId)
            return;
        this._idleId = GLib.idle_add(GLib.PRIORITY_DEFAULT, () => {
            this._idleId = 0;
            this.destroy();
            this._settled(true);
            return GLib.SOURCE_REMOVE;
        });
    }
}
