#!/usr/bin/env -S gjs -m
// SPDX-FileCopyrightText: 2026 hko9890
// SPDX-License-Identifier: MIT
//
// Assert the extension's rules.json grammar against tests/vectors/rules-spec.json,
// the same vectors cli/src/rules.rs is pinned to. Run from the repository root:
//
//     gjs -m tests/check-rules-format.js
//
// It loads rules-format.js, which imports nothing, so no mutter typelib and no
// GNOME session are needed -- that is what lets CI run it on a bare runner.
// Verify that property stays true with:
//
//     env -u GI_TYPELIB_PATH gjs -m tests/check-rules-format.js
//
// Exits 0 when every vector passes, 1 on the first failure count above zero.

import GLib from 'gi://GLib';

const ROOT = GLib.path_get_dirname(GLib.path_get_dirname(
    GLib.canonicalize_filename(import.meta.url.replace('file://', ''), null)));

const format = await import(`file://${ROOT}/window-control@carlo9890.github.io/rules-format.js`);
const { compileRules, resolvePlaceRect, tileRect, centerRect, matchPredicate, TILE_CELLS } = format;

const [, bytes] = GLib.file_get_contents(`${ROOT}/tests/vectors/rules-spec.json`);
const VECTORS = JSON.parse(new TextDecoder().decode(bytes));

let passed = 0;
const failures = [];

function check(name, condition, detail) {
    if (condition) {
        passed += 1;
        return;
    }
    failures.push(detail ? `${name}\n    ${detail}` : name);
}

function equalRect(actual, expected) {
    return actual !== null && actual !== undefined &&
        actual.x === expected.x && actual.y === expected.y &&
        actual.width === expected.width && actual.height === expected.height;
}

function showRect(rect) {
    if (rect === null || rect === undefined)
        return 'null';
    return `${rect.x},${rect.y} ${rect.width}x${rect.height}`;
}

// -- validation ------------------------------------------------------------
//
// The vectors carry a parsed document, so this stringifies it back: compileRules
// takes file text, which is what the extension actually calls it with.

for (const vector of VECTORS.validation) {
    const name = `validation: ${vector.name}`;
    let error = null;
    try {
        compileRules(JSON.stringify(vector.document));
    } catch (e) {
        error = e;
    }

    if (vector.valid) {
        check(name, error === null, error && `expected it to be accepted, got: ${error.message}`);
        continue;
    }
    if (error === null) {
        check(name, false, `expected it to be refused with: ${vector.message}`);
        continue;
    }
    check(name, error.message === vector.message,
        `expected: ${vector.message}\n    actual:   ${error.message}`);
}

// A valid document must compile to one rule per entry, in file order. Without
// this, compileRules could return nothing at all and every "valid" case above
// would still pass.
for (const vector of VECTORS.validation.filter(v => v.valid)) {
    let rules = null;
    try {
        rules = compileRules(JSON.stringify(vector.document));
    } catch (e) {
        check(`validation: ${vector.name} (rule count)`, false, `threw: ${e.message}`);
        continue;
    }
    check(`validation: ${vector.name} (rule count)`,
        rules.length === vector.document.length,
        `expected ${vector.document.length} rule(s), got ${rules.length}`);
}

// -- geometry: place -------------------------------------------------------

for (const vector of VECTORS.geometry.place) {
    const actual = resolvePlaceRect(vector.tokens, vector.workarea);
    check(`place: ${vector.name}`, equalRect(actual, vector.rect),
        `expected: ${showRect(vector.rect)}\n    actual:   ${showRect(actual)}`);
}

for (const vector of VECTORS.geometry.place_invalid) {
    const actual = resolvePlaceRect(vector.tokens, vector.workarea);
    check(`place invalid: ${vector.name}`, actual === null,
        `expected null, got ${showRect(actual)}`);
}

// -- geometry: tile --------------------------------------------------------

for (const group of VECTORS.geometry.tile) {
    for (const [position, expected] of Object.entries(group.cells)) {
        const actual = tileRect(position, group.workarea);
        check(`tile: ${position} on ${showRect(group.workarea)}`, equalRect(actual, expected),
            `expected: ${showRect(expected)}\n    actual:   ${showRect(actual)}`);
    }
}

check('tile: an unknown position resolves to nothing',
    tileRect('nowhere', { x: 0, y: 0, width: 1000, height: 1000 }) === null);

// The first vector group pins every cell, so a position added to the grid
// without a vector is caught here rather than going untested.
const pinned = Object.keys(VECTORS.geometry.tile[0].cells);
for (const position of Object.keys(TILE_CELLS)) {
    check(`tile: ${position} has a pinned rectangle`, pinned.includes(position),
        'add it to the first tile group in tests/vectors/rules-spec.json');
}

// -- geometry: center ------------------------------------------------------

for (const vector of VECTORS.geometry.center) {
    const actual = centerRect(vector.axis, vector.frame, vector.workarea);
    check(`center: ${vector.name}`, equalRect(actual, vector.rect),
        `expected: ${showRect(vector.rect)}\n    actual:   ${showRect(actual)}`);
}

// -- match predicate -------------------------------------------------------

function fakeWindow(spec) {
    return {
        get_wm_class: () => spec.wm_class,
        get_title: () => spec.title,
        get_pid: () => spec.pid,
    };
}

for (const vector of VECTORS.match.cases) {
    const predicate = matchPredicate(vector.kind, vector.value);
    if (!predicate) {
        check(`match: ${vector.name}`, false, 'expected a predicate, got null');
        continue;
    }
    const actual = predicate(fakeWindow(vector.window));
    check(`match: ${vector.name}`, actual === vector.matches,
        `expected ${vector.matches}, got ${actual}`);
}

for (const vector of VECTORS.match.no_predicate) {
    check(`match rejected: ${vector.name}`,
        matchPredicate(vector.kind, vector.value) === null,
        'expected null, got a predicate');
}

// -- report ----------------------------------------------------------------

if (failures.length > 0) {
    print(`FAIL  ${failures.length} of ${passed + failures.length} checks failed\n`);
    for (const failure of failures)
        print(`  - ${failure}`);
    print('');
    imports.system.exit(1);
}

print(`PASS  ${passed} checks`);
