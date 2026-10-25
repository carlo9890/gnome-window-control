// SPDX-FileCopyrightText: 2026 hko9890
// SPDX-License-Identifier: MIT
// Window Control Extension for GNOME Shell
// D-Bus interface for listing and controlling windows

import { Extension } from 'resource:///org/gnome/shell/extensions/extension.js';
import { DBUS_OBJECT_PATH, WindowControlService } from './dbus-service.js';
import { WindowRules } from './rules.js';
import { WindowKeybindings } from './keybindings.js';

export default class WindowControlExtension extends Extension {
    enable() {
        const settings = this.getSettings();
        this._service = new WindowControlService(this.metadata);
        this._service.export();
        console.log(`[${this.metadata.name}] D-Bus service registered at ${DBUS_OBJECT_PATH}`);
        this._rules = new WindowRules();
        this._rules.enable();
        this._keybindings = new WindowKeybindings();
        this._keybindings.enable(settings);
        this._service.keybindingsServed = this._keybindings.registered;
    }

    disable() {
        if (this._keybindings) {
            const keybindings = this._keybindings;
            this._keybindings = null;
            keybindings.disable();
        }
        if (this._rules) {
            const rules = this._rules;
            this._rules = null;
            rules.disable();
        }
        if (this._service) {
            const service = this._service;
            this._service = null;
            service.unexport();
            console.log(`[${this.metadata.name}] D-Bus service unregistered`);
        }
    }
}
