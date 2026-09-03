# Running

How an agent installs, reloads, and drives the extension and `wctl` by hand to
reproduce a bug or verify a change. For the automated suites and CI gates see
[TESTING.md](TESTING.md); for logs see [MONITORING.md](MONITORING.md). The generic
launch-and-drive flow is the built-in `run`/`verify` skills — this file records
only what is specific to this project.

## Reload after a code change (required)

**`gnome-extensions disable`/`enable` does NOT reload JavaScript from disk** — it
only re-runs `disable()`/`enable()` on the already-loaded code. Any change to
`extension.js`, `dbus-interface.js`, `metadata.json`, or a new file needs a real
reload:

| Change | Reload |
|--------|--------|
| `extension.js` / `dbus-interface.js` / `metadata.json` / new files | **Required** |
| `cli/` (wctl) | Rebuild: `mise run build` |
| tests / scripts | None (run fresh each invocation) |

Reload without logging out via a **nested GNOME Shell session** (runs in a window,
isolated from your main session; all logs go to the launching terminal):

```bash
./scripts/build.sh install        # copy updated files into the extensions dir
./scripts/start-nested.sh         # launch a nested shell in a window
# from a second terminal pointed at the nested session (see "Reach the nested
# session" below):
gnome-extensions enable window-control@carlo9890.github.io
```

`start-nested.sh` wraps the shell in `dbus-run-session`, so the nested session
gets its own session bus and its `org.gnome.Shell` does not collide with the
outer one.

Without a nested session, restart GNOME Shell directly: log out/in on Wayland,
or `Alt+F2` → `r` → Enter on X11.

### Reach the nested session

A second terminal needs the nested display and the nested bus. `start-nested.sh`
prints the display; the bus address exists only inside the nested process, so
read it back from `/proc`:

```bash
nested=$(pgrep -f '^gnome-shell --nested')
export WAYLAND_DISPLAY=wayland-1     # the value start-nested.sh printed
export DBUS_SESSION_BUS_ADDRESS=$(
  tr '\0' '\n' < /proc/$nested/environ | sed -n 's/^DBUS_SESSION_BUS_ADDRESS=//p')
```

### Keep the nested shell's settings to itself

**A nested session still shares your dconf database.** `gnome-extensions
enable`/`disable` writes `org.gnome.shell enabled-extensions`, and your real
shell reacts to that write too: it can disable the extension in your live
session (observed: a `disable`/`enable` cycle inside a nested session left the
outer session's extension INACTIVE). To keep the nested shell's settings
private, start it with an in-memory settings backend — keeping
`dbus-run-session`, or the shell lands on your real bus:

```bash
GSETTINGS_BACKEND=memory dbus-run-session gnome-shell --nested --wayland
```

It then boots with no extensions enabled. The `gnome-extensions` CLI writes to
dconf regardless of how the shell was started, so enable through the shell's
D-Bus API instead (from a terminal on the nested session's bus); the
memory-backed shell keeps the change to itself:

```bash
gdbus call --session --dest org.gnome.Shell \
  --object-path /org/gnome/Shell --method org.gnome.Shell.Extensions.EnableExtension \
  window-control@carlo9890.github.io
```

### Nested-session pitfalls

All observed on GNOME 46:

- **A fresh nested shell starts in the Activities overview.** Window
  activation does not close it, and `Meta.Workspace.activate()` is ignored
  while it is open (the extension hides it in `ActivateWorkspace`, but other
  behaviour differs from a normal desktop). Close it before testing:

  ```bash
  gdbus call --session --dest org.gnome.Shell --object-path /org/gnome/Shell \
    --method org.freedesktop.DBus.Properties.Set org.gnome.Shell OverviewActive '<false>'
  ```

- **Clients are slow under software rendering.** kitty takes 1-6 s to show its
  first frame in a nested session, and a window that exists but is not yet
  shown ignores geometry requests (mutter's initial placement overrides them).
  Use `wctl wait` rather than polling `wctl list`. The modification suite's
  0.5 s settle is also too short there, and its geometry assertions then fail at
  random — run it with `WCTL_TEST_SETTLE=1.5`:

  ```bash
  WCTL_TEST_SETTLE=1.5 WAYLAND_DISPLAY=wayland-1 \
    DBUS_SESSION_BUS_ADDRESS=<nested bus> \
    WCTL="$PWD/cli/target/release/wctl" ./tests/run-all-modification-tests.sh
  ```

- **A second monitor can be faked.** `MUTTER_DEBUG_NUM_DUMMY_MONITORS=2` gives
  the nested shell two outputs, which is the only way to reach the
  multi-monitor paths (`move-to-monitor` across monitors, and the
  `workspaces-only-on-primary` refusal in `move-to-workspace`). Without it the
  suite skips them.

- **Dynamic workspaces shift indices.** Switching away from an empty
  workspace lets GNOME remove it, so the index you switched to can change a
  moment later. This is normal desktop behaviour, not an extension bug.

## Check extension status

```bash
gnome-extensions info window-control@carlo9890.github.io    # installed / enabled?
gnome-extensions list | grep window-control     # if absent, a restart is needed
```

## Drive it

Via `wctl` (build it first with `mise run build`):

```bash
W=cli/target/release/wctl
$W list              # enumerate windows
$W focused           # focused-window details
$W move <ID> 100 100
$W tile <ID> top-left
```

Or call the D-Bus interface directly (destination `org.gnome.Shell`):

```bash
gdbus call --session --dest org.gnome.Shell \
  --object-path /org/gnome/Shell/Extensions/WindowControl \
  --method org.gnome.Shell.Extensions.WindowControl.ListDetailed
```

`./scripts/debug-dbus.sh` exercises the methods interactively.

## Reproduce a reported bug

1. Reload the current code as above (a nested session keeps it off your main
   desktop).
2. Spawn a target window if needed (`kitty --title test &`), find its id with
   `$W list --json`.
3. Replay the exact `wctl` command / D-Bus call from the report and read the
   window state back with `$W info <ID> --json`.

## Verify a change

Re-run the affected command against a live window and confirm the observed
geometry/state, e.g. after a `tile`/`place`/`move`, read `$W info <ID> --json`
and compare `frame_rect`. For a full sweep, run the modification suite
([TESTING.md](TESTING.md)) — it spawns its own window and asserts geometry within
a tolerance.
