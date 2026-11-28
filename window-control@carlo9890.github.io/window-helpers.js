// SPDX-FileCopyrightText: 2026 hko9890
// SPDX-License-Identifier: MIT
// Helpers shared by the D-Bus service, the rules, the overlays and the
// shortcuts: the tracked timeout and idle sources, the window helpers that
// need Meta, and the WindowPlacer. The Meta-free rules.json grammar is in
// rules-format.js.

import GLib from 'gi://GLib';
import Meta from 'gi://Meta';
import Mtk from 'gi://Mtk';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

// The ID of every pending timeout and idle source of the extension. Every
// module starts its sources with addTimeout() or addIdle(), and disable()
// removes all that are left with removeAllSources().
const pendingSourceIds = [];

// A one-shot timeout. Its ID leaves pendingSourceIds when it fires.
export function addTimeout(ms, callback) {
    return trackOnce(done => GLib.timeout_add(GLib.PRIORITY_DEFAULT, ms, done), callback);
}

// A one-shot idle callback. Its ID leaves pendingSourceIds when it runs.
export function addIdle(callback) {
    return trackOnce(done => GLib.idle_add(GLib.PRIORITY_DEFAULT, done), callback);
}

function trackOnce(add, callback) {
    const id = add(() => {
        forgetSource(id);
        callback();
        return GLib.SOURCE_REMOVE;
    });
    pendingSourceIds.push(id);
    return id;
}

function forgetSource(id) {
    const index = pendingSourceIds.indexOf(id);
    if (index === -1)
        return false;
    pendingSourceIds.splice(index, 1);
    return true;
}

// Removes a pending source. An ID of 0, or of a source that already fired or
// was removed, is ignored.
export function removeSource(id) {
    if (forgetSource(id))
        GLib.source_remove(id);
}

export function removeAllSources() {
    for (const id of pendingSourceIds.splice(0))
        GLib.source_remove(id);
}

function sameRect(a, b) {
    return a.x === b.x && a.y === b.y && a.width === b.width && a.height === b.height;
}

// GNOME 49 dropped the Meta.MaximizeFlags argument of maximize()/unmaximize()
// and removed get_maximized(). Its presence marks the pre-49 API, so one
// extension serves GNOME 45-50.
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

// The monitor a frame at `rect` puts the window on: the one the rectangle
// overlaps most. For a rectangle on no monitor, mutter names the primary one,
// so the window's own monitor counts then.
export function targetMonitor(win, { x, y, width, height }) {
    const monitor = global.display.get_monitor_index_for_rect(
        new Mtk.Rectangle({ x, y, width, height }));
    const m = global.display.get_monitor_geometry(monitor);
    const overlaps = x < m.x + m.width && m.x < x + width && y < m.y + m.height && m.y < y + height;
    return overlaps ? monitor : win.get_monitor();
}

// Move the window to monitor `index` at once, outside the placer. The move is
// the newest request, so a pending placement that puts the window on another
// monitor is dropped, of every kind; one for monitor `index` still runs.
export function moveToMonitor(win, placer, index) {
    const pending = placer.pendingMonitor(win);
    if (pending !== null && pending !== index)
        placer.cancel(win);
    // From mutter 49.1 on, move_to_monitor() puts a hidden window (minimized,
    // or on another workspace) at the origin of the monitor's workarea, also
    // when the window is on that monitor already.
    if (win.get_monitor() !== index || !win.is_hidden())
        win.move_to_monitor(index);
}

// How long to wait for an unmaximize to land before placing the frame anyway.
// A client whose restored size equals its maximized one never reports a
// size change, so the wait has to be bounded.
export const UNMAXIMIZE_SETTLE_MS = 1000;

// How long the WindowPlacer waits for a Wayland window to answer a new size.
// Mutter sends nothing to a window when it limits a request to the frame the
// window has, such as a window at its minimum size asked to shrink, so no
// answer comes. It is shorter than the 3 s wait of `wctl center` and
// `--settled`, so they see it end. A window that answers within it lands as
// asked; a later answer can undo what ran after it.
export const ANSWER_WAIT_MS = 2000;

