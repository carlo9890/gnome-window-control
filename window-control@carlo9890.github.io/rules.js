// SPDX-FileCopyrightText: 2026 hko9890
// SPDX-License-Identifier: MIT
// Window rules: place each new window by the rules in
// ~/.config/gnome-window-control/rules.json and rules.d/*.json, and keep the
// overlay rules on the open windows. The grammar is in rules-format.js.

import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Meta from 'gi://Meta';
import * as Config from 'resource:///org/gnome/shell/misc/config.js';
import { WindowOverlays } from './overlay.js';
import { centerRect, compileRules, fitsMonitor, resolvePlaceRect, tileRect } from './rules-format.js';
import { CONFIG_DIR, DROPIN_DIR, DROPIN_PATH, RULES_FILE, readRuleFiles, DirectoryWatch } from './rules-files.js';
import {
    addIdle, addTimeout, looksUnmapped, maximizeFlags, moveToMonitor, removeSource, workareaOf,
} from './window-helpers.js';

// A Wayland client's app_id and first real title can land after the window is
// shown, so a shown window that matched nothing yet stays under evaluation this
// long before it is given up on. Without the bound, a title change hours later
// would re-place a window the user has long since arranged.
const LATE_IDENTITY_GRACE_MS = 2000;

// Collapse the burst of file events one save produces into a single reload.
const RELOAD_DEBOUNCE_MS = 100;

// Mutter 49 and later, where the 'configure' signal hands a handler the
// window's initial configuration before the client has drawn anything. Mutter
// 48 has the signal too but applies the handler's values another way, so the
// get_maximize_flags() probe, new in 49, leaves it out.
const PLACES_BEFORE_FIRST_FRAME = Meta.WindowConfig !== undefined &&
    typeof Meta.Window.prototype.get_maximize_flags === 'function';

// get_monitor_geometry() is in mutter's stage coordinates: logical or
// physical pixels. X11 is physical. Wayland is logical from mutter 50 on,
// before that only with scale-monitor-framebuffer. Mutter 50 has no X11 and
// no Meta.is_wayland_compositor().
const STAGE_ALWAYS_LOGICAL = Number.parseInt(Config.PACKAGE_VERSION) >= 50;

function ruleName(rule) {
    return `${rule.source} rules[${rule.index}]`;
}

export class WindowRules {
    constructor(placer) {
        this._placer = placer;
        this._rules = [];
        this._windowCreatedId = 0;
        this._tracked = new Map();
        this._fileWatch = new DirectoryWatch();
        this._dropInWatch = new DirectoryWatch();
        this._reloadId = 0;
        this._loadCancellable = null;
        // A read in flight, and what waits for it (whenLoaded).
        this._loading = false;
        this._afterLoad = [];
        // org.gnome.mutter, read for the layout mode below mutter 50.
        this._mutterSettings = null;
        this._overlays = null;
    }

    enable() {
        if (!STAGE_ALWAYS_LOGICAL)
            this._mutterSettings = new Gio.Settings({ schema_id: 'org.gnome.mutter' });
        this._overlays = new WindowOverlays();
        const dir = Gio.File.new_for_path(CONFIG_DIR);
        try {
            dir.make_directory_with_parents(null);
        } catch (e) {
            if (!e.matches(Gio.IOErrorEnum, Gio.IOErrorEnum.EXISTS))
                console.error(`[Window Control] cannot create ${CONFIG_DIR}: ${e.message}`);
        }
        // The directory rather than the file: a file monitor misses an editor
        // that saves by writing a new file and renaming it over the old one.
        // Compared as files, not by name: get_basename() throws for a name
        // that is not UTF-8.
        const rulesFile = dir.get_child(RULES_FILE);
        const dropInDir = dir.get_child(DROPIN_DIR);
        try {
            this._fileWatch.start(dir, file => {
                // A rules.d created, deleted or replaced after enable() is
                // another folder, so its monitor is made again.
                if (file.equal(dropInDir)) {
                    this._watchDropIns();
                    this._scheduleReload();
                } else if (file.equal(rulesFile)) {
                    this._scheduleReload();
                }
            });
        } catch (e) {
            console.error(`[Window Control] cannot watch ${CONFIG_DIR}: ${e.message}; the rules files are read only at enable() and when rules.d changes`);
        }
        this._watchDropIns();
        this._load();
    }

