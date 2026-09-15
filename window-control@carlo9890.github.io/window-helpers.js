// SPDX-FileCopyrightText: 2026 hko9890
// SPDX-License-Identifier: MIT
// Helpers shared by the D-Bus service and the window rules: the maximize API
// that changed in GNOME 49.
//
// The selector predicate used to live here too. It moved to rules-format.js,
// which imports nothing, so that plain `gjs` can load the grammar without the
// mutter typelib. Everything left in this file needs Meta.

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
