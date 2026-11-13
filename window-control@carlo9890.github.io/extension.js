// SPDX-FileCopyrightText: 2026 hko9890
// SPDX-License-Identifier: MIT
// Window Control Extension for GNOME Shell
// D-Bus interface for listing and controlling windows

import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import { Extension } from 'resource:///org/gnome/shell/extensions/extension.js';
import { DBUS_OBJECT_PATH, WindowControlService } from './dbus-service.js';
import { WindowRules } from './rules.js';
import { WindowKeybindings } from './keybindings.js';

export default class WindowControlExtension extends Extension {
    enable() {
        this._settings = this.getSettings();
        this._service = new WindowControlService(this.metadata);
        this._rules = new WindowRules();
        this._service.isOverlay = win => this._rules.isOverlay(win);
        this._service.applyRules = (win, isUnshown) => this._rules.applyRules(win, isUnshown);
        this._service.whenRulesLoaded = callback => this._rules.whenLoaded(callback);
        this._service.export();
        console.log(`[${this.metadata.name}] D-Bus service registered at ${DBUS_OBJECT_PATH}`);
        this._rules.enable();
        this._keybindings = new WindowKeybindings();
        this._keybindingsFailed = false;
        // The shell keeps the extension enabled when the screen locks and
        // calls enable() during a lock too, so the shortcuts follow the mode.
        this._sessionModeId = Main.sessionMode.connect('updated', () => this._syncKeybindings());
        this._syncKeybindings();
    }

    disable() {
        // The unlock-dialog session mode keeps the D-Bus service and the rules
        // up while the screen is locked: a window that opens then still gets
        // its rules.json placement, and scripts that drive windows keep
        // working. The keyboard shortcuts act on the desktop, so they are
        // removed in that mode (_syncKeybindings) and the lock screen takes no
        // input from this extension.
        Main.sessionMode.disconnect(this._sessionModeId);
        this._sessionModeId = 0;
        this._keybindings.disable();
        this._keybindings = null;
        this._keybindingsFailed = false;
        this._rules.disable();
        this._rules = null;
        this._service.unexport();
        this._service = null;
        this._settings = null;
        console.log(`[${this.metadata.name}] D-Bus service unregistered`);
    }

    // A registration that failed is not tried again before the next enable(),
    // and the capability reports that failure, not the lock.
    _syncKeybindings() {
        if (Main.sessionMode.isLocked) {
            this._keybindings.disable();
        } else if (!this._keybindings.registered && !this._keybindingsFailed) {
            this._keybindings.enable(this._settings);
            this._keybindingsFailed = !this._keybindings.registered;
        }
        this._service.keybindingsServed = !this._keybindingsFailed;
    }
}