    disable() {
        removeSource(this._reloadId);
        this._reloadId = 0;
        this._loadCancellable.cancel();
        this._loadCancellable = null;
        this._loading = false;
        for (const callback of this._afterLoad.splice(0))
            callback(false);
        this._mutterSettings = null;
        this._fileWatch.stop();
        this._dropInWatch.stop();
        for (const win of [...this._tracked.keys()])
            this._untrack(win);
        this._overlays.destroy();
        this._overlays = null;
        this._rules = [];
        this._syncWatch();
    }

    // No rules.d means no monitor: the CONFIG_DIR monitor sees it created.
    // monitor_directory() does not fail for a missing path, hence the check.
    // The check is synchronous because monitor_directory() is: Gio has no
    // asynchronous form of it, and it looks the same path up.
    _watchDropIns() {
        this._dropInWatch.stop();
        const dir = Gio.File.new_for_path(DROPIN_PATH);
        if (dir.query_file_type(Gio.FileQueryInfoFlags.NONE, null) !== Gio.FileType.DIRECTORY)
            return;
        try {
            this._dropInWatch.start(dir, () => this._scheduleReload());
        } catch (e) {
            console.error(`[Window Control] cannot watch ${DROPIN_PATH}: ${e.message}`);
            return;
        }
    }

    _scheduleReload() {
        removeSource(this._reloadId);
        this._reloadId = addTimeout(RELOAD_DEBOUNCE_MS, () => {
            this._reloadId = 0;
            this._load();
        });
    }

    // Asynchronous, so the read never blocks the compositor. A newer read
    // and disable() both cancel the one in flight, and a cancelled read changes
    // nothing. The rule set is replaced once, after every file has been read.
    // Until the first read lands the rule set is empty, so a window created
    // between enable() and then is not placed.
    _load() {
        this._loadCancellable?.cancel();
        this._loading = true;
        const cancellable = new Gio.Cancellable();
        this._loadCancellable = cancellable;
        // Whatever ends a load that was not replaced, a throw included, must
        // not leave ApplyRules waiting for it.
        readRuleFiles(cancellable).then(files => {
            if (!cancellable.is_cancelled())
                this._compile(files);
        }).catch(e => {
            console.error(`[Window Control] the rules files cannot be loaded: ${e.message}`);
        }).finally(() => {
            if (!cancellable.is_cancelled())
                this._finishLoad();
        });
    }

    // Run `callback(true)` once no reload is due and no read is in flight, at
    // once when none is; `callback(false)` at disable() instead. A file saved
    // just before ApplyRules is then applied as saved, not as before.
    whenLoaded(callback) {
        if (this._reloadId || this._loading)
            this._afterLoad.push(callback);
        else
            callback(true);
    }

    _finishLoad() {
        this._loading = false;
        if (this._reloadId)
            return;
        for (const callback of this._afterLoad.splice(0))
            callback(true);
    }

    // A file that does not validate adds no rules; the other files still do.
    _compile(files) {
        this._rules = files.flatMap(({ label, text }) => {
            try {
                return compileRules(text).map((rule, index) => Object.assign(rule, { source: label, index }));
            } catch (e) {
                console.warn(`[Window Control] ${label}: ${e.message}; the rules of that file are off`);
                return [];
            }
        });
        console.debug(`[Window Control] ${this._rules.length} rule(s) loaded`);
        this._syncWatch();
        this._syncOverlays();
    }

