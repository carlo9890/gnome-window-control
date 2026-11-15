#!/usr/bin/env -S gjs -m
// SPDX-FileCopyrightText: 2026 hko9890
// SPDX-License-Identifier: MIT
//
// Check the parts of the preferences window that import no GTK: the shortcut
// list against the schema, and the rules editor's validation. Run from
// anywhere, without a display or a GNOME session:
//
//     env -u GI_TYPELIB_PATH gjs -m tests/check-prefs.js
//
// Exits 0 when every check passes, 1 when any fails.

import GLib from 'gi://GLib';

import { ROOT, check, report } from './check-helper.js';

const PREFS = `${ROOT}/window-control@carlo9890.github.io/prefs`;
const { SHORTCUT_GROUPS } = await import(GLib.filename_to_uri(`${PREFS}/shortcut-list.js`, null));
const { checkRules, elementOffsets } = await import(GLib.filename_to_uri(`${PREFS}/rules-check.js`, null));

// -- the shortcut list holds every shortcut key of the schema, once ----------

{
    const [, bytes] = GLib.file_get_contents(
        `${ROOT}/window-control@carlo9890.github.io/schemas/org.gnome.shell.extensions.window-control.gschema.xml`);
    const xml = new TextDecoder().decode(bytes);
    const schemaKeys = [...xml.matchAll(/<key name="([^"]+)" type="as">/g)].map(m => m[1]).sort();
    const listed = SHORTCUT_GROUPS.flatMap(group => group.keys.map(([key]) => key));
    check('the schema has shortcut keys', schemaKeys.length > 0);
    check('the prefs list each shortcut key once', new Set(listed).size === listed.length, listed.join(', '));
    check('the prefs list exactly the schema shortcut keys',
        JSON.stringify([...listed].sort()) === JSON.stringify(schemaKeys),
        `prefs: ${[...listed].sort()}\n    schema: ${schemaKeys}`);
    check('every shortcut row has a title', listed.length === new Set(SHORTCUT_GROUPS.flatMap(group =>
        group.keys.filter(([, title]) => title).map(([key]) => key))).size);
}

// -- the rules editor's validation -------------------------------------------

{
    const valid = checkRules('[{"match":{"class":"kitty"},"tile":"left"},{"match":{"title":"a"},"center":"both"}]');
    check('a valid file counts its rules', valid.ok && valid.count === 2, JSON.stringify(valid));
    check('an empty array is valid', checkRules('[]').ok && checkRules('[]').count === 0);

    const syntax = checkRules('[\n  { "match": { "class": "kitty" } "tile": "left" }\n]');
    check('a JSON syntax error is not ok', !syntax.ok);
    check('a JSON syntax error names its line', syntax.line === 2, JSON.stringify(syntax));

    const rule = checkRules('[\n  { "match": { "class": "a" }, "tile": "left" },\n\n  { "match": { "class": "b" }, "tile": "middle" }\n]');
    check('a rule error carries the grammar message',
        !rule.ok && rule.message.startsWith('rules[1].tile: must be one of'), JSON.stringify(rule));
    check('a rule error names the line its rule starts on', rule.line === 4, JSON.stringify(rule));

    const top = checkRules('{"match": {}}');
    check('an error with no place in the text has no line',
        !top.ok && top.line === null && top.message === 'the top-level value must be an array of rules',
        JSON.stringify(top));
}

// -- elementOffsets skips brackets and commas inside strings and nesting ------

{
    const text = '[ {"t": "a,]\\"[{"}, [1, 2], "x,y" ,3]';
    const offsets = elementOffsets(text);
    const starts = offsets.map(offset => text[offset]);
    check('elementOffsets finds each top-level element', offsets.length === 4, JSON.stringify(offsets));
    check('elementOffsets points at each element start',
        JSON.stringify(starts) === JSON.stringify(['{', '[', '"', '3']), JSON.stringify(starts));
    check('an empty array has no element', elementOffsets('[ ]').length === 0);
}

report();
