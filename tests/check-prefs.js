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

// The criticals GLib logs, so a check can assert that a call logs none.
const criticals = [];
GLib.log_set_writer_func((level, fields) => {
    const message = new TextDecoder().decode(fields.MESSAGE);
    if (level === GLib.LogLevelFlags.LEVEL_CRITICAL)
        criticals.push(message);
    printerr(message);
    return GLib.LogWriterOutput.HANDLED;
});

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
    const folder = `${SCRATCH}/read`;
    GLib.mkdir_with_parents(folder, 0o755);
    const file = Gio.File.new_for_path(`${folder}/rules.json`);
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

    // The open of a FIFO for a write does not return either, directly or
    // through a link, and the refused save must leave no temporary link.
    const link = Gio.File.new_for_path(`${folder}/link.json`);
    link.make_symbolic_link('rules.json', null);
    const refusals = [file, link].map(target => {
        try {
            writeText(target, '[]');
            return null;
        } catch (e) {
            return e;
        }
    });
    check('a save to a FIFO is refused before it is opened, behind a link too',
        refusals.every(e => e?.matches(Gio.IOErrorEnum, Gio.IOErrorEnum.NOT_REGULAR_FILE) === true),
        `${refusals}`);
    const left = [...Gio.File.new_for_path(folder).enumerate_children('standard::name',
        Gio.FileQueryInfoFlags.NONE, null)].map(info => info.get_name()).filter(name => name.startsWith('.'));
    check('a refused save leaves no temporary link', left.length === 0, JSON.stringify(left));
    GLib.unlink(file.get_path());

    // The link has no target now: that is no file, as for wctl.
    check('a link without a target reads as null', readText(link) === null);
    GLib.unlink(link.get_path());

    // A link that cannot be followed is not "no file": the target can exist.
    link.make_symbolic_link('link.json', null);
    let loop = null;
    try {
        readText(link);
    } catch (e) {
        loop = e;
    }
    check('a link to itself is an error, not an absent file', loop !== null, `${loop}`);
    GLib.unlink(link.get_path());
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
    // Root writes to a read-only folder, so the case proves nothing there.
    const W_OK = 2;
    const readOnly = GLib.access(config, W_OK) !== 0;
    let failure = null;
    try {
        if (readOnly)
            writeText(file, 'lost');
    } catch (e) {
        failure = e;
    }
    GLib.chmod(config, 0o755);
    if (readOnly) {
        check('a save fails when the folder takes no new link', failure !== null);
        check('a failed save leaves the target as it was', read(target) === 'new', read(target));
    } else {
        print('SKIP  the read-only folder case: this user writes to a read-only folder');
    }

    const plain = Gio.File.new_for_path(`${config}/plain.json`);
    writeText(plain, 'text');
    check('a save of a new regular file writes it', read(plain.get_path()) === 'text');
    const criticalsBefore = criticals.length;
    writeText(plain, 'again');
    check('a save over a regular file writes it', read(plain.get_path()) === 'again');
    check('a save over a regular file logs no critical', criticals.length === criticalsBefore,
        JSON.stringify(criticals.slice(criticalsBefore)));
}

// -- a failed save through a symlink names the real cause --------------------

{
    const config = `${SCRATCH}/causes`;
    const real = `${SCRATCH}/causes-real`;
    GLib.mkdir_with_parents(config, 0o755);
    GLib.mkdir_with_parents(real, 0o755);
    const file = Gio.File.new_for_path(`${config}/rules.json`);
    const saveError = linkTarget => {
        file.make_symbolic_link(linkTarget, null);
        try {
            writeText(file, 'new');
            return null;
        } catch (e) {
            return e;
        } finally {
            GLib.unlink(file.get_path());
        }
    };
    const failsWith = (error, code) => error?.matches(Gio.IOErrorEnum, code) === true;

    check('a save to a target in a missing folder reports not found',
        failsWith(saveError('../absent/rules.json'), Gio.IOErrorEnum.NOT_FOUND));
    check('a save through a real link loop still reports the loop',
        failsWith(saveError('rules.json'), Gio.IOErrorEnum.TOO_MANY_LINKS));

    const target = `${real}/rules.json`;
    GLib.file_set_contents(target, 'old');
    GLib.chmod(target, 0o444);
    // Root opens a read-only file for a write, so the case proves nothing there.
    const W_OK = 2;
    if (GLib.access(target, W_OK) !== 0) {
        check('a save to a read-only target reports permission denied',
            failsWith(saveError('../causes-real/rules.json'), Gio.IOErrorEnum.PERMISSION_DENIED));
        const [, bytes] = GLib.file_get_contents(target);
        check('a refused save leaves the read-only target as it was',
            new TextDecoder().decode(bytes) === 'old');
    } else {
        print('SKIP  the read-only target case: this user writes to a read-only file');
    }
    const entries = [...Gio.File.new_for_path(config).enumerate_children('standard::name',
        Gio.FileQueryInfoFlags.NONE, null)].map(info => info.get_name());
    check('a failed save leaves no temporary link', entries.length === 0, JSON.stringify(entries));
}