    // An overlay rule holds for the windows already open too, not only for
    // new ones: an open overlay must still be one after the extension is
    // enabled again, and after an edit of the file. Placement happens once
    // per new window, and again only at applyRules.
    _syncOverlays() {
        if (this._overlays.size === 0 && !this._rules.some(rule => rule.overlay))
            return;
        for (const win of global.display.list_all_windows()) {
            // A window mutter has not shown yet gets the overlay when its rule
            // is applied; hiding it before then would keep it from ever
            // showing. One that is not tracked has no record of its map.
            const entry = this._tracked.get(win);
            if (entry ? !entry.shown : looksUnmapped(win))
                continue;
            const index = this._winningIndex(win);
            if (index >= 0 && this._rules[index].overlay)
                this._overlays.add(win);
            else
                this._overlays.remove(win);
        }
    }

    // Apply the rules again to the open windows, or to `only`, and decide
    // each one's overlay membership as a load does. Returns how many windows
    // a rule matched. A tracked window is skipped: its own rule is on the
    // way, or its grace period runs. So is a window mutter has not shown yet:
    // its initial placement would override the frame. A window waiting for
    // its unmaximize is placed again: the newer request replaces the pending
    // one (see WindowPlacer).
    applyRules(only, isUnshown) {
        let applied = 0;
        for (const win of only ? [only] : global.display.list_all_windows()) {
            if (this._tracked.has(win) || isUnshown(win))
                continue;
            const index = this._winningIndex(win);
            const rule = this._rules[index];
            if (!rule?.overlay)
                this._overlays.remove(win);
            if (index < 0)
                continue;
            this._apply(win, rule, null, true);
            applied++;
        }
        console.debug(`[Window Control] rules applied again to ${applied} window(s)`);
        return applied;
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
            // A load affects new windows only: a window whose rule matched
            // already, with its apply queued, keeps that rule, and so does one
            // whose placement waits for its unmaximize (WindowPlacer). Only
            // the windows still being evaluated stop.
            for (const [win, entry] of [...this._tracked]) {
                if (!entry.applyId)
                    this._untrack(win);
            }
        }
    }

    // A new window may carry neither wm_class nor title yet, and mutter has
    // not placed it, so evaluate again whenever those change and once it is
    // shown. A frame requested through the window before 'shown' is pointless:
    // mutter's initial placement overrides it. The one earlier way in is the
    // initial configuration (see _preplace).
    _track(win) {
        const entry = {
            ids: [], actor: null, actorIds: [], waitsForFirstFrame: false,
            graceId: 0, graceEnd: 0, applyId: 0, shown: false, headStart: null,
        };
        const evaluate = () => this._evaluate(win);
        const shown = () => {
            entry.shown = true;
            evaluate();
        };
        entry.ids = [
            win.connect('notify::wm-class', evaluate),
            win.connect('notify::title', evaluate),
            win.connect('notify::window-type', evaluate),
            win.connect('shown', shown),
            win.connect('unmanaged', () => this._untrack(win)),
        ];
        // An X11 window is not hidden before mutter places it, and its first
        // map emits no 'shown'. Its actor draws the first frame only after
        // the placement. Mutter can destroy the actor before 'unmanaged'.
        if (win.get_client_type() === Meta.WindowClientType.X11) {
            entry.waitsForFirstFrame = true;
            entry.actor = win.get_compositor_private();
            entry.actorIds = [
                entry.actor.connect('first-frame', shown),
                entry.actor.connect('destroy', () => {
                    entry.actor = null;
                }),
            ];
        }
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
        if (entry.actor) {
            for (const id of entry.actorIds)
                entry.actor.disconnect(id);
        }
        removeSource(entry.graceId);
        removeSource(entry.applyId);
        this._tracked.delete(win);
    }

    // The first rule whose predicates hold for the window and whose min_width
    // the monitor it resolves against meets: its own `monitor`; else, for the
    // rule that took the head start, the monitor that head start resolved
    // against; else `fallbackMonitor`, the one the window is on or will be
    // shown on. So the monitor tested is the monitor the rule is placed on.
    _matchIndex(win, fallbackMonitor, headStart = null) {
        const resolvesAgainst = rule =>
            rule.monitor ?? (rule === headStart?.rule ? headStart.monitor : fallbackMonitor);
        const fits = rule => rule.minWidth === null ||
            fitsMonitor(rule.minWidth, this._monitorWidth(resolvesAgainst(rule)));
        return this._rules.findIndex(rule => rule.predicates.every(p => p(win)) && fits(rule));
    }

    _monitorExists(monitor) {
        return monitor >= 0 && monitor < global.display.get_n_monitors();
    }

    // The logical width of a monitor, or null when there is no such monitor.
    _monitorWidth(monitor) {
        if (!this._monitorExists(monitor))
            return null;
        const { width } = global.display.get_monitor_geometry(monitor);
        const scale = global.display.get_monitor_scale(monitor);
        return scale === 1 || this._stageIsLogical() ? width : Math.round(width / scale);
    }

    _stageIsLogical() {
        return STAGE_ALWAYS_LOGICAL || (Meta.is_wayland_compositor() &&
            this._mutterSettings.get_strv('experimental-features').includes('scale-monitor-framebuffer'));
    }

    isOverlay(win) {
        return this._overlays.has(win);
    }

    _winningIndex(win, headStart = null) {
        return win.get_window_type() === Meta.WindowType.NORMAL
            ? this._matchIndex(win, win.get_monitor(), headStart) : -1;
    }

    // Put the rule's frame into the window's initial configuration: mutter
    // then skips its own placement and asks the client for that size, so the
    // first frame is drawn in place instead of jumping there afterwards.
    //
    // Only a head start: the client may commit another size, its identity may
    // not have arrived, and `center` needs a size the window does not have
    // yet, so the rule is still applied in full once shown.
    _preplace(win, config) {
        // Wayland clients only: for an X11 window mutter reads the frame
        // back as the client's size hints, and one with server-side
        // decorations then comes out larger by its title bar.
        if (!config.get_is_initial() ||
            win.get_client_type() !== Meta.WindowClientType.WAYLAND ||
            win.get_window_type() !== Meta.WindowType.NORMAL ||
            win.is_fullscreen() || maximizeFlags(win) !== 0)
            return;
        // Without a monitor in the rule, the one mutter's own placement
        // would pick: a window with a parent goes over that parent, any
        // other window under the pointer. The window has no position to
        // derive one from yet.
        const predicted = win.get_transient_for()?.get_monitor() ??
            global.display.get_current_monitor();
        const index = this._matchIndex(win, predicted);
        if (index < 0)
            return;
        const rule = this._rules[index];
        if (!rule.geometry || rule.geometry.kind === 'center')
            return;
        const monitor = rule.monitor ?? predicted;
        if (!this._monitorExists(monitor))
            return;
        const target = this._resolve(rule.geometry, win, workareaOf(win, monitor));
        if (!target)
            return;
        config.set_position(target.x, target.y);
        config.set_size(target.width, target.height);
        this._tracked.get(win).headStart = { rule, monitor };
        console.debug(`[Window Control] ${ruleName(rule)} -> ${win.get_id()}: ${rule.geometry.kind} set before the first frame`);
    }

    _evaluate(win) {
        const entry = this._tracked.get(win);
        if (!entry || entry.applyId)
            return;
        // Tracked since creation, so "never seen unhidden and 'shown' not yet
        // fired" is exactly "mutter has not placed it yet".
        if (!entry.shown && (entry.waitsForFirstFrame || win.is_hidden()))
            return;
        entry.shown = true;
        // A shown window that is not NORMAL matches nothing, so it gets the
        // same grace period as an unmatched one: a retype to NORMAL within it
        // still gets the rule, and one after it cannot move the window.
        const index = this._winningIndex(win, entry.headStart);
        if (index >= 0) {
            const rule = this._rules[index];
            // A rule that took the head start resolves against the same
            // monitor again: literal coordinates can have put the frame on
            // another one, and its workarea would resize the window.
            // The head start cannot be taken back: when the title changes
            // before 'shown' and another rule, or none, wins, the window keeps
            // the first rule's frame unless the winner has a place or a tile.
            // A winning center keeps the size the first rule set.
            const headStartMonitor = entry.headStart?.rule === rule ? entry.headStart.monitor : null;
            // The match ends the grace period: a grace timer due in the same
            // main loop iteration would untrack the window before the apply
            // runs, and the rule would be lost.
            removeSource(entry.graceId);
            entry.graceId = 0;
            // Not from inside the 'shown' emission: mutter is still applying
            // the client's first committed size there, and a frame requested
            // that early is overwritten by it: the position sticks, the size
            // does not. One trip through the main loop is enough. The
            // 'unmanaged' handler stays connected until then, so a window
            // that closes first is never touched.
            removeSource(entry.applyId);
            entry.applyId = addIdle(() => {
                entry.applyId = 0;
                this._untrack(win);
                this._apply(win, rule, headStartMonitor);
            });
            return;
        }
        // The period runs from the first evaluation that matched nothing; a
        // later one re-arms the timer for what is left of it, so a window that
        // keeps changing its title is still given up on in time.
        const now = GLib.get_monotonic_time() / 1000;
        entry.graceEnd ||= now + LATE_IDENTITY_GRACE_MS;
        removeSource(entry.graceId);
        entry.graceId = addTimeout(Math.max(0, Math.ceil(entry.graceEnd - now)), () => {
            entry.graceId = 0;
            this._untrack(win);
        });
    }

    // `again` is an apply to a window placed before (applyRules). With it, a
    // rule workspace that does not exist is skipped: mutter would append one
    // at each apply. On a first apply, for an index past the last workspace,
    // mutter appends one workspace and moves the window there; it creates none
    // between, so the window does not land on the rule's index.
    _apply(win, rule, headStartMonitor, again = false) {
        const id = win.get_id();
        // A load between the match and this call has decided the open
        // windows already; a rule it dropped makes no overlay.
        if (rule.overlay && this._rules.includes(rule))
            this._overlays.add(win);
        if (rule.workspace !== null) {
            if (again && rule.workspace >= global.workspace_manager.get_n_workspaces())
                console.debug(`[Window Control] ${ruleName(rule)} -> ${id}: no such workspace, skipped`);
            else
                win.change_workspace_by_index(rule.workspace, true);
        }
        if (rule.monitor !== null) {
            if (rule.monitor >= global.display.get_n_monitors()) {
                console.debug(`[Window Control] ${ruleName(rule)} -> ${id}: no such monitor, skipped`);
                return;
            }
            moveToMonitor(win, this._placer, rule.monitor);
        }
        if (!rule.geometry) {
            console.debug(`[Window Control] ${ruleName(rule)} -> ${id}: applied`);
            return;
        }
        if (win.is_fullscreen()) {
            console.debug(`[Window Control] ${ruleName(rule)} -> ${id}: fullscreen, geometry skipped`);
            return;
        }
        // A maximized window is restored first (see WindowPlacer); the frame
        // resolves once that has landed, against the window as it is then.
        this._placer.place(win, () => this._placeFrame(win, rule, headStartMonitor),
            rule.monitor ?? headStartMonitor ?? win.get_monitor());
    }

    _placeFrame(win, rule, headStartMonitor) {
        const id = win.get_id();
        const workarea = workareaOf(win, rule.monitor ?? headStartMonitor ?? win.get_monitor());
        const target = this._resolve(rule.geometry, win, workarea);
        if (!target) {
            console.debug(`[Window Control] ${ruleName(rule)} -> ${id}: resolves to nothing on this workarea, skipped`);
            return;
        }
        this._placer.moveResizeFrame(win, target);
        console.debug(`[Window Control] ${ruleName(rule)} -> ${id}: ${rule.geometry.kind} applied`);
    }

    _resolve(geometry, win, workarea) {
        switch (geometry.kind) {
        case 'place':
            return resolvePlaceRect(geometry.tokens, workarea);
        case 'tile':
            return tileRect(geometry.position, workarea);
        case 'center':
            return centerRect(geometry.axis, win.get_frame_rect(), workarea);
        }
    }
}