// Unmaximize, then call `settled(true)` after the next 'size-changed' or
// UNMAXIMIZE_SETTLE_MS, or `settled(false)` if the window is unmanaged first.
// destroy() gives the wait up; after it, or after `settled`, nothing is left.
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
            win.connect('unmanaged', () => this._finish(false)),
        ];
        this._timeoutId = addTimeout(UNMAXIMIZE_SETTLE_MS, () => {
            this._timeoutId = 0;
            this._settleFromIdle();
        });
        unmaximizeWindow(win);
    }

    destroy() {
        removeSource(this._timeoutId);
        this._timeoutId = 0;
        removeSource(this._idleId);
        this._idleId = 0;
        for (const id of this._signalIds)
            this._win.disconnect(id);
        this._signalIds = [];
    }

    _finish(landed) {
        const settled = this._settled;
        this.destroy();
        settled(landed);
    }

    _settleFromIdle() {
        if (this._idleId)
            return;
        this._idleId = addIdle(() => {
            this._idleId = 0;
            this._finish(true);
        });
    }
}

// Whether a held request is still the newest request of the window, which
// had the maximize flags `heldFlags` when the request was held. A maximize,
// a tile or a fullscreen since then is newer. The flags it was held with are
// not: place() restores the window from them first. No caller holds a
// request for a fullscreen window.
function heldRequestIsNewest(win, heldFlags) {
    const flags = maximizeFlags(win);
    return !win.is_fullscreen() && (flags === 0 || flags === heldFlags);
}

// The one owner of the frame requests of a shown window: the shortcuts, a
// rule's geometry and the D-Bus geometry methods all place through it, so a
// window has at most one placement pending and the newest request wins.
// MoveToMonitor and a rule's `monitor` move the window outside it
// (moveToMonitor). A frame on another monitor goes there inside it
// (WindowPlacer.moveResizeFrame).
//
// A maximized window is restored first, and its request runs once the
// restore has landed (see UnmaximizeWait). A request made while that restore
// is still pending replaces the pending one: run at once, it would be
// overwritten by the restored size, and the older request would then land
// after it.
//
// The same holds for a new size on Wayland: the window takes it only when its
// client answers, and mutter then applies the position of that request. A
// covered window is suspended and answers only once it is visible again, so
// the answer can come minutes later. A request made before the answer waits
// for it, up to ANSWER_WAIT_MS, and the newest of them runs after it. An
// answer after that can still undo the request.
export class WindowPlacer {
    constructor() {
        this._pending = new Map();        // Meta.Window -> { wait, request, monitor }
        this._answers = new Map();        // Meta.Window -> { answerIds, unmanagedId, idleId, timeoutId, request, monitor, heldFlags }
        this._unanswered = null;          // the window whose wait just ended without an answer
    }

    // Run `request()` now, or once the window's restore or its answer to a
    // new size has landed. `monitor` is the monitor the request puts the
    // window on.
    place(win, request, monitor = win.get_monitor()) {
        const answer = this._answers.get(win);
        if (answer) {
            Object.assign(answer, { request, monitor, heldFlags: maximizeFlags(win) });
            return;
        }
        const pending = this._pending.get(win);
        if (pending && maximizeFlags(win) === 0) {
            Object.assign(pending, { request, monitor });
            return;
        }
        // Maximized again while its restore was pending: that restore is
        // spent, so restore again.
        pending?.wait.destroy();
        if (maximizeFlags(win) === 0) {
            request();
            return;
        }
        const entry = { wait: null, request, monitor };
        entry.wait = new UnmaximizeWait(win, landed => {
            this._pending.delete(win);
            // A flag set since the restore cleared them is newer than the
            // held request: place() replaces it only while they are clear.
            if (landed && heldRequestIsNewest(win, 0))
                entry.request();
        });
        this._pending.set(win, entry);
    }

    // Request a frame as the program, not as the user. For a user operation,
    // mutter applies a minimum size from the frame's old position, so a
    // window whose minimum is above the requested size keeps its old place
    // and never moves. As the program's request, the frame goes where it was
    // asked, grown to the minimum, and mutter keeps it on the screen (unless
    // the window is partly off the screen already: require_fully_onscreen is
    // then unset).
    //
    // Only a user operation or move_to_monitor() makes mutter record a new
    // preferred monitor, the one it puts the window back on after a monitor
    // change. So a frame on another monitor goes there with move_to_monitor()
    // first, which is a program request too.
    moveResizeFrame(win, rect) {
        const monitor = targetMonitor(win, rect);
        if (monitor !== win.get_monitor())
            win.move_to_monitor(monitor);
        this._change(win, () => win.move_resize_frame(false, rect.x, rect.y, rect.width, rect.height), rect);
    }

