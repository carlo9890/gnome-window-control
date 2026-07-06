# Overview

GNOME Shell extension that exposes a D-Bus interface for listing and controlling
windows on Wayland, plus `wctl`, a bash CLI wrapper over that interface. Targets
GNOME Shell 45-50.

## Repository layout

```
window-control@hko9890/    GNOME Shell extension
├── extension.js           D-Bus service + method handlers (WindowControlService)
├── dbus-interface.js      D-Bus interface XML (imported by extension.js)
├── metadata.json          extension metadata (uuid, shell-version, version)
└── README.md              packaged docs (shipped inside the release zip)
wctl                       CLI wrapper; also holds the pure helper functions
scripts/                   build.sh, release.sh, start-nested.sh, debug-dbus.sh
tests/                     test suites (see docs/TESTING.md)
docs/                      developer topic docs (this directory)
.github/workflows/         CI (build.yml)
.tasks/                    committed taskmgr issue tracker
dist/                      build output (generated zips)
install-wctl.sh            wctl installer
gnome-window-control-extension-requirements.md   original design spec
```

## Architecture & key concepts

- The extension registers its D-Bus object on **GNOME Shell's own bus
  connection**, so the destination is `org.gnome.Shell` (not a standalone
  service). Path `/org/gnome/Shell/Extensions/WindowControl`, interface
  `org.gnome.Shell.Extensions.WindowControl`.
- `extension.js` holds one `WindowControlService` class; the simple boolean
  handlers share the `_actOnWindow(id, label, action)` helper. The interface XML
  lives in `dbus-interface.js` and is imported into `extension.js`.
- `wctl` reaches the single service through **two client transports** by design:
  `gdbus` for scalar/tuple returns (`dbus_call`) and `busctl --json | jq` for the
  JSON-string returns (`dbus_call_json`, used because `gdbus` mangles the JSON
  string). Both funnel failures through `is_extension_not_running` for a
  consistent hint.
- Pure, D-Bus-free logic in `wctl` (geometry math, token/tile resolution,
  argument validation) is factored into standalone functions so
  `tests/test-logic.sh` can unit-test them headlessly — this is the CI gate.
- A single `extension.js` runs across GNOME 45-50 via runtime API detection for
  the maximize path (`get_maximized()` vs `get_maximize_flags()`).
- `disable`/`enable` does **not** reload JS from disk; code changes need a shell
  restart or nested session (see [RUNNING.md](RUNNING.md)).

## Finding things

```bash
# A D-Bus method's XML signature
grep -n 'method name=' window-control@hko9890/dbus-interface.js

# A method's handler implementation
grep -n 'MethodName(' window-control@hko9890/extension.js

# A wctl subcommand's implementation and its dispatch
grep -n 'cmd_<name>\|^\s*<name>)' wctl

# The pure helper functions that are unit-tested headlessly
grep -n 'resolve_\|parse_workarea\|validate_id\|report_result' wctl

# The authoritative method list
sed -n '/## Methods/,/## /p' README.md
```

## External resources

| Resource | URL |
|----------|-----|
| Releases | https://github.com/carlo9890/gnome-window-control/releases |
| Meta.Window API (mutter) | https://gnome.pages.gitlab.gnome.org/mutter/meta/class.Window.html |
| GJS D-Bus (`Gio.DBusExportedObject`) | https://gjs.guide/guides/gio/dbus.html |
| GNOME Shell extension porting notes | https://gjs.guide/extensions/ |
