#!/usr/bin/env -S gjs -m
// SPDX-FileCopyrightText: 2026 hko9890
// SPDX-License-Identifier: MIT
//
// Drive the real extension.js, rules.js and keybindings.js against fake
// windows, without a GNOME Shell and without D-Bus. Run from anywhere, with the
// mutter typelib directory on GI_TYPELIB_PATH:
//
//     GI_TYPELIB_PATH=$(dirname "$(find /usr/lib* -name 'Meta-*.typelib' | head -1)") \
//         gjs -m tests/check-extension-headless.js
//
// The extension files are copied into a temporary directory, where the
// shell-only imports (ui/main.js, extensions/extension.js, gi://Shell) are
// pointed at stubs written next to them. Every other line is the shipped code.
//
// Exits 0 when every check passes, 1 when any fails.

import GLib from 'gi://GLib';
import Meta from 'gi://Meta';

const ROOT = GLib.path_get_dirname(GLib.path_get_dirname(
    GLib.canonicalize_filename(import.meta.url.replace('file://', ''), null)));
const EXTENSION_DIR = `${ROOT}/window-control@carlo9890.github.io`;
const DBUS_ERROR_DISABLED = 'org.gnome.Shell.Extensions.WindowControl.Disabled';
const DBUS_ERROR_INVALID_ARGS = 'org.freedesktop.DBus.Error.InvalidArgs';

// Nothing here may reach a real session bus or the user's rules.json.
const SCRATCH = GLib.dir_make_tmp('wctl-check-XXXXXX');
GLib.setenv('DBUS_SESSION_BUS_ADDRESS', 'unix:path=/nonexistent', true);
GLib.setenv('XDG_CONFIG_HOME', `${SCRATCH}/config`, true);
if (GLib.get_user_config_dir() !== `${SCRATCH}/config`)
    throw new Error(`the config dir is ${GLib.get_user_config_dir()}, not the scratch one`);

let passed = 0;
const failures = [];

