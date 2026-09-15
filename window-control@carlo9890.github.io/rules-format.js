// SPDX-FileCopyrightText: 2026 hko9890
// SPDX-License-Identifier: MIT
// The rules.json grammar: the token vocabulary, the tile grid, the match
// predicate, and the validation that turns a parsed document into rules.
//
// Normative definition: docs/specs/RULES-JSON.md. `wctl rules check` carries a
// second implementation of the same grammar in cli/src/rules.rs; the two are
// pinned to one another by tests/vectors/rules-spec.json.
//
// This module imports NOTHING. No gi://, so plain `gjs` loads it without the
// mutter typelib and CI can run tests/check-rules-format.js on a bare runner.
// Keep it that way: the window-touching half lives in rules.js, the Meta
// maximize API in window-helpers.js.

// rules.json match key -> matchPredicate() kind.
export const MATCH_KINDS = { class: 'class', title: 'title', substr: 'substring' };

// A tile position as (startCol, endCol, startRow, endRow) of the 4x2 grid.
export const TILE_CELLS = {
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

export const CENTER_AXES = ['horizontal', 'vertical', 'both'];

export const RULE_KEYS = ['match', 'place', 'tile', 'center', 'workspace', 'monitor'];

// `place` tokens are resolved against this at load time, so a grammar error is
// reported when the file is read rather than when a window first appears.
export const PROBE_WORKAREA = { x: 0, y: 0, width: 1000, height: 1000 };

// Build the match predicate for a (kind, value) selector. One implementation
// for WaitForWindow, the ActivateBy* methods and rules.json, so the three
// cannot disagree about which window a value names. Returns null for an
// unknown kind, an empty substring (which would match every window) or a pid
// that is not a positive decimal integer: get_pid() is 0 for a window whose
// client pid is unknown, so 0 must never be matchable.
//
// The window is duck-typed through its getters, which is what keeps this file
// free of gi://Meta.
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

// The same arithmetic as cli/src/geometry.rs, integer and truncating, so a
// rule lands on the pixels `wctl place` and `wctl tile` would produce.

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
    // hasOwn, not `TILE_CELLS[position]`: a plain object literal inherits from
    // Object.prototype, so "toString" and "constructor" are truthy lookups that
    // would reach the destructuring below as a function and throw.
    if (!Object.hasOwn(TILE_CELLS, position))
        return null;
    const cells = TILE_CELLS[position];
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
        // hasOwn for the same reason as TILE_CELLS below: MATCH_KINDS["constructor"]
        // is a truthy inherited lookup, and the function it returns would reach
        // matchPredicate as a kind and push a null predicate into the rule.
        if (!Object.hasOwn(MATCH_KINDS, key))
            throw new Error(`${label}.match.${key}: unknown key (use class, title, substr)`);
        const kind = MATCH_KINDS[key];
        if (typeof value !== 'string')
            throw new Error(`${label}.match.${key}: must be a string`);
        // Checked here rather than left to matchPredicate, which only refuses an
        // empty SUBSTRING. An empty class or title builds a predicate that is
        // true only for a window with no class or no title at all -- never what
        // the user meant, and a rule that silently never fires is worse than a
        // message. The spec's validation table says every match value is
        // non-empty; this is what makes that true.
        if (value === '')
            throw new Error(`${label}.match.${key}: must not be empty`);
        predicates.push(matchPredicate(kind, value));
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
        if (!Object.hasOwn(TILE_CELLS, rule.tile))
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
