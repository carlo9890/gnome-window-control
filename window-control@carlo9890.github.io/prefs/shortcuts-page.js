// SPDX-FileCopyrightText: 2026 hko9890
// SPDX-License-Identifier: MIT
// The Shortcuts page: one row per shortcut key. Activating a row opens a
// dialog that takes the next key chord.

import Adw from 'gi://Adw';
import Gdk from 'gi://Gdk';
import GLib from 'gi://GLib';
import Gtk from 'gi://Gtk';
import { SHORTCUT_GROUPS } from './shortcut-list.js';

export function buildShortcutsPage(window, settings) {
    const page = new Adw.PreferencesPage({
        title: 'Shortcuts',
        icon_name: 'preferences-desktop-keyboard-shortcuts-symbolic',
    });
    // A schema compiled by an older install lacks the newer keys, and a read
    // of a key the schema does not know throws.
    const hasKey = ([key]) => settings.settings_schema.has_key(key);
    const titles = new Map(SHORTCUT_GROUPS.flatMap(group => group.keys).filter(hasKey));
    const handlerIds = [];
    for (const group of SHORTCUT_GROUPS) {
        const keys = group.keys.filter(hasKey);
        if (keys.length === 0)
            continue;
        const prefsGroup = new Adw.PreferencesGroup({
            title: group.title,
            description: group.description ?? null,
        });
        for (const [key, title] of keys) {
            const row = shortcutRow(window, settings, key, title, titles);
            prefsGroup.add(row.widget);
            handlerIds.push(settings.connect(`changed::${key}`, row.update));
        }
        page.add(prefsGroup);
    }
    page.add(resetGroup(settings, titles));
    window.connect('close-request', () => {
        for (const id of handlerIds)
            settings.disconnect(id);
        return false;
    });
    return page;
}

function shortcutRow(window, settings, key, title, titles) {
    const row = new Adw.ActionRow({ title, activatable: true });
    const label = new Gtk.ShortcutLabel({ disabled_text: 'Disabled', valign: Gtk.Align.CENTER });
    const reset = new Gtk.Button({
        icon_name: 'edit-undo-symbolic',
        tooltip_text: 'Reset to the Default',
        valign: Gtk.Align.CENTER,
        css_classes: ['flat'],
    });
    reset.connect('clicked', () => {
        const [accelerator] = settings.get_default_value(key).deep_unpack();
        const holder = accelerator && holderOf(window, settings, accelerator, key, titles);
        if (holder)
            window.add_toast(new Adw.Toast({ title: GLib.markup_escape_text(usedBy(accelerator, holder), -1) }));
        else
            settings.reset(key);
    });
    row.add_suffix(label);
    row.add_suffix(reset);
    row.connect('activated', () => captureShortcut(window, settings, key, title, titles));

    const update = () => {
        label.accelerator = settings.get_strv(key)[0] ?? '';
        reset.sensitive = settings.get_user_value(key) !== null;
    };
    update();
    return { widget: row, update };
}

function resetGroup(settings, titles) {
    const group = new Adw.PreferencesGroup();
    const row = new Adw.ActionRow({
        title: 'Reset All Shortcuts',
        subtitle: 'Super+Ctrl and the numpad keys',
    });
    const button = new Gtk.Button({ label: 'Reset', valign: Gtk.Align.CENTER });
    button.connect('clicked', () => {
        for (const key of titles.keys())
            settings.reset(key);
    });
    row.add_suffix(button);
    group.add(row);
    return group;
}

function usedBy(accelerator, holder) {
    const [, keyval, mods] = Gtk.accelerator_parse(accelerator);
    return `${Gtk.accelerator_get_label(keyval, mods)} is already used by “${holder}”.`;
}

// Mutter binds a key by its keycode, so KP_7 and KP_Home, one key with Num
// Lock on and off, are the same shortcut.
function parseChord(window, accelerator) {
    const [, keyval, keycodes, mods] = Gtk.accelerator_parse_with_keycode(accelerator, window.get_display());
    return { keyval, keycodes: keycodes ?? [], mods };
}

// The shortcut that already holds `accelerator`, other than `key`, or null.
function holderOf(window, settings, accelerator, key, titles) {
    const wanted = parseChord(window, accelerator);
    for (const [other, title] of titles) {
        if (other === key)
            continue;
        for (const held of settings.get_strv(other)) {
            const chord = parseChord(window, held);
            if (chord.mods === wanted.mods && (chord.keyval === wanted.keyval ||
                chord.keycodes.some(keycode => wanted.keycodes.includes(keycode))))
                return title;
        }
    }
    return null;
}

function captureShortcut(window, settings, key, title, titles) {
    const status = new Adw.StatusPage({
        icon_name: 'preferences-desktop-keyboard-shortcuts-symbolic',
        title: 'Press a Shortcut',
        description: `For “${title}”. Press Esc to cancel or Backspace to disable it.`,
    });
    const toolbar = new Adw.ToolbarView({ content: status });
    toolbar.add_top_bar(new Adw.HeaderBar({ show_title: false }));
    const dialog = new Adw.Window({
        modal: true,
        transient_for: window,
        default_width: 480,
        default_height: 440,
        content: toolbar,
    });

    // Without the inhibit, GNOME Shell takes a chord it has bound itself,
    // these shortcuts included, before the dialog sees it.
    dialog.connect('map', () => dialog.get_surface().inhibit_system_shortcuts(null));

    const controller = new Gtk.EventControllerKey();
    controller.connect('key-pressed', (_controller, keyval, keycode, state) => {
        const mods = state & Gtk.accelerator_get_default_mod_mask();
        if (mods === 0 && keyval === Gdk.KEY_Escape) {
            dialog.close();
            return Gdk.EVENT_STOP;
        }
        if (mods === 0 && keyval === Gdk.KEY_BackSpace) {
            settings.set_strv(key, []);
            dialog.close();
            return Gdk.EVENT_STOP;
        }
        const lower = Gdk.keyval_to_lower(keyval);
        if (!Gtk.accelerator_valid(lower, mods))
            return Gdk.EVENT_STOP;
        const accelerator = Gtk.accelerator_name(lower, mods);
        const holder = holderOf(window, settings, accelerator, key, titles);
        if (holder) {
            status.description = GLib.markup_escape_text(
                `${usedBy(accelerator, holder)} Press another shortcut, or Esc to cancel.`, -1);
            return Gdk.EVENT_STOP;
        }
        settings.set_strv(key, [accelerator]);
        dialog.close();
        return Gdk.EVENT_STOP;
    });
    dialog.add_controller(controller);
    dialog.present();
}
