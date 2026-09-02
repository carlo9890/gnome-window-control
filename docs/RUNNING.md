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

**The nested session shares your dconf database.** `gnome-extensions
enable`/`disable` writes `org.gnome.shell enabled-extensions`, and your real
shell reacts to that write too: it can disable the extension in your live
session (observed: a `disable`/`enable` cycle inside a nested session left the
outer session's extension INACTIVE). To keep the nested shell's settings
private, start it with an in-memory settings backend; it then boots with no
extensions enabled and `gnome-extensions enable` inside it touches only the
nested shell:

```bash
GSETTINGS_BACKEND=memory gnome-shell --nested --wayland
```

Note that the `gnome-extensions enable`/`disable` CLI writes to dconf
regardless of how the shell was started, so inside such a session use the
shell's D-Bus API instead; the memory-backed shell then keeps the change to
itself:

```bash
gdbus call --session --dest org.gnome.Shell \
  --object-path /org/gnome/Shell --method org.gnome.Shell.Extensions.EnableExtension \
  window-control@carlo9890.github.io
```

Otherwise restart GNOME Shell directly: log out/in on Wayland, or `Alt+F2` → `r` →
Enter on X11.

Three more nested-session pitfalls, all observed on GNOME 46:

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
  Use `wctl wait` rather than polling `wctl list`, and expect the modification
  suite's 0.5 s settle to be too short there; a copy with `sleep 1.5` and a
  30 s spawn timeout passes.

- **Dynamic workspaces shift indices.** Switching away from an empty
  workspace lets GNOME remove it, so the index you switched to can change a
  moment later. This is normal desktop behaviour, not an extension bug.

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
