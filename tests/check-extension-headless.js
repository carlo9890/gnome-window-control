#!/usr/bin/env -S gjs -m
// SPDX-FileCopyrightText: 2026 hko9890
// SPDX-License-Identifier: MIT
//
// Drive the real extension.js, dbus-service.js, rules.js and keybindings.js
// against fake windows, without a GNOME Shell and without D-Bus. Run from
// anywhere, with the mutter typelib directory on GI_TYPELIB_PATH (the newest
// one installed):
//
//     dir=$(find /usr/lib* -name 'Meta-*.typelib' -printf '%h\n' | sort -V | tail -1) &&
//         GI_TYPELIB_PATH=${dir:?no Meta-*.typelib installed} gjs -m tests/check-extension-headless.js
//
// The extension files are copied into a temporary directory, where the
// shell-only imports (ui/main.js, extensions/extension.js, gi://Shell) are
// pointed at stubs written next to them. Every other line is the shipped code.
//
// Exits 0 when every check passes, 1 when any fails.

import GLib from 'gi://GLib';
import Meta from 'gi://Meta';

import { ROOT, check, report } from './check-helper.js';

// Every console line, with its GLib level, so a check can assert the level a
// line is logged at. A line above debug level still reaches stderr.
const consoleLines = [];
GLib.log_set_writer_func((level, fields) => {
    const message = new TextDecoder().decode(fields.MESSAGE);
    consoleLines.push({ level, message });
    if (level !== GLib.LogLevelFlags.LEVEL_DEBUG)
        printerr(message);
    return GLib.LogWriterOutput.HANDLED;
});

// The console.log() lines (journald priority 5, visible by default) logged
// since `from`, an index into consoleLines.
function noticesSince(from) {
    return consoleLines.slice(from)
        .filter(line => line.level === GLib.LogLevelFlags.LEVEL_MESSAGE)
        .map(line => line.message);
}

const EXTENSION_DIR = `${ROOT}/window-control@carlo9890.github.io`;
const DBUS_ERROR_DISABLED = 'org.gnome.Shell.Extensions.WindowControl.Disabled';

