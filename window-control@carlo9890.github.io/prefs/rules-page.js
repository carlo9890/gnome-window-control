// SPDX-FileCopyrightText: 2026 hko9890
// SPDX-License-Identifier: MIT
// The Rules page: a rules.json editor that checks the text with the extension's
// own grammar, saves only a valid file and applies the rules over D-Bus. The
// rules.d drop-ins are listed read only.

import Adw from 'gi://Adw';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Gtk from 'gi://Gtk';
import Pango from 'gi://Pango';
import { dropInNames } from '../rules-format.js';
import { CONFIG_DIR, DROPIN_DIR, RULES_FILE, regularFileNames } from '../rules-files.js';
import { checkRules, ruleSummary, rulesLabel } from './rules-check.js';
import { readText, writeText } from './rules-disk.js';

const CHECK_DELAY_MS = 300;
// An editor's save raises several events; read the file once they stop.
const DISK_DEBOUNCE_MS = 100;
const EXAMPLE = '[\n  { "match": { "class": "org.gnome.TextEditor" }, "tile": "left" }\n]\n';

function displayPath(file) {
    const home = Gio.File.new_for_path(GLib.get_home_dir());
    const relative = home.get_relative_path(file);
    return relative ? `~/${relative}` : file.get_path();
}

function appliedMessage(applied) {
    if (applied === 0)
        return 'No open window matches a rule';
    return applied === 1 ? 'Applied the rules to 1 window' : `Applied the rules to ${applied} windows`;
}

export class RulesEditor {
    constructor(window) {
        this._window = window;
        this._file = Gio.File.new_for_path(GLib.build_filenamev([CONFIG_DIR, RULES_FILE]));
        this._dropInDir = Gio.File.new_for_path(GLib.build_filenamev([CONFIG_DIR, DROPIN_DIR]));
        this._dropInRows = [];
        this._monitor = null;
        this._monitorId = 0;
        this._dropInMonitor = null;
        this._dropInMonitorId = 0;
        // The text on disk, '' for no file, and the text _load put in the
        // buffer: the two differ when the file is missing and the buffer
        // holds EXAMPLE.
        this._savedText = null;
        this._loadedText = null;
        this._result = { ok: false };
        this._checkId = 0;
        this._diskId = 0;
        this._diskToast = null;
        this._cancellable = new Gio.Cancellable();

        this.page = new Adw.PreferencesPage({ title: 'Rules', icon_name: 'document-edit-symbolic' });
        this.page.add(this._buildEditorGroup());
        this.page.add(this._buildDropInGroup());
        this.page.add(this._buildApplyGroup());

        this._load();
        this._loadDropIns();
        this._watch();
        window.connect('close-request', () => {
            this._destroy();
            return false;
        });
    }

    _destroy() {
        this._cancellable.cancel();
        if (this._checkId) {
            GLib.source_remove(this._checkId);
            this._checkId = 0;
        }
        if (this._diskId) {
            GLib.source_remove(this._diskId);
            this._diskId = 0;
        }
        if (this._monitor) {
            this._monitor.disconnect(this._monitorId);
            this._monitor.cancel();
            this._monitor = null;
        }
        this._unwatchDropIns();
    }

    _buildEditorGroup() {
        const group = new Adw.PreferencesGroup({
            title: RULES_FILE,
            description: displayPath(this._file),
        });
        this._revertButton = new Gtk.Button({ label: 'Revert', valign: Gtk.Align.CENTER });
        this._revertButton.connect('clicked', () => this._load());
        this._saveButton = new Gtk.Button({
            label: 'Save',
            valign: Gtk.Align.CENTER,
            css_classes: ['suggested-action'],
        });
        this._saveButton.connect('clicked', () => this._save());
        const buttons = new Gtk.Box({ spacing: 6 });
        buttons.append(this._revertButton);
        buttons.append(this._saveButton);
        group.header_suffix = buttons;

        this._buffer = new Gtk.TextBuffer();
        this._errorTag = new Gtk.TextTag({ underline: Pango.Underline.ERROR });
        this._buffer.tag_table.add(this._errorTag);
        this._buffer.connect('changed', () => this._scheduleCheck());
        const view = new Gtk.TextView({
            buffer: this._buffer,
            monospace: true,
            top_margin: 12,
            bottom_margin: 12,
            left_margin: 12,
            right_margin: 12,
        });
        const scrolled = new Gtk.ScrolledWindow({
            child: view,
            min_content_height: 320,
            css_classes: ['card'],
            margin_bottom: 12,
        });
        group.add(scrolled);

        this._statusIcon = new Gtk.Image({ valign: Gtk.Align.CENTER });
        this._statusRow = new Adw.ActionRow({ subtitle_selectable: true });
        this._statusRow.add_prefix(this._statusIcon);
        const list = new Gtk.ListBox({ selection_mode: Gtk.SelectionMode.NONE, css_classes: ['boxed-list'] });
        list.append(this._statusRow);
        group.add(list);
        return group;
    }