// -- a write that fails partway leaves the old text ----------------------------

{
    // A file-size limit makes write() fail partway, as a full disk does, and
    // needs no privileges. The save runs in a child, which the limit binds.
    const folder = `${SCRATCH}/partial`;
    const real = `${SCRATCH}/partial-real`;
    GLib.mkdir_with_parents(folder, 0o755);
    GLib.mkdir_with_parents(real, 0o755);
    const script = `${SCRATCH}/save-limited.js`;
    GLib.file_set_contents(script, `
        import Gio from 'gi://Gio';
        import GLib from 'gi://GLib';
        import System from 'system';
        const { writeText } = await import(${JSON.stringify(GLib.filename_to_uri(`${PREFS}/rules-disk.js`, null))});
        const [path, other, otherPath, during] = System.programArgs;
        if (during) {
            const writeAll = Gio.OutputStream.prototype.write_all;
            Gio.OutputStream.prototype.write_all = function (...args) {
                GLib.file_set_contents(otherPath, other);
                return writeAll.apply(this, args);
            };
        } else if (other) {
            const replace = Gio.File.prototype.replace;
            Gio.File.prototype.replace = function (...args) {
                GLib.file_set_contents(otherPath, other);
                return replace.apply(this, args);
            };
        }
        try {
            writeText(Gio.File.new_for_path(path), 'n'.repeat(65536));
            print('saved');
        } catch {
            print('failed');
        }`);
    const saveLimited = (path, other = '', otherPath = path, during = '') => {
        const [, out] = GLib.spawn_sync(null,
            ['bash', '-c', 'trap "" XFSZ; ulimit -f 8; exec gjs -m "$0" "$1" "$2" "$3" "$4"', script, path, other, otherPath, during],
            null, GLib.SpawnFlags.SEARCH_PATH, null);
        return new TextDecoder().decode(out).trim();
    };
    const read = path => new TextDecoder().decode(GLib.file_get_contents(path)[1]);
    const names = dir => [...Gio.File.new_for_path(dir).enumerate_children('standard::name',
        Gio.FileQueryInfoFlags.NONE, null)].map(info => info.get_name()).sort();

    const regular = `${folder}/rules.json`;
    GLib.file_set_contents(regular, 'old');
    check('a save that cannot finish reports a failure', saveLimited(regular) === 'failed');
    check('a failed write keeps the old text of a regular file', read(regular) === 'old',
        `${read(regular).length} bytes`);
    check('a failed write leaves no temporary file', names(folder).length === 1, JSON.stringify(names(folder)));
    saveLimited(regular, 'from another program');
    check('a failed save keeps text another program wrote meanwhile',
        read(regular) === 'from another program', read(regular));
    GLib.file_set_contents(regular, 'old');
    saveLimited(regular, 'n', regular, 'during');
    check('a failed save keeps a change made during the write',
        read(regular) === 'n', read(regular));
    GLib.file_set_contents(regular, 'n');
    check('a failed save of a longer text with the same start reports a failure',
        saveLimited(regular) === 'failed');
    check('a failed save leaves an old text that is the start of the new text',
        read(regular) === 'n', `${read(regular).length} bytes`);
    GLib.unlink(regular);

    const target = `${real}/rules.json`;
    GLib.file_set_contents(target, 'old');
    Gio.File.new_for_path(regular).make_symbolic_link('../partial-real/rules.json', null);
    check('a save through a link that cannot finish reports a failure', saveLimited(regular) === 'failed');
    check('a failed write keeps the old text of a link target', read(target) === 'old',
        `${read(target).length} bytes`);
    check('a failed write through a link leaves no temporary file',
        names(folder).length === 1 && names(real).length === 1,
        JSON.stringify([names(folder), names(real)]));
    saveLimited(regular, 'from another program', target);
    check('a failed save through a link keeps text another program wrote meanwhile',
        read(target) === 'from another program', read(target));

    // A file that cannot be read could not be put back, so the save is refused.
    GLib.file_set_contents(target, 'old');
    GLib.chmod(target, 0o200);
    const unreadable = GLib.access(target, 4) !== 0;
    const refused = unreadable ? saveLimited(regular) : '';
    GLib.chmod(target, 0o644);
    if (unreadable) {
        check('a save to a file it cannot read is refused', refused === 'failed', refused);
        check('a refused save keeps the text of a file it cannot read', read(target) === 'old',
            `${read(target).length} bytes`);
    } else {
        print('SKIP  the unreadable target case: this user reads a write-only file');
    }
    GLib.unlink(regular);

    const hard = `${real}/hard.json`;
    GLib.file_set_contents(regular, 'old');
    GLib.spawn_command_line_sync(`ln ${GLib.shell_quote(regular)} ${GLib.shell_quote(hard)}`);
    check('a save to a hard link that cannot finish reports a failure', saveLimited(regular) === 'failed');
    check('a failed write keeps the old text of a hard link',
        read(regular) === 'old' && read(hard) === 'old', `${read(hard).length} bytes`);

    // Gio cannot make a temporary file here and writes in place.
    const lockedDir = `${SCRATCH}/partial-locked`;
    const locked = `${lockedDir}/rules.json`;
    GLib.mkdir_with_parents(lockedDir, 0o755);
    GLib.file_set_contents(locked, 'old');
    GLib.chmod(lockedDir, 0o555);
    let lockedResult = null;
    try {
        if (GLib.access(lockedDir, 2) !== 0)
            lockedResult = saveLimited(locked);
    } finally {
        GLib.chmod(lockedDir, 0o755);
    }
    if (lockedResult !== null) {
        check('a save in a read-only folder that cannot finish reports a failure', lockedResult === 'failed');
        check('a failed write in a read-only folder keeps the old text', read(locked) === 'old',
            `${read(locked).length} bytes`);
    } else {
        print('SKIP  the failed write in a read-only folder: this user writes to a read-only folder');
    }
}

