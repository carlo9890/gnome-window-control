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
| `wctl` / tests / scripts | None (run fresh each invocation) |

Reload without logging out via a **nested GNOME Shell session** (runs in a window,
isolated from your main session; all logs go to the launching terminal):

```bash
./scripts/build.sh install        # copy updated files into the extensions dir
./scripts/start-nested.sh         # launch a nested shell in a window
# inside the nested session's terminal:
gnome-extensions enable window-control@carlo9890.github.io
```

Otherwise restart GNOME Shell directly: log out/in on Wayland, or `Alt+F2` → `r` →
Enter on X11.

## Check extension status

```bash
gnome-extensions info window-control@carlo9890.github.io    # installed / enabled?
gnome-extensions list | grep window-control     # if absent, a restart is needed
```

## Drive it

Via `wctl`:

```bash
./wctl list          # enumerate windows
./wctl focused       # focused-window details
./wctl move <ID> 100 100
./wctl tile <ID> top-left
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
   `./wctl list --json`.
3. Replay the exact `wctl` command / D-Bus call from the report and read the
   window state back with `./wctl info <ID> --json`.

## Verify a change

Re-run the affected command against a live window and confirm the observed
geometry/state, e.g. after a `tile`/`place`/`move`, read `./wctl info <ID> --json`
and compare `frame_rect`. For a full sweep, run the modification suite
([TESTING.md](TESTING.md)) — it spawns its own window and asserts geometry within
a tolerance.
