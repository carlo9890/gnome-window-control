#!/usr/bin/env -S gjs -m
// SPDX-FileCopyrightText: 2026 hko9890
// SPDX-License-Identifier: MIT
//
// Press a key chord in the GNOME Shell on the current session bus, through
// mutter's org.gnome.Mutter.RemoteDesktop API. That is how a headless or
// nested shell receives keyboard input without a real keyboard: the virtual
// device it creates feeds the same event path as evdev, so extension
// keybindings fire on it (mutter pins this in src/tests/keybindings.c).
//
//     DBUS_SESSION_BUS_ADDRESS=... gjs -m tests/inject-keys.js Super_L Shift_L KP_Home
//
// Every keysym named is pressed in order and released in reverse order, so
// modifiers go first. Names are the xkb keysym names; the table below holds
// the ones the tile shortcuts use. Mutter accepts a session's calls only from
// the bus name that created it, so the whole sequence runs on this one
// connection.

import Gio from 'gi://Gio';
import GLib from 'gi://GLib';

const KEYSYMS = {
    Super_L: 0xffeb,
    Shift_L: 0xffe1,
    Control_L: 0xffe3,
    Alt_L: 0xffe9,
    KP_Home: 0xff95, KP_7: 0xffb7,
    KP_Up: 0xff97, KP_8: 0xffb8,
    KP_Page_Up: 0xff9a, KP_9: 0xffb9,
    KP_Left: 0xff96, KP_4: 0xffb4,
    KP_Begin: 0xff9d, KP_5: 0xffb5,
    KP_Right: 0xff98, KP_6: 0xffb6,
    KP_End: 0xff9c, KP_1: 0xffb1,
    KP_Down: 0xff99, KP_2: 0xffb2,
    KP_Page_Down: 0xff9b, KP_3: 0xffb3,
    KP_Add: 0xffab,
};

const names = ARGV;
if (names.length === 0) {
    printerr('Usage: inject-keys.js <KEYSYM>...');
    imports.system.exit(2);
}
const keysyms = names.map(name => {
    if (!(name in KEYSYMS)) {
        printerr(`Unknown keysym: ${name}`);
        imports.system.exit(2);
    }
    return KEYSYMS[name];
});

const bus = Gio.DBusConnection.new_for_address_sync(
    GLib.getenv('DBUS_SESSION_BUS_ADDRESS'),
    Gio.DBusConnectionFlags.AUTHENTICATION_CLIENT | Gio.DBusConnectionFlags.MESSAGE_BUS_CONNECTION,
    null, null);

function call(path, iface, method, args) {
    const reply = bus.call_sync('org.gnome.Mutter.RemoteDesktop', path, iface, method,
        args, null, Gio.DBusCallFlags.NONE, 5000, null);
    return reply.deep_unpack();
}

const [session] = call('/org/gnome/Mutter/RemoteDesktop', 'org.gnome.Mutter.RemoteDesktop',
    'CreateSession', null);
const SESSION_IFACE = 'org.gnome.Mutter.RemoteDesktop.Session';
call(session, SESSION_IFACE, 'Start', null);

const key = (keysym, pressed) => call(session, SESSION_IFACE, 'NotifyKeyboardKeysym',
    new GLib.Variant('(ub)', [keysym, pressed]));

for (const keysym of keysyms)
    key(keysym, true);
for (const keysym of [...keysyms].reverse())
    key(keysym, false);

call(session, SESSION_IFACE, 'Stop', null);
