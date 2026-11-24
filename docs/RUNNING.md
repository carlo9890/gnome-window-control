# Running

Call the Skill tool with `run` for the generic launch-and-drive flow.
**Local delta:** everything below wins where the two disagree. The automated
suites are [TESTING.md](TESTING.md)'s; logs are [MONITORING.md](MONITORING.md)'s.

The project supports Wayland only.

## Hard rules

1. **Ask the user's explicit consent before each start, kill or restart of a
   GNOME Shell**, nested and headless included. Name the exact command and
   wait. One approval covers one start. "Verify the change in a running shell"
   is not consent. The one exception is a throwaway VM made for the current
   task; a guest that is kept needs consent for each run, its reboot included.
2. **Never `pkill`, `killall` or kill a shell by name**: the pattern matches the
   real shell. Stop only the PID the start script printed, with `kill <pid>`;
   for a headless shell, that is `HEADLESS_SHELL_PID`.
3. **Start a nested shell only with `scripts/start-nested.sh`**, and a headless
   one only with `scripts/start-headless.sh`. A hand-started mutter registers
   with the real session and can log the user out.
4. **Never reproduce a nested-shell logout on a machine with open work.** Use a
   throwaway VM.
5. **Check headlessly first.** Extension logic that a fake window can drive is
   verified by the `gjs -m` checks in [TESTING.md](TESTING.md). Start a shell
   only for behaviour that needs a compositor.

## Reload after a code change (required)

`gnome-extensions disable`/`enable` does NOT reload JavaScript from disk. A
change to the extension's `*.js`, `metadata.json` or a new file needs a new
shell. A change under `cli/` needs `mise run build` only.

The real session loads new code only after the user logs out and in. Ask the
user to do it: a logout also ends the agent's session.

To test new code without a logout, with consent under hard rule 1:

```bash
./scripts/build.sh install
./scripts/start-nested.sh      # prints the PID, the log, the display and the bus address
# in a second terminal, after exporting what the script printed:
gdbus call --session --dest org.gnome.Shell --object-path /org/gnome/Shell \
  --method org.gnome.Shell.Extensions.EnableExtension window-control@carlo9890.github.io
```

- Enable over D-Bus. `gnome-extensions enable` writes the real dconf, the real
  shell reacts, and it has left the real session's extension INACTIVE.
