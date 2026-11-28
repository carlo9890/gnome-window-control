// SPDX-FileCopyrightText: 2026 hko9890
// SPDX-License-Identifier: MIT
// How the rules editor reads and writes rules.json. Imports no GTK, so
// tests/check-prefs.js can run it.

import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import { refuseUnlessRegular } from '../rules-files.js';

// Throws when `file` is no regular file. The open of a FIFO does not return,
// and the window would hang. A link is followed.
function refuseNonRegular(file) {
    let type;
    try {
        type = file.query_info('standard::type', Gio.FileQueryInfoFlags.NONE, null).get_file_type();
    } catch (e) {
        if (e.matches(Gio.IOErrorEnum, Gio.IOErrorEnum.NOT_FOUND))
            return;
        throw e;
    }
    refuseUnlessRegular(type);
}

// Throws for bytes that are not UTF-8: a lenient decoder puts U+FFFD in their
// place, and the next save would write that over the file.
function decode(bytes) {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
}

// The text of `file`, or null when there is none.
export function readText(file) {
    refuseNonRegular(file);
    let bytes;
    try {
        [, bytes] = file.load_contents(null);
    } catch (e) {
        if (e.matches(Gio.IOErrorEnum, Gio.IOErrorEnum.NOT_FOUND))
            return null;
        throw e;
    }
    return decode(bytes);
}

// A string, because a uint64 inode can lose precision as a JS number.
function inodeOf(info) {
    return info.get_attribute_as_string('unix::inode');
}

// The text, etag and inode of `file`, or null when it does not exist. A file
// that exists and cannot be read is refused: a failed save could not put it
// back.
function loadOld(file) {
    try {
        const [, bytes, etag] = file.load_contents(null);
        const inode = inodeOf(file.query_info('unix::inode', Gio.FileQueryInfoFlags.NONE, null));
        return { bytes, etag, inode };
    } catch (e) {
        if (e.matches(Gio.IOErrorEnum, Gio.IOErrorEnum.NOT_FOUND))
            return null;
        throw e;
    }
}

// When the check fails, the file may already be empty. A restore is then safe
// on either kind of stream: a temporary file with the old text replaces the file.
function isInPlace(stream, old) {
    if (old === null)
        return false;
    try {
        return inodeOf(stream.query_info('unix::inode', null)) === old.inode;
    } catch {
        return true;
    }
}

// Through the open stream, so a file that another program has renamed over
// this path in the meantime stays as it is.
function restoreInPlace(stream, old) {
    try {
        stream.seek(0, GLib.SeekType.SET, null);
        stream.write_all(old, null);
        stream.truncate(old.length, null);
        stream.close(null);
        return true;
    } catch {
        return false;
    }
}

// A file that no longer holds `lastRead` is refused with WRONG_ETAG, as Gio's
// own etag check refuses one that changes between the load and the replace:
// no event reports a change to a link's target, and the page reads a change
// only after its debounce.
//
// Gio's replace keeps the owner, the group and a hard link. Gio reports a
// failed open through a link as a link loop: a plain read-write open creates
// nothing and throws the real cause.
//
// Gio writes in place when it cannot use a temporary file: for a link target,
// a hard link or a read-only folder. The stream is then open on the loaded
// file, and a failed write has cut it. Otherwise a cancelled close drops any
// temporary file; replace_contents() would put it in place.
function replaceFile(file, bytes, lastRead) {
    const old = loadOld(file);
    if ((old === null ? '' : decode(old.bytes)) !== lastRead)
        throw new GLib.Error(Gio.IOErrorEnum, Gio.IOErrorEnum.WRONG_ETAG, 'The file was changed since it was read');
    const cancellable = new Gio.Cancellable();
    let stream;
    try {
        stream = file.replace(old?.etag ?? null, false, Gio.FileCreateFlags.NONE, cancellable);
    } catch (e) {
        if (e.matches(Gio.IOErrorEnum, Gio.IOErrorEnum.TOO_MANY_LINKS))
            file.open_readwrite(null).close(null);
        throw e;
    }
    const inPlace = isInPlace(stream, old);
    try {
        stream.write_all(bytes, cancellable);
        stream.close(cancellable);
    } catch (e) {
        if (inPlace && restoreInPlace(stream, old.bytes))
            throw e;
        cancellable.cancel();
        try {
            stream.close(cancellable);
        } catch {
            // The write error is the one the user needs.
        }
        if (inPlace)
            throw new GLib.Error(Gio.IOErrorEnum, e.code, `${e.message}. The old text could not be written back`);
        throw e;
    }
}

// `lastRead` is the text the caller read from `file`, '' when it found none.
//
// A write through a symlink changes its target and raises no event on the
// watched directory, so a new link is renamed over the old one, as wctl
// does. The new link is made first: when the folder takes no new entry, the
// save fails before the target has changed.
export function writeText(file, text, lastRead) {
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
        replaceFile(file, bytes, lastRead);
        return;
    }
    const link = file.get_parent().get_child(`.${file.get_basename()}.link.${GLib.uuid_string_random()}`);
    link.make_symbolic_link(target, null);
    try {
        replaceFile(file, bytes, lastRead);
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
