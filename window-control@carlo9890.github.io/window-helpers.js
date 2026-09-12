// SPDX-FileCopyrightText: 2026 hko9890
// SPDX-License-Identifier: MIT
// Helpers shared by the D-Bus service and the window rules: the selector
// predicate, and the maximize API that changed in GNOME 49.

import Meta from 'gi://Meta';

// Build the match predicate for a (kind, value) selector. One implementation
// for WaitForWindow, the ActivateBy* methods and rules.json, so the three
// cannot disagree about which window a value names. Returns null for an
// unknown kind, an empty substring (which would match every window) or a pid
// that is not a positive decimal integer: get_pid() is 0 for a window whose
// client pid is unknown, so 0 must never be matchable.
export function matchPredicate(kind, value) {
    switch (kind) {
    case 'class':
        return w => w.get_wm_class() === value;
    case 'title':
        return w => w.get_title() === value;
    case 'substring':
        if (value === '')
            return null;
        return w => (w.get_title() || '').includes(value);
    case 'pid': {
        if (!/^[0-9]+$/.test(value))
            return null;
        const pid = Number(value);
        if (!Number.isSafeInteger(pid) || pid <= 0)
            return null;
        return w => w.get_pid() === pid;
    }
    default:
        return null;
    }
}

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