- A shell without `--nested` (GNOME 50) makes `start-nested.sh` refuse: use the
  [headless session](#headless-session-no-window-on-the-real-screen).
- To get the nested bus address again, read it from the process:
  `tr '\0' '\n' < /proc/$(pgrep -f '^gnome-shell --nested')/environ | sed -n 's/^DBUS_SESSION_BUS_ADDRESS=//p'`.

### Pitfalls in a nested or headless shell

- **It starts in the Activities overview**, where workspace activation is
  ignored. Close it before testing:

  ```bash
  gdbus call --session --dest org.gnome.Shell --object-path /org/gnome/Shell \
    --method org.freedesktop.DBus.Properties.Set org.gnome.Shell OverviewActive '<false>'
  ```

- **Clients are slow under software rendering.** kitty takes up to 6 s to show
  its first frame, and a window not yet shown ignores geometry requests. Use
  `wctl wait`, not a `wctl list` poll.
- **Fake a second monitor** in a nested shell:
  `MUTTER_DEBUG_NUM_DUMMY_MONITORS=2 ./scripts/start-nested.sh`. It is the
  only way to test `move-to-monitor` across monitors and the
  `workspaces-only-on-primary` refusal. A headless shell has one virtual
  monitor.
- **Dynamic workspaces shift indices.** GNOME removes an empty workspace you
  switch away from. Anchor a window on the first workspace before a workspace
  move.

## Headless session: no window on the real screen

```bash
./scripts/start-headless.sh 1920x1080
```

- Export every variable the script prints, `HEADLESS_SCRATCH` included, in the
  terminal that runs the suites.
- Enable the extension over D-Bus and close the overview, as above.
- Open one window first (`kitty &`): the query suites need one.
- Inject keys with `tests/inject-keys.js`. `wtype` and `ydotool` do not work:
  mutter has no virtual-keyboard protocol, and the headless backend sees no
  evdev device.

## Real session in a VM guest

The one path that tests the install itself and another GNOME version without
touching this desktop.

Prepare the guest once:

- Install `openssh-server`, `kitty` and `jq`.
- Set `AutomaticLoginEnable=true` and `AutomaticLogin=<user>` under `[daemon]`
  in `/etc/gdm3/custom.conf`, so a session exists after each boot.
- Run `gsettings set org.gnome.desktop.session idle-delay 0` and
  `gsettings set org.gnome.desktop.screensaver lock-enabled false`. The lock
  screen removes the keyboard shortcuts, and the keybinding suite then fails.

Per run, from this checkout (`<guest>` is the SSH host):

```bash
./scripts/build.sh all && mise run build
rsync -a --exclude .git --exclude cli/target ./ <guest>:~/gnome-window-control/
rsync -aR cli/target/release/wctl <guest>:~/gnome-window-control/   # -R creates the excluded path
ssh <guest> 'cd gnome-window-control && gnome-extensions install --force dist/window-control@carlo9890.github.io_v*.zip'
ssh <guest> sudo systemctl reboot     # a JS or schema change needs a new session
```

Without sudo in the guest, reboot through its session bus:
`gdbus call --session --dest org.gnome.SessionManager --object-path /org/gnome/SessionManager --method org.gnome.SessionManager.Reboot`.

Then on the guest:

```bash
export XDG_RUNTIME_DIR=/run/user/$(id -u) DBUS_SESSION_BUS_ADDRESS=unix:path=/run/user/$(id -u)/bus \
       WAYLAND_DISPLAY=wayland-0 PATH=/usr/bin:$PATH
gnome-extensions enable window-control@carlo9890.github.io   # the guest's own dconf
kitty --title probe &
WCTL_TEST_SETTLE=1.0 ./tests/run-all-query-tests.sh
WCTL_TEST_SETTLE=1.0 ./tests/run-all-modification-tests.sh
```

- `PATH=/usr/bin:$PATH` puts the system `jq` first. A mise shim refuses to run
  in the copied checkout, whose `.mise.toml` is untrusted, and every JSON
  assertion fails.
- Build `wctl` in the guest when its glibc is older than the host's.

## Record the demo GIFs

Run `scripts/demo/record.sh` only in a throwaway VM guest's desktop session.

Prepare the guest as above, without the reboot for the suites, then:

- Install the tools the header of `record.sh` names (fonts:
  `fonts-jetbrains-mono`, `fonts-inter`), the extension zip, and `wctl` on `PATH`.
- Give the desktop the look of the GIFs, then reboot once:

  ```bash
  gnome-extensions enable window-control@carlo9890.github.io   # the guest's own dconf
  gsettings set org.gnome.shell disabled-extensions "['ubuntu-dock@ubuntu.com', 'ding@rastersoft.com']"
  gsettings set org.gnome.desktop.interface color-scheme prefer-dark
  gsettings set org.gnome.desktop.interface accent-color purple
  gsettings set org.gnome.desktop.background picture-uri-dark "file://$HOME/gnome-window-control/scripts/demo/wallpaper.svg"
  gsettings set org.gnome.desktop.background picture-options zoom
  gsettings set org.gnome.desktop.notifications show-banners false
  ```

- Stop the SPICE agent, which resets the screen size to the host viewer's:
  `sudo systemctl stop spice-vdagentd.service spice-vdagentd.socket; pkill -x spice-vdagent`.
- Set the screen to 1920x1080 at scale 1.5. The guest offers no 1280x720 mode.
  `<SERIAL>` is the first value `GetCurrentState` on the same object returns:

  ```bash
  gdbus call --session --dest org.gnome.Mutter.DisplayConfig \
    --object-path /org/gnome/Mutter/DisplayConfig \
    --method org.gnome.Mutter.DisplayConfig.ApplyMonitorsConfig <SERIAL> 1 \
    "[(0, 0, 1.5, 0, true, [('Virtual-1', '1920x1080@60.000', @a{sv} {})])]" "@a{sv} {}"
  ```

Then, on the guest's session bus as for the suites:

```bash
for scene in wctl keyboard rules overlay; do ./scripts/demo/record.sh --real-session-ok "$scene"; done
```

Copy the GIFs back and look at a few frames of each before you commit them.

## Drive it

```bash
gnome-extensions info window-control@carlo9890.github.io   # installed and enabled?
W=cli/target/release/wctl
$W list
$W info <ID> --json          # read the state back after a command
gdbus call --session --dest org.gnome.Shell \
  --object-path /org/gnome/Shell/Extensions/WindowControl \
  --method org.gnome.Shell.Extensions.WindowControl.ListDetailed
./scripts/debug-dbus.sh      # every method once; refuses the login bus
```

To reproduce a bug or verify a change: reload the current code, open a target
window (`kitty --title test &`), run the exact `wctl` command or D-Bus call,
and compare `frame_rect` from `$W info <ID> --json`.
