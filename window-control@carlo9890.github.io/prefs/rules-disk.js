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

// The text and etag of `file`, or null when it does not exist. A file that
// exists and cannot be read is refused: a failed save could not put it back.
function loadOld(file) {
    try {
        const [, bytes, etag] = file.load_contents(null);
        return { bytes, etag };
    } catch (e) {
        if (e.matches(Gio.IOErrorEnum, Gio.IOErrorEnum.NOT_FOUND))
            return null;
        throw e;
    }
}

// On a failed write, replace_contents() still closes the stream, which puts
// the cut file in place; a cancelled close drops it.
function writeAndClose(stream, bytes, cancellable) {
    try {
        stream.write_all(bytes, cancellable);
        stream.close(cancellable);
    } catch (e) {
        cancellable.cancel();
        try {
            stream.close(cancellable);
        } catch {
            // The write error is the one the user needs.
        }
        throw e;
    }
}

// Gio writes in place when it cannot use a temporary file: for a link target,
// a hard link or a read-only folder. The stream is then open on the file
// itself. When that cannot be checked, the file may already be empty.
function writesInPlace(stream, file) {
    try {
        const inode = info => info.get_attribute_uint64('unix::inode');
        return inode(stream.query_info('unix::inode', null)) ===
            inode(file.query_info('unix::inode', Gio.FileQueryInfoFlags.NONE, null));
    } catch {
        return true;
    }
}

function writeBack(file, old) {
    try {
        const cancellable = new Gio.Cancellable();
        const stream = file.replace(null, false, Gio.FileCreateFlags.NONE, cancellable);
        writeAndClose(stream, old, cancellable);
        return true;
    } catch {
        return false;
    }
}

// Gio's replace keeps the owner, the group and a hard link. The etag makes it
// refuse a file that another program changed after the load. Gio reports a
// failed open through a link as a link loop: a plain read-write open creates
// nothing and throws the real cause.
function replaceFile(file, bytes) {
    const old = loadOld(file);
    const cancellable = new Gio.Cancellable();
    let stream;
    try {
        stream = file.replace(old?.etag ?? null, false, Gio.FileCreateFlags.NONE, cancellable);
    } catch (e) {
        if (e.matches(Gio.IOErrorEnum, Gio.IOErrorEnum.TOO_MANY_LINKS))
            file.open_readwrite(null).close(null);
        throw e;
    }
    const inPlace = old !== null && writesInPlace(stream, file);
    try {
        writeAndClose(stream, bytes, cancellable);
    } catch (e) {
        if (inPlace && !writeBack(file, old.bytes))
            throw new GLib.Error(Gio.IOErrorEnum, e.code, `${e.message}. The old text could not be written back`);
        throw e;
    }
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