    // As the user, so the window can go partly off the screen. The size stays,
    // so mutter moves the window at once.
    move(win, x, y) {
        win.move_frame(true, x, y);
    }

    resize(win, width, height) {
        const { x, y } = win.get_frame_rect();
        this._change(win, () => win.move_resize_frame(true, x, y, width, height), { x, y, width, height });
    }

    unmaximize(win) {
        if (maximizeFlags(win) !== 0)
            this._change(win, () => unmaximizeWindow(win), null);
    }

    // Run `change()`, and wait for the window's answer when the frame has not
    // changed yet. An X11 window takes the frame inside the call, as does a
    // Wayland window whose size stays.
    _change(win, change, target) {
        const before = win.get_frame_rect();
        change();
        // After a wait that ended without an answer, the window is not
        // expected to answer this one either: waiting again would only add
        // another ANSWER_WAIT_MS.
        if (win === this._unanswered || win.get_client_type() !== Meta.WindowClientType.WAYLAND ||
            !sameRect(win.get_frame_rect(), before) || (target && sameRect(target, before)))
            return;
        // A newer wait replaces an older one and keeps the request it holds.
        const older = this._answers.get(win);
        this._dropAnswer(win);
        const entry = {
            answerIds: [], unmanagedId: 0, idleId: 0, timeoutId: 0,
            request: older?.request ?? null, monitor: older?.monitor ?? null, heldFlags: older?.heldFlags ?? 0,
        };
        const answered = (timedOut = false) => {
            for (const id of entry.answerIds)
                win.disconnect(id);
            entry.answerIds = [];
            removeSource(entry.timeoutId);
            entry.timeoutId = 0;
            // 'size-changed' is emitted from inside mutter's own move-resize,
            // where a new request would be overwritten (see UnmaximizeWait).
            // 'unmanaged' stays connected until then, so a window that closes
            // first gets no request.
            removeSource(entry.idleId);
            entry.idleId = addIdle(() => {
                entry.idleId = 0;
                this._dropAnswer(win);
                if (entry.request && heldRequestIsNewest(win, entry.heldFlags)) {
                    this._unanswered = timedOut ? win : null;
                    try {
                        this.place(win, entry.request, entry.monitor);
                    } finally {
                        this._unanswered = null;
                    }
                }
            });
        };
        entry.answerIds = [
            win.connect('size-changed', () => answered()),
            win.connect('position-changed', () => answered()),
        ];
        entry.unmanagedId = win.connect('unmanaged', () => this._dropAnswer(win));
        entry.timeoutId = addTimeout(ANSWER_WAIT_MS, () => {
            entry.timeoutId = 0;
            answered(true);
        });
        this._answers.set(win, entry);
    }

    _dropAnswer(win) {
        const entry = this._answers.get(win);
        if (!entry)
            return;
        removeSource(entry.idleId);
        removeSource(entry.timeoutId);
        for (const id of [...entry.answerIds, entry.unmanagedId].filter(Boolean))
            win.disconnect(id);
        this._answers.delete(win);
    }

    // Whether the window has not answered yet: a restore, or a new size it has
    // not taken. Its frame changes again when the answer comes.
    awaitsAnswer(win) {
        return this._pending.has(win) || this._answers.has(win);
    }

    // The monitor the window's pending request puts it on, or null for none.
    pendingMonitor(win) {
        return this._pending.get(win)?.monitor ?? this._answers.get(win)?.monitor ?? null;
    }

    // Drop the window's pending request, without running it. Its wait stays,
    // so a newer request still waits for the restore or the answer.
    cancel(win) {
        const pending = this._pending.get(win);
        if (pending)
            pending.request = () => {};
        const answer = this._answers.get(win);
        if (answer)
            Object.assign(answer, { request: null, monitor: null });
    }

    // Drop every pending request, without running it.
    destroy() {
        for (const { wait } of this._pending.values())
            wait.destroy();
        this._pending.clear();
        for (const win of [...this._answers.keys()])
            this._dropAnswer(win);
    }
}