// -- a save keeps the file's mode, and follows every link ----------------------

{
    const folder = `${SCRATCH}/modes`;
    GLib.mkdir_with_parents(`${folder}/real/deep`, 0o755);
    GLib.mkdir_with_parents(`${folder}/config`, 0o755);
    const read = path => new TextDecoder().decode(GLib.file_get_contents(path)[1]);
    const modeOf = path => Gio.File.new_for_path(path).query_info('unix::mode',
        Gio.FileQueryInfoFlags.NONE, null).get_attribute_uint32('unix::mode') & 0o7777;

    const plain = `${folder}/config/plain.json`;
    GLib.file_set_contents(plain, 'old');
    for (const mode of [0o600, 0o664]) {
        GLib.chmod(plain, mode);
        writeText(Gio.File.new_for_path(plain), 'new');
        check(`a save keeps mode ${mode.toString(8)}`, modeOf(plain) === mode, modeOf(plain).toString(8));
    }
    writeText(Gio.File.new_for_path(plain), '');
    check('a save can write an empty text', read(plain) === '');

    // `..` after a linked folder is the parent of the real folder. A chain of
    // links must end at the file, and each link must stay a link.
    const end = `${folder}/real/rules.json`;
    GLib.file_set_contents(end, 'old');
    Gio.File.new_for_path(`${folder}/config/deep`).make_symbolic_link('../real/deep', null);
    const middle = Gio.File.new_for_path(`${folder}/config/middle.json`);
    middle.make_symbolic_link('deep/../rules.json', null);
    const first = Gio.File.new_for_path(`${folder}/config/rules.json`);
    first.make_symbolic_link('middle.json', null);
    writeText(first, 'new');
    check('a save through a chain of links writes the last target', read(end) === 'new', read(end));
    const isLink = file => file.query_info('standard::is-symlink',
        Gio.FileQueryInfoFlags.NOFOLLOW_SYMLINKS, null).get_is_symlink();
    check('a save through a chain of links keeps each link', isLink(first) && isLink(middle));

    // A hard link stays one file.
    const shared = `${folder}/real/shared.json`;
    const other = `${folder}/real/other.json`;
    GLib.file_set_contents(shared, 'old');
    GLib.spawn_command_line_sync(`ln ${GLib.shell_quote(shared)} ${GLib.shell_quote(other)}`);
    writeText(Gio.File.new_for_path(shared), 'new');
    check('a save keeps a hard link', read(other) === 'new', read(other));

    // A writable file in a read-only folder still saves.
    const lockedDir = `${folder}/locked`;
    GLib.mkdir_with_parents(lockedDir, 0o755);
    const locked = `${lockedDir}/rules.json`;
    GLib.file_set_contents(locked, 'old');
    GLib.chmod(lockedDir, 0o555);
    // Root writes to a read-only folder, so the case proves nothing there.
    const lockedFolder = GLib.access(lockedDir, 2) !== 0;
    try {
        if (lockedFolder)
            writeText(Gio.File.new_for_path(locked), 'new');
    } finally {
        GLib.chmod(lockedDir, 0o755);
    }
    if (lockedFolder)
        check('a writable file in a read-only folder saves', read(locked) === 'new', read(locked));
    else
        print('SKIP  the writable file in a read-only folder: this user writes to a read-only folder');

    // A link whose name is not UTF-8 is followed.
    const rawDir = GLib.shell_quote(`${folder}/config`);
    GLib.spawn_command_line_sync(`bash -c "printf old > ${rawDir}/$'bad\\377.json'; ln -s $'bad\\377.json' ${rawDir}/raw-middle.json; ln -s raw-middle.json ${rawDir}/raw.json"`);
    writeText(Gio.File.new_for_path(`${folder}/config/raw.json`), 'new');
    check('a save follows a link to a name that is not UTF-8',
        read(`${folder}/config/raw-middle.json`) === 'new');

    // A link without a target names the file to create.
    const dangling = Gio.File.new_for_path(`${folder}/config/dangling.json`);
    dangling.make_symbolic_link('../real/created.json', null);
    writeText(dangling, 'made');
    check('a save through a link without a target creates it',
        read(`${folder}/real/created.json`) === 'made' && isLink(dangling));
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
