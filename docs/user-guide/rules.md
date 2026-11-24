# Automatic window placement

![Two rules are added with wctl rules add; the logs and chat windows open in place, are moved away, and Super+Ctrl+numpad * puts them back](../images/demo-rules.gif)

The extension can place a window the moment it is shown, so it opens where you
want it without a `wctl` call. Rules live in
`~/.config/gnome-window-control/rules.json`, a JSON array read at enable and
re-read whenever the file changes (no restart needed). The file is optional; with
no file, nothing happens. Edit it with any text editor, with
[`wctl rules`](#managing-rules-from-the-command-line), or on the Rules page of
the [preferences window](shortcuts.md#preferences-window-and-top-bar-icon).

Each rule names the windows it matches and one placement, in the same vocabulary
as the `wctl` commands:

```json
[
  { "match": { "class": "kitty" },        "tile": "left" },
  { "match": { "substr": "Report" },      "place": ["right", "top", "50%", "100%"] },
  { "match": { "title": "Calculator" },   "center": "both", "monitor": 1 },
  { "match": { "class": "Slack" },        "workspace": 2 }
]
```

- **match** — one or more of `class` (exact WM class), `title` (exact title),
  `substr` (title contains), `title_prefix` (title starts with),
  `title_suffix` (title ends with), `class_prefix` (WM class starts with, for
  apps that put a per-window part in the class, such as a Chrome app window's
  `chrome-github.com__<owner>_<repo>-Default`). Several keys must all match.
  `match` can also hold `min_width`: see [Rules per monitor size](#rules-per-monitor-size).
- **place** — `[X, Y, WIDTH, HEIGHT]`, the tokens of `wctl place`: X is a number
  or `left|center|right`, Y a number or `top|center|bottom`, WIDTH/HEIGHT a
  positive number or a percentage like `50%`.
- **tile** — a `wctl tile` position (`left`, `top-right`, `center`, ...).
- **center** — `horizontal`, `vertical`, or `both`; keeps the window's own size.
- **workspace** — a workspace index; the window is moved there. An index beyond
  the last workspace adds one workspace at the end and puts the window there;
  the workspaces up to that index are not created.
- **monitor** — a monitor index; the workarea that `place`/`tile`/`center`
  resolve against, and where the window is placed. When that monitor does not
  exist, for example on an undocked laptop, the window is not moved or placed;
  only `workspace` and `overlay` apply.
- **overlay** — `true` makes the window an overlay: see
  [Overlay windows](#overlay-windows).

`place`, `tile` and `center` are mutually exclusive in one rule; combine any of
them with `workspace`, `monitor` and `overlay`. The first matching rule wins, in
file order ([rules.json first](#drop-in-files-rulesd)), and applies once per new window; `wctl rules apply` applies the
rules to the open windows again.

On GNOME 49 and later a `place` or `tile` rule takes effect before the window
is drawn, so it opens in place. On GNOME 45 to 48, and for `center`,
`workspace`, an X11 application, or a window whose class or title arrives late,
the window appears first and moves a moment later.

This sets the *initial* position only: an app that resizes itself afterwards is
left alone until you run `wctl rules apply` ([Resetting windows to their
rules](#resetting-windows-to-their-rules)). A rule with a bad value is reported to the journal and the whole file
is ignored until you fix it, so one typo never places a window half-right.

## Drop-in files (rules.d)

A tool that adds rules of its own writes them to one file in
`~/.config/gnome-window-control/rules.d/`, for example `rules.d/revier.json`,
and never edits `rules.json`. Each drop-in file has the format of `rules.json`.

- The rules are `rules.json`, then each drop-in file in byte order of its name.
  The first match wins, so a rule in `rules.json` wins over a drop-in rule for
  the same window: override a tool's rule there.
- A name is read when it is letters, digits, `.`, `_` and `-`, starts with a
  letter or a digit, and ends in `.json`. A file that starts with `.`, ends in
  `~` or is renamed to `.json.off` is skipped. Subfolders are not read.
- A file with a bad value is ignored on its own; the other files still load.
- A tool writes the file to a temporary name that starts with `.` in
  `rules.d`, then renames it into place, so the extension never reads half a
  file. Check it first with `wctl rules check --file <PATH>`, and check that
  `wctl version --json` lists `rules-dropin`: an older extension ignores
  `rules.d`.

`wctl rules path --dir` prints the folder. `wctl rules add --file <PATH>`
with a path in `rules.d` writes a drop-in file and creates a missing
`rules.d`; `wctl rules remove --file <PATH>` removes a rule from one.

## Rules per monitor size

`"min_width": <pixels>` in `match` makes a rule match only when the monitor it
places the window on is at least that many logical pixels wide. Put it before a
rule without it, and the second rule is the fallback on a smaller monitor:

```json
[
  { "match": { "class": "kitty", "min_width": 3000 }, "place": ["center", "top", "75%", "100%"] },
  { "match": { "class": "kitty" },                    "place": ["center", "top", "100%", "100%"] }
]
```

- The monitor tested is the rule's own `monitor`, else the monitor the window
  opens on.
- Logical width is the width after scaling: a 3840 px panel at 200% is 1920
  wide, in a Wayland or an X11 session. `wctl monitors` shows the logical
  width on Wayland with GNOME 50 or fractional scaling, and the physical width
  otherwise.
- When the rule's `monitor` does not exist, a rule with `min_width` does not
  match, so the next rule can.
- `wctl rules add ... --min-width 3000` writes the key.

`min_width` needs a newer extension: see the
[capability table](#keys-that-need-a-newer-extension).

## Overlay windows

![An overlay rule is added; the quake window drops in at the top, hides when another window takes the focus, and comes back on a shortcut](../images/demo-overlay.gif)

A rule with `"overlay": true` makes each window it matches behave like a
drop-down terminal or a launcher popup:

- It stays above the other windows.
- It is left out of Alt+Tab and the overview. The dash still shows its app.
- It is minimized, with no animation, once another window has held the focus
  for a quarter of a second, and when the overview has opened. A dialog of
  the overlay itself and a shell menu leave it where it is. A click on the
  empty desktop leaves it too, unless a desktop-icons extension (Ubuntu's
  default) draws the desktop: then the click hides it.

Show it again from a keyboard shortcut. An overlay rule needs no placement, and
can carry one:

```bash
wctl rules add -c quake place center top 100% 40% --overlay
# Bind this command to a key in Settings > Keyboard > Custom Shortcuts:
sh -c 'wctl unminimize -c quake --no-animation; case $? in 0) wctl activate -c quake ;; 2) exec kitty --class quake ;; esac'
```

Give the overlay a class of its own: every window the rule matches becomes an
overlay. Unlike a placement, the overlay part of a rule also holds for the
windows already open when the file loads, so an overlay stays one after the
extension is enabled again, and a window stops being one when you remove the
rule. Match an
overlay by class: each load checks a title rule against the title a window has
then.
`wctl info` lists `overlay` among a window's states, and `wctl list --json`
reports `is_overlay`.

## Managing rules from the command line

`wctl` writes and reads the file, so you need not edit JSON by hand:

```bash
wctl rules add -c kitty tile left               # Tile every kitty window left
wctl rules add -s Report place right top 50% 100%
wctl rules add -t Calculator center both --monitor 1 --workspace 2
wctl rules add -c Slack --workspace 2            # Only move it to a workspace
wctl rules add -c quake --overlay                # Make it an overlay window
wctl rules list                                 # Every rule, rules.json and rules.d
wctl rules remove 0                             # Drop a rule by index
wctl rules path                                 # Where the file lives
wctl rules path --dir                           # Where rules.d lives
```

```console
$ wctl rules list
SOURCE               INDEX  MATCH             ACTION                     WORKSPACE  MONITOR  OVERLAY
rules.json           0      class=kitty       tile left
rules.json           1      substr=Report     place right top 50% 100%
rules.json           2      title=Calculator  center both                2          1
rules.d/revier.json  0      class=quake       place center top 100% 40%                      yes
```

`SOURCE` names the file, and `INDEX` counts within it: `remove` and
`add --at` use that index, with `--file` for a drop-in file. A file that does
not load is left out of the table with a warning, as the extension leaves it
out; without a drop-in file, a broken `rules.json` is an error. `list --json`
prints `rules.json` alone, and `--file` makes every subcommand act on that one
file.

A rule matches with `-c <CLASS>`, `-t <TITLE>`, `-s <SUBSTR>`,
`--title-prefix <TEXT>`, `--title-suffix <TEXT>` or `--class-prefix <TEXT>`
only. A window ID, `focused`
and `-p <PID>` name a window that already exists, and a rule is evaluated
against windows that do not exist yet, so those are refused.

`add` validates the action through the same grammar `wctl tile` and `wctl place`
use, appends unless `--at <N>` names a position, and writes atomically. A file
that does not parse or does not validate is never rewritten, so a hand-edited
file with a typo in it is not clobbered. `--dry-run` prints the document it
would write and changes nothing. Because the first matching rule wins, `add`
warns when an earlier rule already matches everything the new one would.

If `rules.json` is a symbolic link, for example into a dotfiles repository,
`add` and `remove` write the linked file and keep the link, and the extension
loads the change. The extension watches the directory of `rules.json`, not the
linked file, so an edit you make to the linked file is not seen. Run
`touch -h ~/.config/gnome-window-control/rules.json` after such an edit, or
disable and enable the extension, to load it.

Rules are applied only by an extension that reports the `rules` capability
(`wctl version --json` lists it). When the running shell has an older one
loaded, `add` and `remove` still write the file but warn that no rule will be
applied until you install the newer extension and restart the shell. With no
shell running, and with a `--file` the extension does not read, they say
nothing.

### Keys that need a newer extension

Some keys need a capability beyond `rules`. An extension that does not report
it refuses a file that has the key and applies no rule from that file; `add` and
`remove` warn about that too.

| Key | Capability |
|-----|------------|
| `title_prefix`, `title_suffix` | `rules-title-affix` |
| `class_prefix` | `rules-class-prefix` |
| `overlay` | `rules-overlay` |
| `min_width` | `rules-min-width` |

## Checking the file

Because one bad value disables every rule, check the file rather than saving it
and watching whether windows move:

```bash
wctl rules check                      # the configured file
wctl rules check --file ./draft.json  # any file
wctl rules check --json               # for a script
```

```console
$ wctl rules check
/home/you/.config/gnome-window-control/rules.json: 3 rules, valid

$ wctl rules check
Error: rules[1].tile: must be one of top-left, top-center, top-right, left, center, right, bottom-left, bottom-center, bottom-right, wide-left, wide-right
```

It exits 0 when the shell would load the file and 1 when it would not, and the
message is the same one the extension writes to the journal. It reads only the
file: no D-Bus, and it works with the extension stopped or not installed.

With drop-in files and no `--file`, it checks `rules.json` and each drop-in
file, prints one line per valid file and an `Error:` line with the path per
broken one, and exits 1 when any file is broken. A missing `rules.json` reads
`No rules file at <path>`. It warns when a rule of an earlier file matches
every window a rule of a later file would. With `--json`, the top-level
fields describe `rules.json` alone, and a `dropins` array holds each drop-in
file's `path`, `valid` and `rules` or `error`.

## Why did a rule not fire?

```bash
wctl rules test -c kitty
```

```console
$ wctl rules test -c kitty
Window 4152763  class=kitty  title=vim
Matched rule 0: class=kitty -> tile left
  rule 2 also matches but is shadowed: class=kitty -> tile right
  monitor 0, workarea 0,27 1920x1053
  would place at 0,27 480x1052
```

It names the rule that wins, any later rule the first-match-wins order makes
dead, the workarea used, and the exact rectangle the action resolves to. When
the rule names a monitor that does not exist, it says the extension skips the
rest of the rule and exits 0; with `--json`, `workarea` and `target` are `null`
and `"skipped"` is `"no such monitor"`. For a fullscreen window it says the
extension skips the geometry; with `--json`, `target` is `null` and `"skipped"`
is `"fullscreen"`. It
needs the extension running, because it resolves a live window. It never moves
anything. Against an extension that does not report the `rules` capability it
exits 5 instead, because that extension ignores the file. It also exits 5 when
the file uses a key whose capability in the
[capability table](#keys-that-need-a-newer-extension) the extension does
not report, because that extension refuses the whole file.

Without `--file` it tests the rules of every file the extension loads. A
drop-in rule reads `Matched rule 0 of rules.d/revier.json: ...`, and `--json`
adds `matched_source` and `shadowed_sources`, the source of `matched` and of
each `shadowed` index. A file that does not load is left out with a
warning, as the extension leaves it out; without a drop-in file, a broken
`rules.json` is still an error. A file the extension refuses for a key it does
not know is left out with a warning too, except a refused `rules.json` that is
the only file taking part: that still exits 5. Against an extension that does
not report `rules-dropin`, only `rules.json` takes part, with a warning, and a
broken `rules.json` is an error. `rules apply` checks the files the same way.

## Resetting windows to their rules

```bash
wctl rules apply             # every open window
wctl rules apply -c kitty    # one window
```

The numpad `*` shortcut does the same from the keyboard: see
[Keyboard shortcuts](shortcuts.md#keyboard-shortcuts).

The extension applies the rules it has loaded again, as it does to a new
window: the first matching rule wins, and `min_width` tests the monitor the
window is on now. Use it after you moved windows by hand, or after you docked
or undocked a laptop.

- A maximized window is restored first, then placed. A shortcut, a rule
  apply, or a `move`, `resize`, `move-resize`, `place`, `tile` or `center`
  for the same window before the restore lands replaces this placement: the
  newest request wins. A `move-to-monitor` or a rule's `monitor` drops it when
  it was made for another monitor, and the window keeps its restored size
  there.
- A minimized window is placed and stays minimized.
- A fullscreen window gets its `workspace` and `monitor`, but no geometry.
- A `workspace` that does not exist is skipped, so each apply does not add
  one more workspace.
- A window that no rule matches is not touched.
- A window that opened in the last two seconds and still waits for its
  rule is skipped.
- A rule matches the title a window has now, which can differ from its title
  when it opened.

It prints how many windows a rule matched. It reads the rules file first and
stops on a file the extension would refuse, as `rules check` does. It exits 5
when the loaded extension does not report `rules-apply`, or refuses a key the
file uses. It reads the rules the extension has
loaded, so it takes no `--file`. A change you saved just before, with an
editor or `wctl rules add`, is read first and then applied.

The complete format, the token grammar, the tile grid and every validation rule
are specified in [docs/specs/RULES-JSON.md](../specs/RULES-JSON.md).
