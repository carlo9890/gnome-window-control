// SPDX-FileCopyrightText: 2026 hko9890
// SPDX-License-Identifier: MIT
// The top-bar icon, shown when the show-indicator setting is on. Its menu
// applies the rules again and opens the preferences window.

import St from 'gi://St';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as PanelMenu from 'resource:///org/gnome/shell/ui/panelMenu.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';

export class WindowControlIndicator {
    constructor(extension, applyRules) {
        this._button = new PanelMenu.Button(0.0, extension.metadata.name, false);
        this._button.add_child(new St.Icon({
            icon_name: 'view-grid-symbolic',
            style_class: 'system-status-icon',
        }));
        this._items = [];
        this._addItem('Apply Rules Again', () => applyRules());
        this._button.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());
        this._addItem('Settings', () => extension.openPreferences());
        Main.panel.addToStatusArea(extension.uuid, this._button);
    }

    destroy() {
        for (const [item, id] of this._items)
            item.disconnect(id);
        this._items = [];
        this._button.destroy();
        this._button = null;
    }

    _addItem(label, activate) {
        const item = new PopupMenu.PopupMenuItem(label);
        this._items.push([item, item.connect('activate', activate)]);
        this._button.menu.addMenuItem(item);
    }
}
