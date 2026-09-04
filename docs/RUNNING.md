# Running

How an agent installs, reloads, and drives the extension and `wctl` by hand to
reproduce a bug or verify a change. For the automated suites and CI gates see
[TESTING.md](TESTING.md); for logs see [MONITORING.md](MONITORING.md). The generic
launch-and-drive flow is the built-in `run`/`verify` skills — this file records
only what is specific to this project.

## Hard rules for an agent (read before anything else in this file)

These exist because of a real incident, recorded at the end of this file.

1. **Never start, kill, or restart any GNOME Shell without the user's explicit
   consent for that specific run.** A nested shell counts. "Verify the change
   in a running shell" is not consent; ask, name the exact command, and wait.
   One approval covers one start. A second start needs a second approval.
2. **Never `pkill`/`killall` a shell.** Record the PID when you start a nested
   shell and stop that PID only, with a plain `kill <pid>`.
3. **Log every nested run to a new file** (for example a timestamped name).
   Never redirect a run's output over the previous run's log: the log of the
   run that logged the user out was destroyed exactly that way.
4. **Isolate more than the bus.** `dbus-run-session` gives the nested shell its
   own session bus, but the nested shell still inherits `SESSION_MANAGER`,
   `GNOME_SHELL_SESSION_MODE`, `XDG_SESSION_ID`, `INVOCATION_ID`, `MANAGERPID`
   and `JOURNAL_STREAM` from the real session. Mutter's nested backend uses
   `SESSION_MANAGER` to register with the *real* gnome-session as an XSMP
   client at startup (mutter 46 `src/x11/session.c`, called from
   `meta_context_main_notify_ready`). Start it with those variables removed:

   ```bash
   env -u SESSION_MANAGER -u GNOME_SHELL_SESSION_MODE -u DESKTOP_AUTOSTART_ID \
       -u XDG_SESSION_ID -u INVOCATION_ID -u MANAGERPID -u JOURNAL_STREAM \
       GSETTINGS_BACKEND=memory dbus-run-session \
       gnome-shell --nested --wayland --sm-disable > "nested-$(date +%H%M%S).log" 2>&1 &
   echo $!   # keep this PID
   ```

   `--sm-disable` is mutter's own switch for the XSMP client. This hardened
   form has not yet been exercised here; treat the first run as an experiment
   the user has agreed to.
5. **Prefer not to run a shell at all.** Pure logic (geometry, config parsing)
   is checked headlessly with `gjs -m` and `GI_TYPELIB_PATH` pointed at the
   mutter typelib directory; see the `check-rules.js` pattern in
   [TESTING.md](TESTING.md). Only behaviour that needs a compositor needs a
   shell.

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
./scripts/build.sh install                       # copy updated files into the extensions dir
GSETTINGS_BACKEND=memory ./scripts/start-nested.sh   # launch a nested shell in a window
# from a second terminal on the nested session's bus (see "Reach the nested
# session" below):
gdbus call --session --dest org.gnome.Shell \
  --object-path /org/gnome/Shell --method org.gnome.Shell.Extensions.EnableExtension \
  window-control@carlo9890.github.io
```

`GSETTINGS_BACKEND=memory` is required: a nested session shares your dconf
database, and `gnome-extensions enable`/`disable` writes
`org.gnome.shell enabled-extensions` there — your real shell reacts to that write
and can disable the extension in your live session (observed: a
`disable`/`enable` cycle inside a nested session left the outer session's
extension INACTIVE). The memory-backed shell boots with no extensions enabled;
enable through the shell's D-Bus API as above, never with the `gnome-extensions`
CLI, which writes to dconf regardless of how the shell was started.

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
  Use `wctl wait` rather than polling `wctl list`. Run the modification suite
  with the nested settle value from [TESTING.md](TESTING.md).

- **A second monitor can be faked:**
  `MUTTER_DEBUG_NUM_DUMMY_MONITORS=2 GSETTINGS_BACKEND=memory ./scripts/start-nested.sh`
  — the only way to reach `move-to-monitor` across monitors and the
  `workspaces-only-on-primary` refusal in `move-to-workspace`.

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

Run `./scripts/debug-dbus.sh` on the nested session's bus for a one-shot sweep
of every method; it writes `output/debug-<timestamp>.txt`.

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

## Incident 2026-09-11: nested shell start logged the user out

What happened. During one session an agent cycled a nested shell six times
(start, test, `pkill -f '^gnome-shell --nested'`, reinstall, start again) to
verify extension changes. Three seconds after the sixth start, at 11:15:15,
the real session's `systemd --user` activated `exit.target`, the real GNOME
Shell shut down, logind removed the login session, and GDM started a fresh
one. Every process of the login session died with it: all terminals, and
thirteen Claude Code sessions in other repositories, one of them mid-workflow.

What the evidence shows.

- The user manager's log line is `Activating special unit exit.target`
  from `manager_start_special`. For a user manager that follows a SIGTERM,
  a SIGINT (which would have been logged at info level and was not), or a
  D-Bus `Exit()`. No gnome-session logout path was logged (no
  `gnome-session-shutdown.target`, no "Unrecoverable failure").
- In the two minutes before, the agent's own command was the only one in any
  Claude session that contained a kill-type command.
- The trigger coincides with the sixth nested shell reaching startup
  completion, the moment mutter registers with the real gnome-session over
  `SESSION_MANAGER`. The five earlier starts used the identical command and
  were harmless, so the exact in-process mechanism is not proven.
- The nested shell's own log for that run was overwritten by the next run,
  so the last piece of evidence is gone. Rule 3 above exists for that reason.

Do not try to reproduce this on a machine that has anything open.