    _buildDropInGroup() {
        this._dropInGroup = new Adw.PreferencesGroup({
            title: 'Rule Files from Other Programs',
            description: GLib.markup_escape_text(
                `In ${displayPath(this._dropInDir)}. A rule in ${RULES_FILE} wins over them. Read only here.`, -1),
            visible: false,
        });
        return this._dropInGroup;
    }

    _buildApplyGroup() {
        const group = new Adw.PreferencesGroup();
        this._applyRow = new Adw.ActionRow({
            title: 'Apply Rules Again',
            subtitle: 'Place every open window by the saved rules of all files, as a new window is placed',
        });
        this._applyButton = new Gtk.Button({ label: 'Apply', valign: Gtk.Align.CENTER });
        this._applyButton.connect('clicked', () => this._apply());
        this._applyRow.add_suffix(this._applyButton);
        group.add(this._applyRow);
        return group;
    }

    // [name, subtitle] per drop-in file. A missing rules.d has none.
    _readDropIns() {
        let infos;
        try {
            infos = [...this._dropInDir.enumerate_children('standard::name,standard::type',
                Gio.FileQueryInfoFlags.NONE, null)];
        } catch (e) {
            if (e.matches(Gio.IOErrorEnum, Gio.IOErrorEnum.NOT_FOUND))
                return [];
            return [[DROPIN_DIR, `Cannot read: ${e.message}`]];
        }
        // Following symlinks, as the extension does, so a FIFO is never opened.
        return dropInNames(regularFileNames(infos)).map(name => {
            try {
                const [, bytes] = this._dropInDir.get_child(name).load_contents(null);
                return [name, ruleSummary(new TextDecoder().decode(bytes))];
            } catch (e) {
                return [name, `Cannot read: ${e.message}`];
            }
        });
    }

    _loadDropIns() {
        for (const row of this._dropInRows)
            this._dropInGroup.remove(row);
        this._dropInRows = this._readDropIns().map(([name, subtitle]) => {
            const row = new Adw.ActionRow({
                title: GLib.markup_escape_text(name, -1),
                subtitle: GLib.markup_escape_text(subtitle, -1),
                subtitle_selectable: true,
            });
            this._dropInGroup.add(row);
            return row;
        });
        this._dropInGroup.visible = this._dropInRows.length > 0;
    }

    _load() {
        this._diskToast?.dismiss();
        let text;
        try {
            text = readText(this._file);
        } catch (e) {
            this._toast(`Cannot read ${RULES_FILE}: ${e.message}`);
            this._syncButtons();
            return;
        }
        this._savedText = text ?? '';
        this._loadedText = text ?? EXAMPLE;
        this._buffer.text = this._loadedText;
        this._check();
    }

    _save() {
        const text = this._buffer.text;
        try {
            writeText(this._file, text);
        } catch (e) {
            this._toast(`Cannot save ${RULES_FILE}: ${e.message}`);
            return;
        }
        this._savedText = text;
        this._loadedText = text;
        this._syncButtons();
        this._toast(`Saved ${RULES_FILE}`);
    }

    // Watch the directory, not the file, so a save by rename is seen. The
    // rules.d monitor is made again when that folder changes, so one created
    // later is watched too.
    _watch() {
        try {
            this._file.get_parent().make_directory_with_parents(null);
        } catch (e) {
            if (!e.matches(Gio.IOErrorEnum, Gio.IOErrorEnum.EXISTS))
                this._toast(`Cannot create ${CONFIG_DIR}: ${e.message}`);
        }
        try {
            this._monitor = this._file.get_parent().monitor_directory(Gio.FileMonitorFlags.NONE, null);
        } catch (e) {
            this._toast(`Cannot watch ${CONFIG_DIR}: ${e.message}`);
            return;
        }
        // Compared as files, not by name: get_basename() throws for a name
        // that is not UTF-8.
        this._monitorId = this._monitor.connect('changed', (_monitor, file) => {
            if (file.equal(this._dropInDir))
                this._watchDropIns();
            else if (!file.equal(this._file))
                return;
            this._scheduleDiskChange();
        });
        this._watchDropIns();
    }

    _watchDropIns() {
        this._unwatchDropIns();
        try {
            this._dropInMonitor = this._dropInDir.monitor_directory(Gio.FileMonitorFlags.NONE, null);
        } catch (e) {
            this._toast(`Cannot watch ${DROPIN_DIR}: ${e.message}`);
            return;
        }
        this._dropInMonitorId = this._dropInMonitor.connect('changed', () => this._scheduleDiskChange());
    }

