// SPDX-FileCopyrightText: 2026 hko9890
// SPDX-License-Identifier: MIT
// Window rules: put a new window on a well-defined spot the moment mutter
// shows it, driven by ~/.config/gnome-window-control/rules.json.
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
// workspace: index, created if needed.
// monitor:   index; the workarea place/tile/center resolve against.
//
// The first matching rule wins, in file order, and is applied exactly once per
// window. A window that resizes itself later is left alone. The file is
// re-read on every change.

import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Meta from 'gi://Meta';
import { matchPredicate, maximizeFlags, unmaximizeWindow } from './window-helpers.js';

const CONFIG_DIR = GLib.build_filenamev([GLib.get_user_config_dir(), 'gnome-window-control']);
const RULES_FILE = 'rules.json';

// rules.json key -> matchPredicate() kind.
const MATCH_KINDS = { class: 'class', title: 'title', substr: 'substring' };

// The same arithmetic as cli/src/geometry.rs, integer and truncating, so a
// rule lands on the pixels `wctl place` and `wctl tile` would produce.

// A tile position as (startCol, endCol, startRow, endRow) of the 4x2 grid.
const TILE_CELLS = {
    'top-left': [0, 0, 0, 0],
    'top-center': [1, 2, 0, 0],
    'top-right': [3, 3, 0, 0],
    'left': [0, 0, 0, 1],
    'center': [1, 2, 0, 1],
    'right': [3, 3, 0, 1],
    'bottom-left': [0, 0, 1, 1],
    'bottom-center': [1, 2, 1, 1],
    'bottom-right': [3, 3, 1, 1],
};

const CENTER_AXES = ['horizontal', 'vertical', 'both'];

// A Wayland client's app_id and first real title can land after the window is
// shown, so a shown window that matched nothing yet stays under evaluation this
// long before it is given up on. Without the bound, a title change hours later
// would re-place a window the user has long since arranged.
const LATE_IDENTITY_GRACE_MS = 2000;

// Collapse the burst of file events one save produces into a single reload.
const RELOAD_DEBOUNCE_MS = 100;

// How long to wait for an unmaximize to land before placing the frame anyway.
// A client whose restored size equals its maximized one never reports a
// size change, so the wait has to be bounded.
const UNMAXIMIZE_SETTLE_MS = 1000;

// WIDTH/HEIGHT: positive pixels, or a percentage of the workarea that does not
// floor to zero. Null when the token is neither.
export function resolvePlaceSize(token, baseSize) {
    if (/^[1-9][0-9]*$/.test(token))
        return Number(token);
    const percent = /^([0-9]+)%$/.exec(token);
    if (percent) {
        const value = Math.trunc(baseSize * Number(percent[1]) / 100);
        return value > 0 ? value : null;
    }
    return null;
}

// X/Y: pixels, or one of the three alignment keywords of the axis resolved
// against the workarea and the window's own size. Null for anything else.
export function resolvePlacePosition(token, keywords, workareaPos, workareaSize, windowSize) {
    if (/^-?[0-9]+$/.test(token))
        return Number(token);
    const [start, center, end] = keywords;
    switch (token) {
    case start:
        return workareaPos;
    case center:
        return workareaPos + Math.trunc((workareaSize - windowSize) / 2);
    case end:
        return workareaPos + workareaSize - windowSize;
    default:
        return null;
    }
}

// The four `place` tokens against a workarea, sizes first so the alignment
// keywords can use them. Null when any token is invalid.
export function resolvePlaceRect(tokens, workarea) {
    const [x, y, w, h] = tokens.map(String);
    const width = resolvePlaceSize(w, workarea.width);
    const height = resolvePlaceSize(h, workarea.height);
    if (width === null || height === null)
        return null;
    const left = resolvePlacePosition(x, ['left', 'center', 'right'], workarea.x, workarea.width, width);
    const top = resolvePlacePosition(y, ['top', 'center', 'bottom'], workarea.y, workarea.height, height);
    if (left === null || top === null)
        return null;
    return { x: left, y: top, width, height };
}

// A tile position in pixels. Cells floor, so a workarea width not divisible
// by four leaves a remainder at the right edge. Null for an unknown position.
export function tileRect(position, workarea) {
    const cells = TILE_CELLS[position];
    if (!cells)
        return null;
    const [startCol, endCol, startRow, endRow] = cells;
    const cellW = Math.trunc(workarea.width / 4);
    const cellH = Math.trunc(workarea.height / 2);
    return {
        x: workarea.x + cellW * startCol,
        y: workarea.y + cellH * startRow,
        width: cellW * (endCol - startCol + 1),
        height: cellH * (endRow - startRow + 1),
    };
}

