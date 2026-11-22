// SPDX-FileCopyrightText: 2026 hko9890
// SPDX-License-Identifier: MIT
// How the rules editor reads and writes rules.json. Imports no GTK, so
// tests/check-prefs.js can run it.

import Gio from 'gi://Gio';
import GLib from 'gi://GLib';

// Throws when `file` is no regular file. The open of a FIFO does not return,
// and the window would hang. A link is followed. Gio reports a link that it
// cannot follow as a link: the open then gives the cause, which is "not
// found" for a link without a target.
function refuseNonRegular(file) {
    let type;
    try {
        type = file.query_info('standard::type', Gio.FileQueryInfoFlags.NONE, null).get_file_type();
    } catch (e) {
        if (e.matches(Gio.IOErrorEnum, Gio.IOErrorEnum.NOT_FOUND))
            return;
        throw e;
    }
    if (type !== Gio.FileType.REGULAR && type !== Gio.FileType.SYMBOLIC_LINK)
        throw new GLib.Error(Gio.IOErrorEnum, Gio.IOErrorEnum.NOT_REGULAR_FILE, 'not a regular file');
}

// The text of `file`, or null when there is none.
export function readText(file) {
    refuseNonRegular(file);
    try {
        const [, bytes] = file.load_contents(null);
        return new TextDecoder().decode(bytes);
    } catch (e) {
        if (e.matches(Gio.IOErrorEnum, Gio.IOErrorEnum.NOT_FOUND))
            return null;
        throw e;
    }
}

// The mode of `file`, or null when it does not exist. A plain read-write open
// follows a link, creates nothing and changes nothing. It refuses a read-only
// file, which a rename would replace, and names the real cause: Gio reports
// any other failed open through a link as a link loop.
function writableMode(file) {
    try {
        file.open_readwrite(null).close(null);
    } catch (e) {
        if (e.matches(Gio.IOErrorEnum, Gio.IOErrorEnum.NOT_FOUND))
            return null;
        throw e;
    }
    return file.query_info('unix::mode', Gio.FileQueryInfoFlags.NONE, null)
        .get_attribute_uint32('unix::mode') & 0o7777;
}

// The path at the end of the links from `path`. It keeps each `..` for the
// kernel to resolve: Gio and GLib collapse it without following a linked
// folder, and the result can name another file.
function linkEnd(path) {
    while (GLib.file_test(path, GLib.FileTest.IS_SYMLINK)) {
        const next = GLib.file_read_link(path);
        path = GLib.path_is_absolute(next) ? next : `${GLib.path_get_dirname(path)}/${next}`;
    }
    return path;
}

// Writes a temporary file next to the file and renames it over the file, so a
// write that fails partway, on a full disk for example, keeps the old text.
function replaceFile(file, bytes) {
    const mode = writableMode(file);
    const path = linkEnd(file.get_path());
    try {
        GLib.file_set_contents_full(path, bytes, GLib.FileSetContentsFlags.CONSISTENT, mode ?? 0o666);
    } catch (e) {
        throw new GLib.Error(Gio.IOErrorEnum, Gio.io_error_from_file_error(e.code), e.message);
    }
    // The temporary file was created through the umask.
    if (mode !== null)
        GLib.chmod(path, mode);
}

// A write through a symlink changes its target and raises no event on the
// watched directory, so a new link is renamed over the old one, as wctl
// does. The new link is made first: when the folder takes no new entry, the
// save fails before the target has changed.
export function writeText(file, text) {
    refuseNonRegular(file);
    let target = null;
    try {
        const info = file.query_info('standard::is-symlink,standard::symlink-target',
            Gio.FileQueryInfoFlags.NOFOLLOW_SYMLINKS, null);
        if (info.get_is_symlink())
            target = info.get_symlink_target();
    } catch (e) {
        if (!e.matches(Gio.IOErrorEnum, Gio.IOErrorEnum.NOT_FOUND))
            throw e;
    }
    const bytes = new TextEncoder().encode(text);
    if (!target) {
        replaceFile(file, bytes);
        return;
    }
    const link = file.get_parent().get_child(`.${file.get_basename()}.link.${GLib.uuid_string_random()}`);
    link.make_symbolic_link(target, null);
    try {
        replaceFile(file, bytes);
        link.move(file, Gio.FileCopyFlags.OVERWRITE | Gio.FileCopyFlags.NOFOLLOW_SYMLINKS, null, null);
    } catch (e) {
        try {
            link.delete(null);
        } catch {
            // The save error is the one the user needs.
        }
        throw e;
    }
}