function check(name, condition, detail) {
    if (condition) {
        passed += 1;
        return;
    }
    failures.push(detail ? `${name}\n    ${detail}` : name);
}

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
for (const name of ['dbus-interface.js', 'extension.js', 'keybindings.js', 'rules-format.js',
    'rules.js', 'window-helpers.js']) {
    const text = read(`${EXTENSION_DIR}/${name}`)
        .replace("'resource:///org/gnome/shell/ui/main.js'", "'./stub-main.js'")
        .replace("'resource:///org/gnome/shell/extensions/extension.js'", "'./stub-extension.js'")
        .replace("'gi://Shell'", "'./stub-shell.js'");
    write(`${EXT}/${name}`, name === 'extension.js' ? `${text}\nexport { WindowControlService };\n` : text);
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

const workspace = { get_work_area_for_monitor: () => ({ x: 0, y: 0, width: 1920, height: 1080 }) };

class FakeWindow extends Emitter {
    constructor({ id, wmClass, type = Meta.WindowType.NORMAL, maximizeFlags = 0 }) {
        super();
        Object.assign(this, { id, wmClass, type, maximizeFlags, hidden: true, minimized: false, moves: [] });
    }

    get_id() { return this.id; }
    get_wm_class() { return this.wmClass; }
    get_title() { return ''; }
    get_pid() { return 1; }
    get_window_type() { return this.type; }
    is_hidden() { return this.hidden; }
    located_on_workspace() { return true; }
    get_client_type() { return Meta.WindowClientType.WAYLAND; }
    is_fullscreen() { return false; }
    get_maximize_flags() { return this.maximizeFlags; }
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

// The reply a fake invocation got: {value} or {error, message}, null while none.
function invocation() {
    const call = { reply: null, replies: 0 };
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

// unexport() as disable() calls it. The service was never exported, so its
// D-Bus skeleton is swapped for one that has nothing to unexport.
function unexport(service) {
    service._dbusImpl = { unexport() {} };
    service.unexport();
}

const { WindowControlService } = await import(`file://${EXT}/extension.js`);
const { WindowRules } = await import(`file://${EXT}/rules.js`);
const { WindowKeybindings } = await import(`file://${EXT}/keybindings.js`);

// -- WaitForWindow: a window created during an earlier wait ------------------
//
// B is created while `wait A` is pending and maps only after that wait ended,
// with no handler left to see it. A later `wait B` must still find it once it
// is minimized, as it finds C, which predates every wait.

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
    check('wait A leaves no handler on B', b.handlerCount() === 0, `${b.handlerCount()} handler(s)`);
    b.map();
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
    unexport(service);
    windows.length = 0;
}

// -- WaitForWindow / WaitForGeometry: the timeout_ms cap ---------------------

{
    const service = new WindowControlService({ version: 0 });
    const win = createWindow({ id: 7, wmClass: 'X' });
    win.map();
    const overWindow = invocation();
    const overGeometry = invocation();
    service.WaitForWindowAsync(['class', 'never', 600001], overWindow);
    service.WaitForGeometryAsync([7, 100, 600001], overGeometry);
    check('WaitForWindow refuses timeout_ms 600001', overWindow.reply?.error === DBUS_ERROR_INVALID_ARGS,
        showReply(overWindow));
    check('WaitForGeometry refuses timeout_ms 600001', overGeometry.reply?.error === DBUS_ERROR_INVALID_ARGS,
        showReply(overGeometry));
    check('a refused wait leaves no handler', display.handlerCount() === 0 && win.handlerCount() === 0,
        `display ${display.handlerCount()}, window ${win.handlerCount()}`);

    // -- disable() while a WaitForWindow and a WaitForGeometry are pending ----
    //
    // 600000 is the cap itself, so these two also prove it is accepted.

    const pendingWindow = invocation();
    const pendingGeometry = invocation();
    service.WaitForWindowAsync(['class', 'never', 600000], pendingWindow);
    service.WaitForGeometryAsync([7, 600000, 600000], pendingGeometry);
    check('WaitForWindow accepts timeout_ms 600000', pendingWindow.reply === null, showReply(pendingWindow));
    check('WaitForGeometry accepts timeout_ms 600000', pendingGeometry.reply === null,
        showReply(pendingGeometry));
    const sources = [
        ...service._waiters.map(waiter => waiter.timeoutId),
        ...service._geometryWatchers.flatMap(watcher => [watcher.quietId, watcher.timeoutId]),
    ];
    check('the pending waits armed their timers', sources.length === 3 && sources.every(sourceAlive),
        `${sources}`);
    unexport(service);
    check('unexport() fails the pending WaitForWindow with Disabled',
        pendingWindow.reply?.error === DBUS_ERROR_DISABLED && pendingWindow.replies === 1,
        showReply(pendingWindow));
    check('unexport() fails the pending WaitForGeometry with Disabled',
        pendingGeometry.reply?.error === DBUS_ERROR_DISABLED && pendingGeometry.replies === 1,
        showReply(pendingGeometry));
    check('unexport() leaves no handler', display.handlerCount() === 0 && win.handlerCount() === 0,
        `display ${display.handlerCount()}, window ${win.handlerCount()}`);
    check('unexport() leaves no timer', !sources.some(sourceAlive), `${sources.filter(sourceAlive)}`);
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

// -- WindowRules: a window that is not NORMAL when shown ----------------------
//
// It gets the grace period an unmatched NORMAL window gets: a retype to
// NORMAL within it gets the rule, one after it does not.

{
    const configDir = `${SCRATCH}/config/gnome-window-control`;
    GLib.mkdir_with_parents(configDir, 0o755);
    write(`${configDir}/rules.json`, '[{"match":{"class":"app"},"tile":"left"}]');
    const rules = new WindowRules();
    rules.enable();
    await sleep(300);
    check('rules.json is loaded', rules._rules.length === 1, `${rules._rules.length} rule(s)`);
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

// -- report ----------------------------------------------------------------

GLib.spawn_command_line_sync(`rm -rf ${GLib.shell_quote(SCRATCH)}`);

if (failures.length > 0) {
    print(`FAIL  ${failures.length} of ${passed + failures.length} checks failed\n`);
    for (const failure of failures)
        print(`  - ${failure}`);
    print('');
    imports.system.exit(1);
}

print(`PASS  ${passed} checks`);
