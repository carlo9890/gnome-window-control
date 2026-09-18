// SPDX-FileCopyrightText: 2026 hko9890
// SPDX-License-Identifier: MIT
// Helpers shared by the D-Bus service, the window rules and the keyboard
// shortcuts: the maximize API that changed in GNOME 49, the workarea a window
// resolves against, and the wait for an unmaximize to land.
//
// The selector predicate used to live here too. It moved to rules-format.js,
// which imports nothing, so that plain `gjs` can load the grammar without the
// mutter typelib. Everything left in this file needs Meta.

import GLib from 'gi://GLib';
import Meta from 'gi://Meta';

// GNOME 49 changed the Meta.Window maximize API: maximize()/unmaximize() no
// longer take a Meta.MaximizeFlags argument, and get_maximized() was removed in
// favor of get_maximize_flags()/is_maximized() (verified against mutter 49.0
// window.h). global.get_window_actors() and the rest of the Meta.Window API used
// here are unchanged across GNOME 45-50. Detect the pre-49 API via the removed
// get_maximized() method so a single extension works on all supported shells.
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
// `settled(false)` when the window is unmanaged before then. Returns a function
// that cancels the wait; after it, or after `settled`, nothing is left behind.
//
// A frame requested while the unmaximize is still in flight is overwritten by
// the restored size, which is why the callers wait at all. 'size-changed' is
// emitted from inside mutter's own move-resize, so the frame is requested from
// an idle callback rather than from the handler: a request made re-entrantly
// is overwritten when the outer call continues (both measured on GNOME 46).
export function afterUnmaximize(win, settled) {
    const ids = [];
    let timeoutId = 0;
    let idleId = 0;
    const cancel = () => {
        for (const id of ids)
            win.disconnect(id);
        ids.length = 0;
        if (timeoutId)
            GLib.source_remove(timeoutId);
        if (idleId)
            GLib.source_remove(idleId);
        timeoutId = 0;
        idleId = 0;
    };
    const done = () => {
        if (idleId)
            return;
        idleId = GLib.idle_add(GLib.PRIORITY_DEFAULT, () => {
            idleId = 0;
            cancel();
            settled(true);
            return GLib.SOURCE_REMOVE;
        });
    };
    ids.push(
        win.connect('size-changed', done),
        win.connect('unmanaged', () => {
            cancel();
            settled(false);
        }));
    timeoutId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, UNMAXIMIZE_SETTLE_MS, () => {
        timeoutId = 0;
        done();
        return GLib.SOURCE_REMOVE;
    });
    unmaximizeWindow(win);
    return cancel;
}
