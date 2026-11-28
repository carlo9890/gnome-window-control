// SPDX-FileCopyrightText: 2026 hko9890
// SPDX-License-Identifier: MIT
// How the rules editor reads and writes rules.json. Imports no GTK, so
// tests/check-prefs.js can run it.

import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import { refuseUnlessRegular } from '../rules-files.js';

// The kernel's limit on the links in one path.
const MAX_LINKS = 40;

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

function writeOver(seekable, output, bytes) {
    seekable.seek(0, GLib.SeekType.SET, null);
    output.write_all(bytes, null);
    seekable.truncate(bytes.length, null);
}

// Through the open stream, so a file that another program has renamed over
// this path in the meantime stays as it is. A failed close() leaves the stream
// closed: the file is opened again then, and written only while it is still
// the one this save cut. That open creates nothing, so a deleted file stays
// deleted.
function restoreInPlace(file, stream, old) {
    try {
        if (!stream.is_closed()) {
            writeOver(stream, stream, old.bytes);
            stream.close(null);
            return true;
        }
        const reopened = file.open_readwrite(null);
        const same = inodeOf(reopened.query_info('unix::inode', null)) === old.inode;
        if (same)
            writeOver(reopened, reopened.get_output_stream(), old.bytes);
        reopened.close(null);
        return same;
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
// Gio writes in place when it cannot use a temporary file: for a hard link, a
// read-only folder, a file it cannot give the old owner, or a path that is a
// link. The stream is then open on the loaded file, and a failed write has
// cut it. Otherwise a cancelled close drops any temporary file;
// replace_contents() would put it in place.
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
        if (inPlace && restoreInPlace(file, stream, old))
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

// The path the links at `path` lead to, followed as the kernel follows them:
// each name in the folder reached so far. So `..` after a linked folder is
// the parent of the real folder, where Gio.File drops it together with the
// name before it. null for a link loop, and for a link that GJS cannot read
// because its target is not UTF-8.
function linkEnd(path) {
    const names = path.split('/');
    let end = '';
    let links = 0;
    while (names.length > 0) {
        const name = names.shift();
        if (name === '' || name === '.')
            continue;
        if (name === '..') {
            end = end.slice(0, end.lastIndexOf('/'));
            continue;
        }
        const next = `${end}/${name}`;
        if (!GLib.file_test(next, GLib.FileTest.IS_SYMLINK)) {
            end = next;
            continue;
        }
        if (++links > MAX_LINKS)
            return null;
        let target;
        try {
            target = GLib.file_read_link(next);
        } catch {
            return null;
        }
        if (target.startsWith('/'))
            end = '';
        names.unshift(...target.split('/'));
    }
    return end;
}

// `lastRead` is the text the caller read from `file`, '' when it found none.
//
// A write through a symlink changes its target and raises no event on the
// watched directory, so a new link is renamed over the old one, as wctl
// does. The new link is made first: when the folder takes no new entry, the
// save fails before the target has changed.
//
// The target is replaced by the path the links lead to, so Gio can write a
// temporary file and rename it over. Given the link, Gio writes in place and
// empties the target before the first write, which a crash then leaves
// empty. Where linkEnd() cannot follow, Gio follows the link itself.
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
        const end = linkEnd(file.get_path());
        replaceFile(end === null ? file : Gio.File.new_for_path(end), bytes, lastRead);
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
