# Overview

A findability map: where things live, and how to search for them. Each
module's header comment says what it holds.

## Layout

| Path | Holds |
|---|---|
| `window-control@carlo9890.github.io/` | The extension. The directory name is the `uuid` in `metadata.json`. |
| `…/extension.js` | `enable()` and `disable()`: starts and stops the parts below, and follows the lock screen. |
| `…/dbus-interface.js` | The D-Bus interface XML, and the errors each method raises by name. |
| `…/dbus-service.js` | `WindowControlService`: every D-Bus handler, and `CAPABILITIES`. |
| `…/rules.js` | `WindowRules`: places each new window by the rules files. |
| `…/rules-files.js` | Reads `rules.json` and the `rules.d` drop-ins. |
| `…/rules-format.js` | The rules grammar and the tile grid. Imports nothing, so plain `gjs` and the preferences process load it. |
| `…/window-helpers.js` | `WindowPlacer`, the one path for a frame request; the helpers shared by the modules above. |
| `…/keybindings.js` | `WindowKeybindings`: the shortcuts. The keys are in `schemas/`. |
| `…/overlay.js` | `WindowOverlays`: the windows a rule makes overlays. |
| `…/indicator.js` | The top-bar icon. |
| `…/prefs.js`, `…/prefs/` | The preferences window. It runs in its own process, not in GNOME Shell. |
| `cli/src/main.rs` | `wctl` dispatch, `COMMANDS`, `MIN_EXTENSION_VERSION`. |
| `cli/src/dbus.rs` | The D-Bus client and the map from a D-Bus error to a message and an exit code. |
| `cli/src/selector.rs` | The window selector: parse without the bus, then look up. |
| `cli/src/rules.rs` | The rules grammar, second implementation. |
| `cli/src/commands/` | One module per command group. |
| `cli/src/help.rs`, `cli/completions/` | The help text and the bash and zsh completions, written by hand. |
| `cli/tests/cli.rs` | The argument-guard tests. |
| `scripts/` | Build, release, version checks, the nested and headless shell starts. `demo/` records the guide's GIFs. |
| `tests/` | The test suites. `vectors/rules-spec.json` pins the rules grammar for both implementations. |
| `docs/decisions/` | One record per decision in force. |
| [`docs/specs/RULES-JSON.md`](specs/RULES-JSON.md) | The rules file format. |
| `docs/user-guide/` | The user guide. `README.md` is the product page that links it. |
| `docs/images/` | The guide images, the demo GIFs and the listing icon. |
| `install-wctl.sh` | The `wctl` installer. |

## Where each concept lives

| Concept | Lives in | Decision |
|---|---|---|
| D-Bus surface: geometry primitives, no layout | `dbus-interface.js`, `dbus-service.js` | [0001](decisions/0001-the-d-bus-interface-offers-geometry-primitives-and-no-layout.md), [0002](decisions/0002-the-d-bus-interface-has-no-access-control.md) |
| Errors raised by name | `dbus-interface.js` (ERRORS block), `cli/src/dbus.rs` | [0005](decisions/0005-the-geometry-methods-applyrules-and-the-wait-methods-raise-named-d-bus-errors.md) |
| What stays up while the screen is locked | `extension.js` | [0003](decisions/0003-the-d-bus-interface-and-the-rules-stay-up-while-the-session-is-locked.md) |
| One code base for GNOME 45-50 | `window-helpers.js` (maximize API detection) | [0006](decisions/0006-one-extension-serves-gnome-shell-45-to-50.md) |
| Frame requests of a shown window | `WindowPlacer` in `window-helpers.js` | |
| Auto-placement | `WindowRules` in `rules.js`; `ApplyRules` calls it | [0001](decisions/0001-the-d-bus-interface-offers-geometry-primitives-and-no-layout.md) |
| Rules grammar, two implementations | `rules-format.js`, `cli/src/rules.rs`, `tests/vectors/rules-spec.json` | [0007](decisions/0007-the-rules-json-grammar-has-two-implementations-pinned-to-one-vector-file.md) |
| Capability names | `CAPABILITIES` in `dbus-service.js`; gates in `cli/src/commands/` | [0008](decisions/0008-a-client-learns-what-the-extension-supports-from-a-capability-name.md) |
| `wctl` argument parsing, help, completions | `cli/src/main.rs`, `cli/src/help.rs`, `cli/completions/` | [0009](decisions/0009-wctl-parses-its-arguments-by-hand.md) |
| `wctl` release binary | `build:musl` in `.mise.toml` | [0004](decisions/0004-the-wctl-release-asset-is-one-static-binary-with-no-runtime-dependencies.md) |

## Finding things

```bash
X=window-control@carlo9890.github.io
grep -n 'method name=' $X/dbus-interface.js              # every D-Bus method and its signature
grep -nE '^\s+<Method>(Async)?\(' $X/dbus-service.js     # the handler of one method
sed -n '/pub const COMMANDS/,/^];/p' cli/src/main.rs     # every wctl command
grep -rn '"<command>" =>' cli/src/main.rs cli/src/commands/   # a command's dispatch and its subcommands
grep -n '^pub fn' cli/src/geometry.rs cli/src/selector.rs     # the pure helpers the unit tests cover
grep -rn 'decisions/<NNNN>' docs $X cli                  # every citation of one record
```

The interface XML is the D-Bus contract. The method table in
`docs/user-guide/dbus.md` is a copy kept by hand: trust the XML when they
disagree.

## External resources

| Resource | URL |
|----------|-----|
| Releases | https://github.com/carlo9890/gnome-window-control/releases |
| Meta.Window API (mutter) | https://gnome.pages.gitlab.gnome.org/mutter/meta/class.Window.html |
| GJS D-Bus (`Gio.DBusExportedObject`) | https://gjs.guide/guides/gio/dbus.html |
| GNOME Shell extension guide and porting notes | https://gjs.guide/extensions/ |
