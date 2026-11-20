#!/usr/bin/env -S gjs -m
// SPDX-FileCopyrightText: 2026 hko9890
// SPDX-License-Identifier: MIT
//
// Check the parts of the preferences window that import no GTK: the shortcut
// list against the schema, the rules editor's validation and its file
// access. Run from
// anywhere, without a display or a GNOME session:
//
//     env -u GI_TYPELIB_PATH gjs -m tests/check-prefs.js
//
// Exits 0 when every check passes, 1 when any fails.

import Gio from 'gi://Gio';
import GLib from 'gi://GLib';

import { ROOT, check, report } from './check-helper.js';

const PREFS = `${ROOT}/window-control@carlo9890.github.io/prefs`;
const { SHORTCUT_GROUPS, needsModifier } = await import(GLib.filename_to_uri(`${PREFS}/shortcut-list.js`, null));
const { checkRules, elementOffsets, ruleSummary } = await import(GLib.filename_to_uri(`${PREFS}/rules-check.js`, null));
const { dropInNames } = await import(GLib.filename_to_uri(`${PREFS}/../rules-format.js`, null));
const { readText, writeText } = await import(GLib.filename_to_uri(`${PREFS}/rules-disk.js`, null));
const { regularFileNames } = await import(GLib.filename_to_uri(`${PREFS}/../rules-files.js`, null));

const SCRATCH = GLib.dir_make_tmp('wctl-check-prefs-XXXXXX');

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

// -- the folder listing skips a name Gio cannot hand out ----------------------

{
    // Not UTF-8, so get_name() throws for it.
    GLib.spawn_sync(null, ['sh', '-c', ': > "$0/$(printf \'bad\\377.json\')"', SCRATCH], null,
        GLib.SpawnFlags.SEARCH_PATH, null);
    GLib.file_set_contents(`${SCRATCH}/a.json`, '[]');
    GLib.mkdir_with_parents(`${SCRATCH}/folder.json`, 0o755);
    const infos = [...Gio.File.new_for_path(SCRATCH).enumerate_children('standard::name,standard::type',
        Gio.FileQueryInfoFlags.NONE, null)];
    const names = regularFileNames(infos);
    check('the listing holds all three entries', infos.length === 3, `${infos.length}`);
    check('regularFileNames skips a folder and a name that is not UTF-8',
        JSON.stringify(names) === '["a.json"]', JSON.stringify(names));
}

// -- the editor reads rules.json only when it is a regular file ---------------

{
    const file = Gio.File.new_for_path(`${SCRATCH}/rules.json`);
    check('no rules.json reads as null', readText(file) === null);
    GLib.file_set_contents(file.get_path(), '[]');
    check('a rules.json reads as its text', readText(file) === '[]');
    GLib.unlink(file.get_path());

    // Without the type check this read never returns: nothing writes to the FIFO.
    GLib.spawn_command_line_sync(`mkfifo ${GLib.shell_quote(file.get_path())}`);
    let refusal = null;
    try {
        readText(file);
    } catch (e) {
        refusal = e;
    }
    check('a FIFO rules.json is refused before it is opened',
        refusal?.matches(Gio.IOErrorEnum, Gio.IOErrorEnum.NOT_REGULAR_FILE) === true, `${refusal}`);
    GLib.unlink(file.get_path());
}

// -- a save through a symlink keeps the link, and fails before it writes ------

{
    const config = `${SCRATCH}/config`;
    const target = `${SCRATCH}/dotfiles/rules.json`;
    GLib.mkdir_with_parents(config, 0o755);
    GLib.mkdir_with_parents(`${SCRATCH}/dotfiles`, 0o755);
    GLib.file_set_contents(target, 'old');
    const file = Gio.File.new_for_path(`${config}/rules.json`);
    file.make_symbolic_link('../dotfiles/rules.json', null);
    const read = path => new TextDecoder().decode(GLib.file_get_contents(path)[1]);
    const isLink = () => file.query_info('standard::is-symlink',
        Gio.FileQueryInfoFlags.NOFOLLOW_SYMLINKS, null).get_is_symlink();

    writeText(file, 'new');
    check('a save through a symlink writes the target', read(target) === 'new', read(target));
    check('a save through a symlink leaves a symlink', isLink());
    const entries = [...Gio.File.new_for_path(config).enumerate_children('standard::name',
        Gio.FileQueryInfoFlags.NONE, null)].map(info => info.get_name());
    check('a save leaves no temporary link behind', JSON.stringify(entries) === '["rules.json"]',
        JSON.stringify(entries));

    // The folder takes no new entry, so the new link cannot be made. The
    // target is still writable: a save that reports a failure must not
    // have changed it.
    GLib.chmod(config, 0o555);
    let failure = null;
    try {
        writeText(file, 'lost');
    } catch (e) {
        failure = e;
    }
    GLib.chmod(config, 0o755);
    check('a save fails when the folder takes no new link', failure !== null);
    check('a failed save leaves the target as it was', read(target) === 'new', read(target));

    const plain = Gio.File.new_for_path(`${config}/plain.json`);
    writeText(plain, 'text');
    check('a save of a regular file writes it', read(plain.get_path()) === 'text');
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

GLib.spawn_command_line_sync(`rm -rf ${GLib.shell_quote(SCRATCH)}`);
report();
