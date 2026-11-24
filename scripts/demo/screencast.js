#!/usr/bin/env -S gjs -m
// SPDX-FileCopyrightText: 2026 hko9890
// SPDX-License-Identifier: MIT
//
// Record the screen of the GNOME Shell on the session bus while a command runs:
//
//     gjs -m scripts/demo/screencast.js <OUT> <COMMAND>...
//
// GNOME Shell stops a screencast when its caller leaves the bus, so this one
// process starts the recording, waits for the command, and stops it. It prints
// the file the shell wrote and exits with the command's status.

import Gio from 'gi://Gio';
import GLib from 'gi://GLib';

const [out, ...command] = ARGV;
if (!out || command.length === 0) {
    printerr('Usage: screencast.js <OUT> <COMMAND>...');
    imports.system.exit(2);
}

function call(method, args, replyType) {
    return Gio.DBus.session.call_sync('org.gnome.Shell.Screencast', '/org/gnome/Shell/Screencast',
        'org.gnome.Shell.Screencast', method, args, new GLib.VariantType(replyType),
        Gio.DBusCallFlags.NONE, 10000, null).deep_unpack();
}

const options = {
    'framerate': new GLib.Variant('u', 30),
    'draw-cursor': new GLib.Variant('b', false),
};
const [started, file] = call('Screencast', new GLib.Variant('(sa{sv})', [out, options]), '(bs)');
if (!started) {
    printerr('GNOME Shell did not start the screencast');
    imports.system.exit(1);
}

const child = Gio.Subprocess.new(command, Gio.SubprocessFlags.NONE);
const loop = new GLib.MainLoop(null, false);
child.wait_async(null, (proc, result) => {
    proc.wait_finish(result);
    loop.quit();
});
loop.run();

const [stopped] = call('StopScreencast', null, '(b)');
if (!stopped) {
    printerr('The screencast failed while it recorded');
    imports.system.exit(1);
}
print(file);
imports.system.exit(child.get_if_exited() ? child.get_exit_status() : 1);
