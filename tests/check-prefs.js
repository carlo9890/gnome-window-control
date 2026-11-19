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
const { SHORTCUT_GROUPS, needsModifier } = await import(GLib.filename_to_uri(`${PREFS}/shortcut-list.js`, null));
const { checkRules, dropInNames, elementOffsets, ruleSummary } = await import(GLib.filename_to_uri(`${PREFS}/rules-check.js`, null));

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

// -- the drop-in list: which names, in which order, and each file's summary --

{
    const names = dropInNames(['b.json', '.b.json.tmp', 'a.json~', '10-a.json', 'B.json', 'a.json.off',
        '9-b.json', 'a-b.json', 'a.json', 'notes.txt']);
    check('dropInNames keeps the drop-in names in byte order',
        JSON.stringify(names) === JSON.stringify(['10-a.json', '9-b.json', 'B.json', 'a-b.json', 'a.json', 'b.json']),
        JSON.stringify(names));
    check('a valid drop-in counts its rules',
        ruleSummary('[{"match":{"class":"a"},"tile":"left"},{"match":{"class":"b"},"tile":"right"}]') === '2 rules');
    check('a drop-in with one rule says rule', ruleSummary('[{"match":{"class":"a"},"tile":"left"}]') === '1 rule');
    check('an empty array has 0 rules', ruleSummary('[]') === '0 rules');
    const invalid = ruleSummary('[{"match":{"class":"a"},"tile":"middle"}]');
    check('an invalid drop-in shows the grammar message', invalid.startsWith('rules[0].tile: must be one of'), invalid);
    const empty = ruleSummary('');
    check('an empty file shows the parse error', empty === checkRules('').message && empty !== '', empty);
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

// -- the capture refuses a key without a modifier other than Shift ------------

{
    // The Gdk.ModifierType bits: SHIFT 1, CONTROL 4, ALT (MOD1) 8, SUPER 1 << 26,
    // HYPER 1 << 27, META 1 << 28.
    const SHIFT = 1, CONTROL = 4, ALT = 8, SUPER = 1 << 26, HYPER = 1 << 27, META = 1 << 28;
    check('a plain key needs a modifier', needsModifier(0, SHIFT));
    check('Shift alone is not enough', needsModifier(SHIFT, SHIFT));
    check('any modifier other than Shift is enough', [SUPER, CONTROL, ALT, HYPER, META, CONTROL | SHIFT]
        .every(mods => !needsModifier(mods, SHIFT)));
}

report();