// Nothing here may reach a real session bus or the user's rules.json. The
// scratch dir is removed however the checks end; a throw still exits 1.
const SCRATCH = GLib.dir_make_tmp('wctl-check-XXXXXX');
try {
    GLib.setenv('DBUS_SESSION_BUS_ADDRESS', 'unix:path=/nonexistent', true);
    GLib.setenv('XDG_CONFIG_HOME', `${SCRATCH}/config`, true);
    if (GLib.get_user_config_dir() !== `${SCRATCH}/config`)
        throw new Error(`the config dir is ${GLib.get_user_config_dir()}, not the scratch one`);

    function sleep(ms) {
        return new Promise(resolve => GLib.timeout_add(GLib.PRIORITY_DEFAULT, ms, () => {
            resolve();
            return GLib.SOURCE_REMOVE;
        }));
    }

    function sourceAlive(id) {
        return id !== 0 && GLib.MainContext.default().find_source_by_id(id) !== null;
    }

    function write(path, text) {
        GLib.file_set_contents(path, text);
    }

    function read(path) {
        return new TextDecoder().decode(GLib.file_get_contents(path)[1]);
    }

    // -- the extension, with stubs for the shell-only imports -------------------

    const EXT = `${SCRATCH}/ext`;
    GLib.mkdir_with_parents(EXT, 0o755);
    for (const name of ['dbus-interface.js', 'dbus-service.js', 'extension.js', 'keybindings.js',
        'rules-format.js', 'rules.js', 'window-helpers.js']) {
        const text = read(`${EXTENSION_DIR}/${name}`)
            .replace("'resource:///org/gnome/shell/ui/main.js'", "'./stub-main.js'")
            .replace("'resource:///org/gnome/shell/extensions/extension.js'", "'./stub-extension.js'")
            .replace("'gi://Shell'", "'./stub-shell.js'");
        write(`${EXT}/${name}`, text);
    }
    write(`${EXT}/stub-main.js`, `export const overview = { visible: false, hide() {} };
export const wm = { skipNextEffect() {}, addKeybinding: () => 1, removeKeybinding() {} };
`);
    write(`${EXT}/stub-extension.js`, 'export class Extension {}\n');
    write(`${EXT}/stub-shell.js`, 'export default { ActionMode: { NORMAL: 1 } };\n');

    // -- fakes -----------------------------------------------------------------

    class Emitter {
        constructor() {
            this._handlers = new Map();
            this._nextId = 1;
        }

        connect(name, callback) {
            const id = this._nextId++;
            this._handlers.set(id, [name, callback]);
            return id;
        }

        disconnect(id) {
            if (!this._handlers.delete(id))
                throw new Error(`bad handler id ${id}`);
        }

        emit(name, ...args) {
            for (const [handlerName, callback] of [...this._handlers.values()]) {
                if (handlerName === name)
                    callback(this, ...args);
            }
        }

        handlerCount() {
            return this._handlers.size;
        }
    }

    const workspace = {
        get_work_area_for_monitor: () => ({ x: 0, y: 0, width: 1920, height: 1080 }),
        index: () => 0,
    };

    class FakeWindow extends Emitter {
        constructor({ id, wmClass, type = Meta.WindowType.NORMAL, maximizeFlags = 0 }) {
            super();
            Object.assign(this,
                { id, wmClass, type, maximizeFlags, hidden: true, minimized: false, moves: [] });
        }

        get_id() { return this.id; }
        get_wm_class() { return this.wmClass; }
        get_wm_class_instance() { return ''; }
        get_sandboxed_app_id() { return ''; }
        get_gtk_application_id() { return ''; }
        has_focus() { return false; }
        is_above() { return false; }
        is_on_all_workspaces() { return false; }
        is_skip_taskbar() { return false; }
        get_title() { return ''; }
        get_pid() { return 1; }
        get_window_type() { return this.type; }
        is_hidden() { return this.hidden; }
        located_on_workspace() { return true; }
        get_client_type() { return Meta.WindowClientType.WAYLAND; }
        is_fullscreen() { return false; }
        unmaximize() { this.maximizeFlags = 0; }
        get_monitor() { return 0; }
        get_workspace() { return workspace; }
        get_transient_for() { return null; }
        get_frame_rect() { return { x: 10, y: 10, width: 400, height: 300 }; }
        move_resize_frame(userOp, x, y, width, height) { this.moves.push([x, y, width, height]); }
        change_workspace_by_index() {}
        move_to_monitor() {}

        map() {
            this.hidden = false;
            this.emit('shown');
        }

        minimize() {
            this.hidden = true;
            this.minimized = true;
        }
    }

    // The maximize getter of the shell this typelib belongs to, so window-helpers.js
    // takes the branch that shell takes: get_maximized() up to GNOME 48,
    // get_maximize_flags() from 49.
    const MAXIMIZE_GETTER = typeof Meta.Window.prototype.get_maximized === 'function'
        ? 'get_maximized' : 'get_maximize_flags';
    FakeWindow.prototype[MAXIMIZE_GETTER] = function () {
        return this.maximizeFlags;
    };

    const windows = [];
    const display = new Emitter();
    Object.assign(display, { get_n_monitors: () => 1, get_current_monitor: () => 0 });

    function createWindow(options) {
        const win = new FakeWindow(options);
        windows.push(win);
        display.emit('window-created', win);
        return win;
    }

    globalThis.global = {
        display,
        get_window_actors: () => windows.map(win => ({ get_meta_window: () => win })),
        workspace_manager: { get_active_workspace: () => workspace },
        get_current_time: () => 0,
    };

    // The session bus as the extension sees it: name watches, and a way to make a
    // caller leave. As in GDBus, a watch on a name that has already left reports it
    // gone from the main loop.
    const bus = {
        watches: new Map(),
        gone: new Set(),
        nextId: 1,
        watch_name(name, flags, appeared, vanished) {
            const id = this.nextId++;
            this.watches.set(id, { name, vanished });
            if (this.gone.has(name)) {
                GLib.idle_add(GLib.PRIORITY_DEFAULT, () => {
                    this.watches.get(id)?.vanished(this, name);
                    return GLib.SOURCE_REMOVE;
                });
            }
            return id;
        },
        unwatch_name(id) {
            if (!this.watches.delete(id))
                throw new Error(`bad watch id ${id}`);
        },
        leave(name) {
            this.gone.add(name);
            for (const [id, watch] of [...this.watches]) {
                if (watch.name === name && this.watches.has(id))
                    watch.vanished(this, name);
            }
        },
    };
    let nextCaller = 1;

    // The reply a fake invocation got: {value} or {error, message}, null while none.
    // Each call comes from its own caller, named in call.sender.
    function invocation() {
        const call = { reply: null, replies: 0, sender: `:1.${nextCaller++}` };
        call.get_sender = () => call.sender;
        call.get_connection = () => bus;
        call.return_value = variant => {
            call.reply = { value: variant.deepUnpack() };
            call.replies += 1;
        };
        call.return_dbus_error = (error, message) => {
            call.reply = { error, message };
            call.replies += 1;
        };
        return call;
    }

    function showReply(call) {
        return JSON.stringify(call.reply);
    }

    const { WindowControlService } = await import(`file://${EXT}/dbus-service.js`);
    const { default: WindowControlExtension } = await import(`file://${EXT}/extension.js`);
    const { WindowRules } = await import(`file://${EXT}/rules.js`);
    const { WindowKeybindings } = await import(`file://${EXT}/keybindings.js`);

    // -- WaitForWindow: a window created during an earlier wait ------------------
    //
    // B is created while `wait A` is pending and maps only after that wait ended.
    // Its one-shot 'shown' watch records the map, so a later `wait B` finds it once
    // it is minimized, as it finds C, which predates every wait.

    {
        const service = new WindowControlService({ version: 0 });
        const c = createWindow({ id: 3, wmClass: 'C' });
        c.map();
        c.minimize();
        const waitA = invocation();
        service.WaitForWindowAsync(['class', 'A', 5000], waitA);
        const b = createWindow({ id: 2, wmClass: 'B' });
        createWindow({ id: 1, wmClass: 'A' }).map();
        check('wait A replies with A', showReply(waitA) === '{"value":[1]}', showReply(waitA));
        check('wait A leaves only the first-show watch on B', b.handlerCount() === 2,
            `${b.handlerCount()} handler(s)`);
        b.map();
        check('the first-show watch is gone once B is shown', b.handlerCount() === 0,
            `${b.handlerCount()} handler(s)`);
        b.minimize();
        const waitC = invocation();
        const waitB = invocation();
        service.WaitForWindowAsync(['class', 'C', 300], waitC);
        service.WaitForWindowAsync(['class', 'B', 300], waitB);
        await sleep(400);
        check('wait C finds the window that predates every wait', showReply(waitC) === '{"value":[3]}',
            showReply(waitC));
        check('wait B finds the window created during wait A', showReply(waitB) === '{"value":[2]}',
            showReply(waitB));
        service.unexport();
        windows.length = 0;
    }

    // -- WaitForWindow: a window created minimized during an earlier wait ---------
    //
    // M is created minimized while `wait A` is pending and is not mapped when that
    // wait ends. A later `wait M` must not take it for a placed window: it replies
    // only once M is shown.

    {
        const service = new WindowControlService({ version: 0 });
        const waitA = invocation();
        service.WaitForWindowAsync(['class', 'A', 5000], waitA);
        const m = createWindow({ id: 9, wmClass: 'M' });
        m.minimized = true;
        createWindow({ id: 1, wmClass: 'A' }).map();
        const waitM = invocation();
        service.WaitForWindowAsync(['class', 'M', 5000], waitM);
        check('wait M does not reply for a window mutter has not placed', waitM.reply === null,
            showReply(waitM));
        m.minimized = false;
        m.map();
        check('wait M replies once M is shown', showReply(waitM) === '{"value":[9]}', showReply(waitM));
        service.unexport();
        windows.length = 0;
    }

    // -- WaitForWindow: a dialog shown, hidden, then retyped to NORMAL -----------
    //
    // Its 'shown' came while it was not NORMAL, so _evaluateWindow() never saw it
    // unhidden; the 'shown' handler must have recorded it.

    {
        const service = new WindowControlService({ version: 0 });
        const wait = invocation();
        service.WaitForWindowAsync(['class', 'D', 300], wait);
        const dialog = createWindow({ id: 6, wmClass: 'D', type: Meta.WindowType.MODAL_DIALOG });
        dialog.map();
        dialog.minimize();
        dialog.type = Meta.WindowType.NORMAL;
        dialog.emit('notify::window-type');
        check('wait D finds a dialog shown before it was retyped to NORMAL',
            showReply(wait) === '{"value":[6]}', showReply(wait));
        service.unexport();
        windows.length = 0;
    }

    // -- ListDetailed: has_been_shown -------------------------------------------
    //
    // N is created while no wait runs, and created minimized, so it is hidden and
    // not on screen without having been mapped. The service records it from
    // creation, so the listing and a later wait both know it is unshown. O
    // predates the service and is hidden and unminimized: the fallback reading.
    // T predates it too and is hidden only because P, its parent, is minimized.

    {
        const old = createWindow({ id: 12, wmClass: 'O' });
        const parent = createWindow({ id: 14, wmClass: 'P' });
        parent.minimized = true;
        const transient = createWindow({ id: 15, wmClass: 'T' });
        transient.get_transient_for = () => parent;
        const service = new WindowControlService({ version: 0 });
        const shown = () => Object.fromEntries(JSON.parse(service.ListDetailed())
            .map(doc => [doc.id, doc.has_been_shown]));
        const created = createWindow({ id: 11, wmClass: 'N' });
        created.minimized = true;
        check('a window created minimized has not been shown', shown()[11] === false,
            JSON.stringify(shown()));
        check('a window that predates the service and looks unmapped has not been shown',
            shown()[12] === false, JSON.stringify(shown()));
        check('a window hidden because its parent is minimized has been shown',
            shown()[15] === true, JSON.stringify(shown()));
        check('a window created while no wait runs keeps only a first-show watch',
            created.handlerCount() === 2, `${created.handlerCount()} handler(s)`);
        const wait = invocation();
        service.WaitForWindowAsync(['class', 'N', 5000], wait);
        check('a wait does not reply for a window created minimized and never mapped',
            wait.reply === null, showReply(wait));
        created.minimized = false;
        created.map();
        check('the wait replies once the window is shown', showReply(wait) === '{"value":[11]}',
            showReply(wait));
        created.minimize();
        check('a shown window stays shown once minimized', shown()[11] === true,
            JSON.stringify(shown()));
        check('a shown window keeps no handler', created.handlerCount() === 0,
            `${created.handlerCount()} handler(s)`);
        const unshown = createWindow({ id: 13, wmClass: 'U' });
        service.unexport();
        check('unexport() drops the record of new windows and its first-show watches',
            display.handlerCount() === 0 && unshown.handlerCount() === 0 && old.handlerCount() === 0,
            `display ${display.handlerCount()}, unshown ${unshown.handlerCount()}, ` +
            `old ${old.handlerCount()}`);
        windows.length = 0;
    }

    // -- WaitForWindow / WaitForGeometry: the caller leaves the bus ---------------
    //
    // A killed caller's wait is dropped at once, with no reply and nothing left
    // behind, while another caller's wait stays pending.

    {
        const service = new WindowControlService({ version: 0 });
        const win = createWindow({ id: 7, wmClass: 'X' });
        win.map();
        const goneWindow = invocation();
        const goneGeometry = invocation();
        const stays = invocation();
        service.WaitForWindowAsync(['class', 'never', 60000], goneWindow);
        service.WaitForGeometryAsync([7, 60000, 60000], goneGeometry);
        service.WaitForWindowAsync(['class', 'never', 60000], stays);
        const goneSources = [
            service._waiters[0].timeoutId,
            service._geometryWatchers[0].quietId,
            service._geometryWatchers[0].timeoutId,
        ];
        check('each pending wait watches its caller', bus.watches.size === 3,
            `${bus.watches.size} watch(es)`);
        bus.leave(goneWindow.sender);
        bus.leave(goneGeometry.sender);
        check('a wait whose caller left gets no reply',
            goneWindow.replies === 0 && goneGeometry.replies === 0,
            `${showReply(goneWindow)} ${showReply(goneGeometry)}`);
        check('a wait whose caller left keeps no timer', !goneSources.some(sourceAlive),
            `${goneSources.filter(sourceAlive)}`);
        check('another caller\'s wait stays pending', service._waiters.length === 1 && stays.reply === null &&
            service._geometryWatchers.length === 0 && bus.watches.size === 1,
            `waiters ${service._waiters.length}, watchers ${service._geometryWatchers.length}, ` +
            `watches ${bus.watches.size}`);
        bus.leave(stays.sender);
        // What stays on the display is the service's own record of new windows.
        check('the last caller leaving drops every handler',
            display.handlerCount() === 1 && win.handlerCount() === 0 && bus.watches.size === 0,
            `display ${display.handlerCount()}, window ${win.handlerCount()}, ` +
            `watches ${bus.watches.size}`);

        // A fire-and-forget caller has left before its call is handled.
        const leftFirstWindow = invocation();
        const leftFirstGeometry = invocation();
        bus.leave(leftFirstWindow.sender);
        bus.leave(leftFirstGeometry.sender);
        service.WaitForWindowAsync(['class', 'never', 60000], leftFirstWindow);
        service.WaitForGeometryAsync([7, 60000, 60000], leftFirstGeometry);
        await sleep(50);
        check('a wait whose caller left before it was handled is dropped',
            service._waiters.length === 0 && service._geometryWatchers.length === 0 &&
            leftFirstWindow.replies === 0 && leftFirstGeometry.replies === 0 &&
            display.handlerCount() === 1 && win.handlerCount() === 0 && bus.watches.size === 0,
            `waiters ${service._waiters.length}, watchers ${service._geometryWatchers.length}, ` +
            `display ${display.handlerCount()}, window ${win.handlerCount()}, watches ${bus.watches.size}`);

        // -- disable() while a WaitForWindow and a WaitForGeometry are pending ----

        // `unshown` is created during the wait and never mapped, so a normal end
        // of the wait would leave it a first-show watch. The teardown must not
        // even connect one.
        const pendingWindow = invocation();
        const pendingGeometry = invocation();
        service.WaitForWindowAsync(['class', 'never', 60000], pendingWindow);
        service.WaitForGeometryAsync([7, 60000, 60000], pendingGeometry);
        const unshown = createWindow({ id: 10, wmClass: 'U' });
        const sources = [
            ...service._waiters.map(waiter => waiter.timeoutId),
            ...service._geometryWatchers.flatMap(watcher => [watcher.quietId, watcher.timeoutId]),
        ];
        check('the pending waits armed their timers', sources.length === 3 && sources.every(sourceAlive),
            `${sources}`);
        const unshownConnects = unshown._nextId;
        service.unexport();
        check('unexport() connects no first-show watch', unshown._nextId === unshownConnects,
            `${unshown._nextId - unshownConnects} handler(s) connected`);
        check('unexport() fails the pending WaitForWindow with Disabled',
            pendingWindow.reply?.error === DBUS_ERROR_DISABLED && pendingWindow.replies === 1,
            showReply(pendingWindow));
        check('unexport() fails the pending WaitForGeometry with Disabled',
            pendingGeometry.reply?.error === DBUS_ERROR_DISABLED && pendingGeometry.replies === 1,
            showReply(pendingGeometry));
        check('unexport() leaves no handler, caller watch or first-show watch',
            display.handlerCount() === 0 && win.handlerCount() === 0 && unshown.handlerCount() === 0 &&
            bus.watches.size === 0,
            `display ${display.handlerCount()}, window ${win.handlerCount()}, ` +
            `unshown ${unshown.handlerCount()}, watches ${bus.watches.size}`);
        check('unexport() leaves no timer', !sources.some(sourceAlive), `${sources.filter(sourceAlive)}`);
        windows.length = 0;
    }

    // -- GetWorkarea: a missing monitor and a lookup that throws -----------------
    //
    // (-1, -1, -1, -1) is "no such monitor" and nothing else: a lookup that throws
    // raises Failed, so a caller never reports monitor 0 as missing.

    {
        const service = new WindowControlService({ version: 0 });
        const present = invocation();
        service.GetWorkareaAsync([0], present);
        check('GetWorkarea answers the workarea of a monitor', showReply(present) ===
            '{"value":[0,0,1920,1080]}', showReply(present));

        const missing = invocation();
        service.GetWorkareaAsync([1], missing);
        check('GetWorkarea answers -1 for an index that is not a monitor', showReply(missing) ===
            '{"value":[-1,-1,-1,-1]}', showReply(missing));

        const manager = global.workspace_manager;
        global.workspace_manager = {
            get_active_workspace: () => ({
                get_work_area_for_monitor: () => { throw new Error('no workarea'); },
            }),
        };
        const failed = invocation();
        service.GetWorkareaAsync([0], failed);
        global.workspace_manager = manager;
        check('GetWorkarea raises Failed when the lookup throws', showReply(failed) ===
            '{"error":"org.freedesktop.DBus.Error.Failed","message":"no workarea"}', showReply(failed));
        service.unexport();
    }

    // -- A synchronous handler that throws ------------------------------------------
    //
    // The throw reaches GJS, which answers org.gnome.gjs.JSError.<name>; a false
    // or an empty list would read as "no such window".

    {
        const service = new WindowControlService({ version: 0 });
        const win = createWindow({ id: 9, wmClass: 'T' });
        win.get_title = () => {
            throw new Error('title lookup failed');
        };
        win.activate = () => {
            throw new Error('activate failed');
        };
        const calls = {
            List: [() => service.List(), 'title lookup failed'],
            ListDetailed: [() => service.ListDetailed(), 'title lookup failed'],
            Activate: [() => service.Activate(9), 'activate failed'],
            ActivateByTitle: [() => service.ActivateByTitle('T'), 'title lookup failed'],
            ActivateByTitleSubstring: [() => service.ActivateByTitleSubstring('T'), 'title lookup failed'],
            ActivateByWmClass: [() => service.ActivateByWmClass('T'), 'activate failed'],
            ActivateByPid: [() => service.ActivateByPid(1), 'activate failed'],
        };
        for (const [name, [call, expected]] of Object.entries(calls)) {
            let error = null;
            try {
                call();
            } catch (e) {
                error = e;
            }
            check(`${name} lets an unexpected throw through to GJS`, error?.message === expected, `${error}`);
        }
        service.unexport();
        windows.length = 0;
    }

    // -- WindowKeybindings.disable() while an UnmaximizeWait is pending -----------

    {
        const keybindings = new WindowKeybindings();
        keybindings.enable({ getSettings: () => ({}) });
        const win = createWindow({ id: 8, wmClass: 'K', maximizeFlags: Meta.MaximizeFlags.BOTH });
        win.map();
        keybindings._tile('tile-left', win, 'left');
        const wait = keybindings._pending.get(win);
        check('a maximized window gets an UnmaximizeWait', wait !== undefined && win.handlerCount() > 0,
            `${win.handlerCount()} handler(s)`);
        const timeoutId = wait?._timeoutId ?? 0;
        keybindings.disable();
        check('disable() leaves no handler on the window', win.handlerCount() === 0,
            `${win.handlerCount()} handler(s)`);
        check('disable() leaves no UnmaximizeWait timer', !sourceAlive(timeoutId), `source ${timeoutId}`);
        await sleep(1200);   // past UNMAXIMIZE_SETTLE_MS
        check('a cancelled UnmaximizeWait never places the window', win.moves.length === 0,
            JSON.stringify(win.moves));
        windows.length = 0;
    }

    // -- enable() when the D-Bus export fails -------------------------------------
    //
    // The shell calls no disable() for an extension whose enable() threw.

    {
        const extension = new WindowControlExtension();
        extension.metadata = { name: 'Window Control', version: 1 };
        const realExport = WindowControlService.prototype.export;
        WindowControlService.prototype.export = () => {
            throw new Error('an object is already exported at this path');
        };
        let threw = false;
        try {
            extension.enable();
        } catch {
            threw = true;
        } finally {
            WindowControlService.prototype.export = realExport;
        }
        check('enable() rethrows a failed export', threw);
        check('a failed enable() leaves no handler on the display and no service',
            display.handlerCount() === 0 && extension._service === null,
            `${display.handlerCount()} handler(s), service ${extension._service}`);
    }

    // A service that was never registered is not reported as unregistered, and
    // a cleanup that throws does not replace the error enable() failed with.
    {
        const extension = new WindowControlExtension();
        extension.metadata = { name: 'Window Control', version: 1 };
        const realExport = WindowControlService.prototype.export;
        const realEnable = WindowRules.prototype.enable;
        const realDisable = WindowRules.prototype.disable;
        WindowControlService.prototype.export = () => {};
        WindowRules.prototype.enable = () => {
            throw new Error('rules failed');
        };
        WindowRules.prototype.disable = () => {
            throw new Error('cleanup failed');
        };
        const linesBefore = consoleLines.length;
        let error = null;
        try {
            extension.enable();
        } catch (e) {
            error = e;
        } finally {
            WindowControlService.prototype.export = realExport;
            WindowRules.prototype.enable = realEnable;
            WindowRules.prototype.disable = realDisable;
        }
        check('enable() rethrows its own error when the cleanup throws too',
            error?.message === 'rules failed', `${error}`);
        extension.disable();
        check('a service that was never exported is not logged as unregistered',
            !noticesSince(linesBefore).some(line => line.includes('unregistered')),
            JSON.stringify(noticesSince(linesBefore)));
        check('disable() after the failed cleanup leaves no handler and no service',
            display.handlerCount() === 0 && extension._service === null,
            `${display.handlerCount()} handler(s), service ${extension._service}`);
    }

    // -- WindowRules: a window that is not NORMAL when shown ----------------------
    //
    // It gets the grace period an unmatched NORMAL window gets: a retype to
    // NORMAL within it gets the rule, one after it does not.

    {
        const configDir = `${SCRATCH}/config/gnome-window-control`;
        GLib.mkdir_with_parents(configDir, 0o755);
        // The first load finds no file, and the write after it reloads. A load
        // runs at every enable() and a reload after every save and every
        // `wctl rules add`, so neither may leave a notice-level journal line
        // (REVIEWING.md).
        const rules = new WindowRules();
        const linesBeforeLoad = consoleLines.length;
        rules.enable();
        await sleep(300);
        write(`${configDir}/rules.json`, '[{"match":{"class":"app"},"tile":"left"}]');
        await sleep(300);
        check('rules.json is loaded', rules._rules.length === 1, `${rules._rules.length} rule(s)`);
        const loads = consoleLines.slice(linesBeforeLoad).map(line => line.message)
            .filter(message => message.includes('window rules off') || message.includes('rule(s) loaded'));
        check('the load found no file and the reload found the rule', loads.length === 2 &&
            loads[0].includes('no rules.json') && loads[1].includes('1 rule(s) loaded'),
            JSON.stringify(loads));
        check('loading and reloading rules.json log nothing at notice level',
            noticesSince(linesBeforeLoad).length === 0, JSON.stringify(noticesSince(linesBeforeLoad)));
        const early = createWindow({ id: 4, wmClass: 'app', type: Meta.WindowType.MODAL_DIALOG });
        const late = createWindow({ id: 5, wmClass: 'app', type: Meta.WindowType.MODAL_DIALOG });
        early.map();
        late.map();
        await sleep(500);
        early.type = Meta.WindowType.NORMAL;
        early.emit('notify::window-type');
        await sleep(2000);   // 2.5 s after shown, past LATE_IDENTITY_GRACE_MS
        check('a retype to NORMAL within the grace period gets the rule',
            JSON.stringify(early.moves) === '[[0,0,480,1080]]', JSON.stringify(early.moves));
        check('a dialog is untracked after the grace period',
            !rules._tracked.has(late) && late.handlerCount() === 0, `${late.handlerCount()} handler(s)`);
        late.type = Meta.WindowType.NORMAL;
        late.emit('notify::window-type');
        await sleep(200);
        check('a retype to NORMAL after the grace period moves nothing', late.moves.length === 0,
            JSON.stringify(late.moves));
        rules.disable();
        check('WindowRules.disable() leaves no handler on the display', display.handlerCount() === 0,
            `${display.handlerCount()} handler(s)`);
    }
} finally {
    GLib.spawn_command_line_sync(`rm -rf ${GLib.shell_quote(SCRATCH)}`);
}

// -- report ----------------------------------------------------------------

report();