// The frame moved to the middle of the workarea on the given axes.
export function centerRect(axis, frame, workarea) {
    const horizontal = axis === 'horizontal' || axis === 'both';
    const vertical = axis === 'vertical' || axis === 'both';
    return {
        x: horizontal ? workarea.x + Math.trunc((workarea.width - frame.width) / 2) : frame.x,
        y: vertical ? workarea.y + Math.trunc((workarea.height - frame.height) / 2) : frame.y,
        width: frame.width,
        height: frame.height,
    };
}

// Validation of one parsed rule. Messages name the key, never its value: the
// file is the user's own, but the journal outlives it and CODING.md forbids
// window titles and classes in a log line wherever they come from.
const RULE_KEYS = ['match', 'place', 'tile', 'center', 'workspace', 'monitor'];
const PROBE_WORKAREA = { x: 0, y: 0, width: 1000, height: 1000 };

function isPlainObject(value) {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function compileIndex(rule, key, label) {
    if (!(key in rule))
        return null;
    const value = rule[key];
    if (!Number.isInteger(value) || value < 0)
        throw new Error(`${label}.${key}: must be a non-negative integer`);
    return value;
}

// Turn one rule into predicates and an action, or throw with a message that
// names the offending key.
export function compileRule(rule, index) {
    const label = `rules[${index}]`;
    if (!isPlainObject(rule))
        throw new Error(`${label}: must be an object`);
    for (const key of Object.keys(rule)) {
        if (!RULE_KEYS.includes(key))
            throw new Error(`${label}.${key}: unknown key (use ${RULE_KEYS.join(', ')})`);
    }

    if (!isPlainObject(rule.match))
        throw new Error(`${label}.match: must be an object`);
    const predicates = [];
    for (const [key, value] of Object.entries(rule.match)) {
        const kind = MATCH_KINDS[key];
        if (!kind)
            throw new Error(`${label}.match.${key}: unknown key (use class, title, substr)`);
        if (typeof value !== 'string')
            throw new Error(`${label}.match.${key}: must be a string`);
        const predicate = matchPredicate(kind, value);
        if (!predicate)
            throw new Error(`${label}.match.${key}: must not be empty`);
        predicates.push(predicate);
    }
    if (predicates.length === 0)
        throw new Error(`${label}.match: must name at least one of class, title, substr`);

    const actions = ['place', 'tile', 'center'].filter(key => key in rule);
    if (actions.length > 1)
        throw new Error(`${label}: place, tile and center are mutually exclusive`);
    let geometry = null;
    if ('place' in rule) {
        const tokens = rule.place;
        if (!Array.isArray(tokens) || tokens.length !== 4)
            throw new Error(`${label}.place: must be [X, Y, WIDTH, HEIGHT]`);
        if (!resolvePlaceRect(tokens, PROBE_WORKAREA)) {
            throw new Error(`${label}.place: X is a number or left|center|right, ` +
                'Y a number or top|center|bottom, WIDTH and HEIGHT a positive number or a percentage');
        }
        geometry = { kind: 'place', tokens };
    } else if ('tile' in rule) {
        if (!(rule.tile in TILE_CELLS))
            throw new Error(`${label}.tile: must be one of ${Object.keys(TILE_CELLS).join(', ')}`);
        geometry = { kind: 'tile', position: rule.tile };
    } else if ('center' in rule) {
        if (!CENTER_AXES.includes(rule.center))
            throw new Error(`${label}.center: must be one of ${CENTER_AXES.join(', ')}`);
        geometry = { kind: 'center', axis: rule.center };
    }

    const workspace = compileIndex(rule, 'workspace', label);
    const monitor = compileIndex(rule, 'monitor', label);
    if (!geometry && workspace === null && monitor === null)
        throw new Error(`${label}: has nothing to do (add place, tile, center, workspace or monitor)`);

    return { predicates, geometry, workspace, monitor };
}

// Parse and validate the whole file. Throws on the first problem: a file with
// one bad rule loads no rules at all, so a typo cannot silently drop one rule
// while the rest keep working.
export function compileRules(text) {
    const parsed = JSON.parse(text);
    if (!Array.isArray(parsed))
        throw new Error('the top-level value must be an array of rules');
    return parsed.map(compileRule);
}

export class WindowRules {
    constructor() {
        this._rules = [];
        this._windowCreatedId = 0;
        this._tracked = new Map();        // Meta.Window -> {ids, graceId}
        this._fileMonitor = null;
        this._fileMonitorId = 0;
        this._reloadId = 0;
    }

    // Never throws: window rules are secondary to the D-Bus service, so a
    // config-dir or monitor failure logs and leaves the extension running with
    // no rules rather than failing enable() and leaving the service exported
    // but the extension marked broken.
    enable() {
        try {
            const dir = Gio.File.new_for_path(CONFIG_DIR);
            try {
                dir.make_directory_with_parents(null);
            } catch (e) {
                if (!e.matches(Gio.IOErrorEnum, Gio.IOErrorEnum.EXISTS))
                    throw e;
            }
            this._load();
            // The directory rather than the file: a file monitor misses an editor
            // that saves by writing a new file and renaming it over the old one.
            this._fileMonitor = dir.monitor_directory(Gio.FileMonitorFlags.NONE, null);
            this._fileMonitorId = this._fileMonitor.connect('changed', (monitor, file) => {
                if (file.get_basename() === RULES_FILE)
                    this._scheduleReload();
            });
        } catch (e) {
            console.error(`[Window Control] window rules disabled: ${e.message}`);
        }
    }

    disable() {
        if (this._reloadId) {
            GLib.source_remove(this._reloadId);
            this._reloadId = 0;
        }
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

    _load() {
        const file = Gio.File.new_for_path(GLib.build_filenamev([CONFIG_DIR, RULES_FILE]));
        let text;
        try {
            const [, bytes] = file.load_contents(null);
            text = new TextDecoder().decode(bytes);
        } catch (e) {
            if (e.matches(Gio.IOErrorEnum, Gio.IOErrorEnum.NOT_FOUND)) {
                this._rules = [];
                this._syncWatch();
                console.log(`[Window Control] no ${RULES_FILE}; window rules off`);
                return;
            }
            console.error(`[Window Control] ${RULES_FILE}: cannot read: ${e.message}`);
            return;
        }
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
    // shown. Placing before 'shown' is pointless: mutter's initial placement
    // overrides any geometry requested until then.
    _track(win) {
        const entry = { ids: [], graceId: 0, applyId: 0, shown: false };
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
        this._tracked.delete(win);
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
        const index = this._rules.findIndex(rule => rule.predicates.every(p => p(win)));
        if (index >= 0) {
            // Not from inside the 'shown' emission: mutter is still applying
            // the client's first committed size there, and a frame requested
            // that early is overwritten by it (measured on GNOME 46: the
            // position stuck, the size did not). One trip through the main
            // loop is enough. The 'unmanaged' handler stays connected until
            // then, so a window that closes first is never touched.
            entry.applyId = GLib.idle_add(GLib.PRIORITY_DEFAULT, () => {
                entry.applyId = 0;
                this._untrack(win);
                this._apply(win, this._rules[index], index);
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

    _apply(win, rule, index) {
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
                this._placeFrame(win, rule, index);
                return;
            }
            // A client that restores itself maximized, or one mutter
            // auto-maximized for filling the screen, would have the request
            // dropped outright (see _frameRefusal in extension.js). The rule
            // asked for a rectangle, so the rectangle wins -- but not in the
            // same breath: a frame requested while the unmaximize is still in
            // flight is overwritten by the restored size (measured on GNOME
            // 46). Place once the restore has landed.
            this._afterUnmaximize(win, () => this._placeFrame(win, rule, index));
        } catch (e) {
            console.error(`[Window Control] rules[${index}] -> ${id}: ${e.message}`);
        }
    }

    // Unmaximize, then run `then` after the next 'size-changed' or after
    // UNMAXIMIZE_SETTLE_MS, whichever comes first. The window stays tracked
    // until then so 'unmanaged' and disable() can still cancel it.
    //
    // 'size-changed' is emitted from inside mutter's own move-resize, so the
    // frame is requested from an idle callback rather than from the handler:
    // a request made re-entrantly is overwritten when the outer call
    // continues (measured on GNOME 46).
    _afterUnmaximize(win, then) {
        const entry = { ids: [], graceId: 0, applyId: 0, shown: true };
        const done = () => {
            if (entry.applyId)
                return;
            if (entry.graceId) {
                GLib.source_remove(entry.graceId);
                entry.graceId = 0;
            }
            entry.applyId = GLib.idle_add(GLib.PRIORITY_DEFAULT, () => {
                entry.applyId = 0;
                this._untrack(win);
                then();
                return GLib.SOURCE_REMOVE;
            });
        };
        entry.ids = [
            win.connect('size-changed', done),
            win.connect('unmanaged', () => this._untrack(win)),
        ];
        entry.graceId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, UNMAXIMIZE_SETTLE_MS, () => {
            entry.graceId = 0;
            done();
            return GLib.SOURCE_REMOVE;
        });
        this._tracked.set(win, entry);
        unmaximizeWindow(win);
    }

    _placeFrame(win, rule, index) {
        const id = win.get_id();
        try {
            const workspace = win.get_workspace() || global.workspace_manager.get_active_workspace();
            const monitor = rule.monitor !== null ? rule.monitor : win.get_monitor();
            const workarea = workspace.get_work_area_for_monitor(monitor);
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
