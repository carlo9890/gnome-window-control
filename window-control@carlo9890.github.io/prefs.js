// SPDX-FileCopyrightText: 2026 hko9890
// SPDX-License-Identifier: MIT
// The preferences window: the top-bar icon switch, the keyboard shortcuts and
// a rules.json editor. The modules it loads are in prefs/.

import Adw from 'gi://Adw';
import Gio from 'gi://Gio';
import { ExtensionPreferences } from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';
import { RulesEditor } from './prefs/rules-page.js';
import { buildShortcutsPage } from './prefs/shortcuts-page.js';

export default class WindowControlPreferences extends ExtensionPreferences {
    fillPreferencesWindow(window) {
        const settings = this.getSettings();
        window.set_default_size(720, 780);
        window.search_enabled = false;
        // A schema compiled by an older install lacks show-indicator, and a
        // read of a key the schema does not know throws.
        if (settings.settings_schema.has_key('show-indicator'))
            window.add(this._buildGeneralPage(settings));
        window.add(buildShortcutsPage(window, settings));
        window.add(new RulesEditor(window).page);
    }

    _buildGeneralPage(settings) {
        const page = new Adw.PreferencesPage({ title: 'General', icon_name: 'preferences-system-symbolic' });
        const group = new Adw.PreferencesGroup({ title: 'Top Bar' });
        const row = new Adw.SwitchRow({
            title: 'Show Icon in the Top Bar',
            subtitle: 'A menu to apply the rules again and to open this window',
        });
        settings.bind('show-indicator', row, 'active', Gio.SettingsBindFlags.DEFAULT);
        group.add(row);
        page.add(group);
        return page;
    }
}