    _unwatchDropIns() {
        if (!this._dropInMonitor)
            return;
        this._dropInMonitor.disconnect(this._dropInMonitorId);
        this._dropInMonitor.cancel();
        this._dropInMonitor = null;
        this._dropInMonitorId = 0;
    }

    _scheduleDiskChange() {
        if (this._diskId)
            GLib.source_remove(this._diskId);
        this._diskId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, DISK_DEBOUNCE_MS, () => {
            this._diskId = 0;
            this._onDiskChange();
            return GLib.SOURCE_REMOVE;
        });
    }

    _onDiskChange() {
        this._loadDropIns();
        let text;
        try {
            text = readText(this._file) ?? '';
        } catch (e) {
            this._toast(`Cannot read ${RULES_FILE}: ${e.message}`);
            return;
        }
        if (text === this._savedText)
            return;
        if (this._buffer.text === this._loadedText) {
            this._load();
            return;
        }
        this._savedText = text;
        this._syncButtons();
        this._diskToast?.dismiss();
        this._diskToast = new Adw.Toast({
            title: `${RULES_FILE} changed on disk`,
            button_label: 'Reload',
            timeout: 0,
        });
        this._diskToast.connect('button-clicked', () => this._load());
        this._diskToast.connect('dismissed', () => {
            this._diskToast = null;
        });
        this._window.add_toast(this._diskToast);
    }

    _scheduleCheck() {
        if (this._checkId)
            GLib.source_remove(this._checkId);
        this._checkId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, CHECK_DELAY_MS, () => {
            this._checkId = 0;
            this._check();
            return GLib.SOURCE_REMOVE;
        });
        this._syncButtons();
    }

    _check() {
        if (this._checkId) {
            GLib.source_remove(this._checkId);
            this._checkId = 0;
        }
        const [start, end] = this._buffer.get_bounds();
        this._buffer.remove_tag(this._errorTag, start, end);
        this._result = checkRules(this._buffer.text);
        if (this._result.ok) {
            const { count } = this._result;
            this._statusIcon.icon_name = 'object-select-symbolic';
            this._statusIcon.css_classes = ['success'];
            this._statusRow.title = `Valid, ${rulesLabel(count)}`;
        } else {
            this._statusIcon.icon_name = 'dialog-error-symbolic';
            this._statusIcon.css_classes = ['error'];
            const { line, message } = this._result;
            this._statusRow.title = line ? `Error on line ${line}` : 'Error';
            this._statusRow.subtitle = GLib.markup_escape_text(message, -1);
            if (line)
                this._markLine(line);
        }
        this._syncButtons();
    }

    _markLine(line) {
        const [, lineStart] = this._buffer.get_iter_at_line(line - 1);
        const lineEnd = lineStart.copy();
        if (!lineEnd.ends_line())
            lineEnd.forward_to_line_end();
        this._buffer.apply_tag(this._errorTag, lineStart, lineEnd);
    }

    // Save takes a valid, changed text only: the extension loads no rule at
    // all from a file with one error.
    _syncButtons() {
        const modified = this._buffer.text !== this._savedText;
        const checked = this._checkId === 0;
        this._saveButton.sensitive = modified && checked && this._result.ok;
        this._revertButton.sensitive = this._buffer.text !== this._loadedText;
        this._applyButton.sensitive = !modified;
        if (this._result.ok)
            this._statusRow.subtitle = modified ? 'Not saved' : '';
        this._applyRow.subtitle = modified
            ? `Save the changes first: this applies the saved ${RULES_FILE} and the files in ${DROPIN_DIR}`
            : 'Place every open window by the saved rules of all files, as a new window is placed';
    }

    _apply() {
        Gio.DBus.session.call('org.gnome.Shell', '/org/gnome/Shell/Extensions/WindowControl',
            'org.gnome.Shell.Extensions.WindowControl', 'ApplyRules', new GLib.Variant('(t)', [0]),
            new GLib.VariantType('(u)'), Gio.DBusCallFlags.NONE, -1, this._cancellable, (connection, result) => {
                try {
                    const [applied] = connection.call_finish(result).deep_unpack();
                    this._toast(appliedMessage(applied));
                } catch (e) {
                    if (e.matches(Gio.IOErrorEnum, Gio.IOErrorEnum.CANCELLED))
                        return;
                    Gio.DBusError.strip_remote_error(e);
                    this._toast(`Cannot apply the rules: ${e.message}`);
                }
            });
    }

    _toast(title) {
        this._window.add_toast(new Adw.Toast({ title: GLib.markup_escape_text(title, -1) }));
    }
}
