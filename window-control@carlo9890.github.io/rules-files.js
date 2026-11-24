// SPDX-FileCopyrightText: 2026 hko9890
// SPDX-License-Identifier: MIT
// Reading the rules files: rules.json, then the drop-ins in rules.d.

import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import { dropInNames } from './rules-format.js';

export const CONFIG_DIR = GLib.build_filenamev([GLib.get_user_config_dir(), 'gnome-window-control']);
export const RULES_FILE = 'rules.json';
export const DROPIN_DIR = 'rules.d';
export const DROPIN_PATH = GLib.build_filenamev([CONFIG_DIR, DROPIN_DIR]);

Gio._promisify(Gio.File.prototype, 'load_contents_async');
Gio._promisify(Gio.File.prototype, 'query_info_async');
Gio._promisify(Gio.File.prototype, 'enumerate_children_async');
Gio._promisify(Gio.FileEnumerator.prototype, 'next_files_async');
Gio._promisify(Gio.FileEnumerator.prototype, 'close_async');

// [{label, text}] of every file that could be read: rules.json, then the
// drop-ins in name order.
export async function readRuleFiles(cancellable) {
    const files = [];
    const main = await readFile(RULES_FILE, cancellable);
    if (main !== null)
        files.push({ label: RULES_FILE, text: main });
    for (const name of await listDropIns(cancellable)) {
        const label = `${DROPIN_DIR}/${name}`;
        const text = await readFile(label, cancellable);
        if (text !== null)
            files.push({ label, text });
    }
    return files;
}

export function stopMonitor(monitor, handlerId) {
    monitor.disconnect(handlerId);
    monitor.cancel();
}

// Throws for a type that is no regular file. Gio reports a link that it cannot
// follow as a link: the open then gives the cause, which is "not found" for a
// link without a target.
export function refuseUnlessRegular(type) {
    if (type !== Gio.FileType.REGULAR && type !== Gio.FileType.SYMBOLIC_LINK)
        throw new GLib.Error(Gio.IOErrorEnum, Gio.IOErrorEnum.NOT_REGULAR_FILE, 'not a regular file');
}

// The text of a file under CONFIG_DIR, or null when there is none to read.
// Only a regular file is opened: the read of a FIFO never finishes, and the
// load would wait for it.
async function readFile(label, cancellable) {
    try {
        const file = Gio.File.new_for_path(GLib.build_filenamev([CONFIG_DIR, label]));
        const info = await file.query_info_async('standard::type', Gio.FileQueryInfoFlags.NONE,
            GLib.PRIORITY_DEFAULT, cancellable);
        refuseUnlessRegular(info.get_file_type());
        const [bytes] = await file.load_contents_async(cancellable);
        return new TextDecoder().decode(bytes);
    } catch (e) {
        // A drop-in deleted since the listing is simply gone.
        if (e.matches(Gio.IOErrorEnum, Gio.IOErrorEnum.NOT_FOUND)) {
            if (label === RULES_FILE)
                console.debug(`[Window Control] no ${RULES_FILE}`);
        } else if (!e.matches(Gio.IOErrorEnum, Gio.IOErrorEnum.CANCELLED)) {
            console.error(`[Window Control] ${label}: cannot read: ${e.message}; the rules of that file are off`);
        }
        return null;
    }
}

// The names of the regular files among `infos`. get_name() throws for a name
// that is not UTF-8; such a name is no drop-in name, so the entry is skipped
// like any other, and the rest of the folder still loads.
export function regularFileNames(infos) {
    const names = [];
    for (const info of infos) {
        if (info.get_file_type() !== Gio.FileType.REGULAR)
            continue;
        try {
            names.push(info.get_name());
        } catch {
            continue;
        }
    }
    return names;
}

// The drop-in names in rules.d, sorted. The type is the one of a link's
// target, so a FIFO behind a link is skipped too.
async function listDropIns(cancellable) {
    try {
        const dir = Gio.File.new_for_path(DROPIN_PATH);
        const enumerator = await dir.enumerate_children_async('standard::name,standard::type',
            Gio.FileQueryInfoFlags.NONE, GLib.PRIORITY_DEFAULT, cancellable);
        const names = [];
        try {
            for (;;) {
                const infos = await enumerator.next_files_async(32, GLib.PRIORITY_DEFAULT, cancellable);
                if (infos.length === 0)
                    break;
                names.push(...regularFileNames(infos));
            }
        } finally {
            // Not with the load's cancellable: a cancelled load must still
            // release the folder.
            await enumerator.close_async(GLib.PRIORITY_DEFAULT, null);
        }
        return dropInNames(names);
    } catch (e) {
        if (e.matches(Gio.IOErrorEnum, Gio.IOErrorEnum.NOT_FOUND))
            console.debug(`[Window Control] no ${DROPIN_DIR}`);
        else if (!e.matches(Gio.IOErrorEnum, Gio.IOErrorEnum.CANCELLED))
            console.error(`[Window Control] ${DROPIN_DIR}: cannot list: ${e.message}; its rules are off`);
        return [];
    }
}
