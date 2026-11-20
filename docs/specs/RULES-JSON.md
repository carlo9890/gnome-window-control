# Spec: rules.json

Normative format and behaviour of the auto-placement rules file. This is the
authoritative definition; `README.md` shows users how to write one and links
here.

Two implementations follow it, and they are pinned to each other:

| Implementation | Where | Pinned by |
|---|---|---|
| The extension's grammar | `window-control@carlo9890.github.io/rules-format.js` (`compileRules`, `compileRule`, `matchPredicate`, `resolvePlaceRect`, `tileRect`, `centerRect`, `isDropInName`) | `tests/check-rules-format.js` |
| `wctl rules` | `cli/src/rules.rs` | the `rules_spec_vectors`, `geometry_vectors`, `match_vectors`, `min_width_vectors` and `dropin_vectors` tests in that file |

Both read the same cases from `tests/vectors/rules-spec.json`. Change this file,
both implementations and the vectors in **one commit**: a message or a formula
changed on one side alone fails the other side's check.

The window-touching half — when a rule is applied and what it does to a window
— is `rules.js`, what an overlay is while it is one is `overlay.js`, and the
GNOME 49 maximize API is `window-helpers.js`.

## Files

The rules come from one or more files. Every file has the format of the
[Document](#document) below.

| Property | Value |
|---|---|
| User file | `$XDG_CONFIG_HOME/gnome-window-control/rules.json`, `~/.config` when unset (`CONFIG_DIR`) |
| Drop-in folder | `CONFIG_DIR/rules.d/`. A tool that adds rules owns one file in it, for example `rules.d/revier.json`. |
| Encoding | UTF-8, parsed with `JSON.parse` — no comments, no trailing commas |
| Required | No. An absent file or folder means no rules from it. |

The extension creates `CONFIG_DIR` at `enable()`. It does not create
`rules.d`, and it never writes a file. `wctl rules add --file` creates a
missing `rules.d`.

### Drop-in files

A name in `rules.d` is a drop-in file when it matches
`^[A-Za-z0-9][A-Za-z0-9._-]*\.json$` (`isDropInName`, `is_drop_in_name`)
and the entry is a regular file after symlinks are followed. Any other entry
is skipped without a message. The pattern skips the temporary files a writer
renames into place (they start with `.`), editor backups (`revier.json~`) and
a file turned off by a rename (`revier.json.off`). A FIFO is skipped before it
is opened, because a read of a FIFO does not finish.

`rules.d` is not read recursively.

A writer writes a drop-in to a temporary name that starts with `.` in
`rules.d`, then renames it to its final name, so a reload never reads half a
file.

### Order

The rule list is `rules.json`, then each drop-in file in byte order of its
name. Names are ASCII, so byte order is the default string sort on both sides:
`10-a.json` is before `9-b.json`, `B.json` before `a.json`, and `a-b.json`
before `a.json`. The first match wins
([Matching and application](#matching-and-application)), so a rule in
`rules.json` wins over a drop-in rule for the same window. This is the
intended order: the user overrides a tool's rule in `rules.json` and never
edits the tool's file.

A file's rules stay together and in file order, so a `min_width` fallback
chain in one file stays one chain.

### Source label

A message about a rule names its file by a source label: `rules.json`, or
`rules.d/<name>` for a drop-in. `INDEX` and `rules[N]` count within one file.

## Document

The top level is an array of rule objects. `[]` is valid and means no rules.

```json
[
  { "match": { "class": "kitty" }, "tile": "left" },
  { "match": { "title": "Calculator" }, "center": "both", "monitor": 1 }
]
```

A rule object accepts exactly these keys (`RULE_KEYS`); any other key is an
error:

| Key | Type | Role |
|---|---|---|
| `match` | object | Which windows the rule applies to. Required. |
| `place` | array of 4 | Geometry action. At most one of `place`/`tile`/`center`. |
| `tile` | string | Geometry action. |
| `center` | string | Geometry action. |
| `workspace` | integer 0 to 2147483647 | Move the window to this workspace index. |
| `monitor` | integer 0 to 2147483647 | Monitor whose workarea the geometry resolves against, and the monitor the window is moved to. |
| `overlay` | boolean | `true` makes the window an overlay ([Overlay windows](#overlay-windows)). `false` is the same as no key. |

A rule MUST carry at least one of `place`, `tile`, `center`, `workspace`,
`monitor`, or `overlay` set to `true`. A rule with only `match`, or with only
`match` and `"overlay": false`, is an error.

Every index and every pixel value is bounded to a signed 32-bit integer, the
type mutter takes them as. A JSON number with a zero fraction is an integer:
`2.0` and `2e0` are `2`.

## match

Keys are selector kinds, plus `min_width`. Every key present must match, so
two keys are an AND.

| Key | Matches | Predicate kind |
|---|---|---|
| `class` | WM class, exact | `class` |
| `title` | title, exact | `title` |
| `substr` | title contains the value | `substring` |
| `title_prefix` | title starts with the value | `prefix` |
| `title_suffix` | title ends with the value | `suffix` |
| `class_prefix` | WM class starts with the value | `class_prefix` |

`MATCH_KINDS` maps these to `matchPredicate`. A value MUST be a non-empty
string. An empty `substr`, `title_prefix`, `title_suffix` or `class_prefix`
would match every window; an empty `class` or `title` would match only a window
that has none, so a rule carrying one could never usefully fire. All six are
refused with the same message rather than loaded as a rule that silently never
matches.

### min_width

`min_width` is a condition on the monitor, not on the window. Its value MUST be
an integer from 1 to 2147483647; `0`, a fraction and a string are refused
([Validation](#validation) has the message).

| Property | Value |
|---|---|
| Tested monitor | the rule's own `monitor`; else, before the first frame, the monitor `_preplace` predicts; once shown, the monitor a head start resolved against, else the monitor the window is on |
| Width compared | the monitor's logical width; not the workarea, which loses the panels. See below |
| Fits | width >= `min_width` (`fitsMonitor`, `fits_monitor`) |
| Tested monitor does not exist | the rule does not match, and a later rule can |

`min_width` names no window, so `match` still MUST name at least one of the
six keys above.

The logical width is `get_monitor_geometry(i).width`, the width `ListMonitors`
reports, divided by `get_monitor_scale(i)` and rounded when mutter's stage is
in physical pixels, and taken as it is when the stage is logical:

| Session | Stage | Decided by |
|---|---|---|
| X11, GNOME 45 to 49 (GNOME 50 has no X11 session) | physical | `Meta.is_wayland_compositor()` false |
| Wayland, GNOME 50 and later | logical | mutter's native backend is always logical |
| Wayland, GNOME 45 to 49 | logical only when `org.gnome.mutter` `experimental-features` holds `scale-monitor-framebuffer` | mutter's own test of that setting |

`wctl rules test` reads the same answer from the `layout-mode` property of
`org.gnome.Mutter.DisplayConfig.GetCurrentState` (1 logical, 2 physical,
absent physical), and asks only when a monitor's scale is not 1
(`rules::logical_width`, `Bus::stage_is_logical`).

The tested monitor depends on the rule, so it is decided for each rule in
turn: a rule with `"monitor": 1` tests monitor 1 wherever the window shows.

A rule with `min_width` before a rule without it is the fallback pattern:

```json
[
  { "match": { "class": "kitty", "min_width": 3000 }, "place": ["center", "top", "75%", "100%"] },
  { "match": { "class": "kitty" }, "place": ["center", "top", "100%", "100%"] }
]
```

### Absent keys

`focused`, numeric window ID and PID are deliberately absent: a static file
cannot name a window that does not exist yet. `matchPredicate` still supports
`pid` for the D-Bus callers. The D-Bus methods take `class`, `title`,
`substring` and `pid` only: `prefix`, `suffix` and `class_prefix` are
rules.json kinds.

## Geometry actions

`place`, `tile` and `center` are mutually exclusive within one rule. All three
resolve against the workarea (monitor rectangle minus panels and docks) of the
target monitor, never the monitor rectangle.

### place

`[X, Y, WIDTH, HEIGHT]`, exactly four elements, each a JSON string or number.
The two are equivalent; `resolvePlaceRect` coerces with `String`. An element of
any other type is an unresolvable token.

Resolution order is size first, then position, because the alignment keywords
need the resolved size.

| Token | Grammar | Resolves to |
|---|---|---|
| `WIDTH`/`HEIGHT` literal | `^[1-9][0-9]*$`, at most 2147483647 | that many pixels |
| `WIDTH`/`HEIGHT` percent | `^[0-9]+%$`, the number at most 2147483647 | `floor(workarea_size * percent / 100)`, which MUST be > 0 and at most 2147483647 |
| `X`/`Y` literal | `^-?[0-9]+$`, from -2147483648 to 2147483647 | that pixel coordinate |
| `X` keyword | `left` \| `center` \| `right` | `wa.x` \| `wa.x + trunc((wa.width - width) / 2)` \| `wa.x + wa.width - width` |
| `Y` keyword | `top` \| `center` \| `bottom` | `wa.y` \| `wa.y + trunc((wa.height - height) / 2)` \| `wa.y + wa.height - height` |

`trunc` cuts toward zero, so a window one pixel larger than the workarea
stays at offset 0, not -1. A percentage above 100 is allowed. A size of `0`, a percentage that floors to 0
pixels, a value outside the bounds, and a keyword belonging to the other axis
are errors.

### tile

A cell span of a 4-column by 2-row grid over the workarea (`TILE_CELLS`,
`tileRect`). Cell size floors, so a width not divisible by 4 leaves the
remainder at the right edge rather than stretching the last column.

`cell_w = floor(wa.width / 4)`, `cell_h = floor(wa.height / 2)`.

| Value | Columns | Rows |
|---|---|---|
| `top-left` | 0 | 0 |
| `top-center` | 1–2 | 0 |
| `top-right` | 3 | 0 |
| `left` | 0 | 0–1 |
| `center` | 1–2 | 0–1 |
| `right` | 3 | 0–1 |
| `bottom-left` | 0 | 1 |
| `bottom-center` | 1–2 | 1 |
| `bottom-right` | 3 | 1 |
| `wide-left` | 0–2 | 0–1 |
| `wide-right` | 1–3 | 0–1 |

`tile right` is the right column (`x = wa.x + cell_w * 3`), which differs from
`place` with `X: "right"`, an alignment of an independently sized window.

### center

`horizontal`, `vertical` or `both` (`CENTER_AXES`). Keeps the window's own
size and centres it on the named axes, leaving the other coordinate untouched
(`centerRect`).

## Validation

`wctl rules check` reports the verdict below without a running shell, reading
only the file:

```bash
wctl rules check [--file PATH] [--json]
```

It exits 0 when the shell would load the file and 1 when it would not, printing
the same message text. `cli/src/rules.rs` is what produces it. Without
`--file` it checks `rules.json` and every drop-in file, reports each one, and
exits 1 when any one is refused, although the shell still loads the others.

`compileRules` parses and validates one whole file before any rule of it takes
effect. The first problem throws and **no rule from that file is applied** — a
typo never leaves some rules of a file live and others not. The other files
still load. `WindowRules` logs the message at warning level, as
`<source label>: <message>; the rules of that file are off`, and runs without
that file's rules until a file changes.

A broken `rules.json` lets a drop-in rule win where a `rules.json` rule would
have won. A broken drop-in releases the overlays its rules made, at that load.

Messages name the offending key and index (`rules[0].tile: ...`) and never the
matched value, so a window title or WM class cannot reach the journal.

The checks of one rule run in this order, and the message names the first that
fails:

1. Unknown keys of the rule object, in JavaScript property order.
2. `match`: that it is an object, then its keys in JavaScript property order,
   then that it names at least one window predicate.
3. `place`, `tile` and `center`: that at most one is present, then its value.
4. `workspace`, `monitor`, `overlay`, in that order, whatever their file order.
5. That the rule has something to do.

JavaScript property order is array indices first, ascending, then the other
keys in file order. An array index is the decimal form of an integer from 0 to
4294967294, with no sign and no leading zero: `"1"` is one, `"01"` and
`"4294967295"` are not.

One verdict has two texts. A number too large for a double, such as `1e400`,
is refused by both: the extension reports it as the key's own message below,
`wctl rules check` as `not valid JSON`, because its parser refuses the number
before validation starts.

`wctl rules check` differs from the extension in three more cases, none of
which a file written by `wctl rules add` can contain:

| File content | Extension | `wctl rules check` |
|---|---|---|
| A lone surrogate escape in a string, such as `"\ud800"` | loads the rule | `not valid JSON` |
| A byte sequence that is not UTF-8 | loads the rule, with U+FFFD in its place | `Cannot read ...` |
| Arrays nested 200 levels deep | the key's own message | `not valid JSON` |

| Condition | Result |
|---|---|
| Top level not an array | `the top-level value must be an array of rules` |
| Rule not an object | `rules[N]: must be an object` |
| Unknown rule key | `rules[N].<key>: unknown key (use ...)` |
| `match` missing or not an object | `rules[N].match: must be an object` |
| `match` empty | `rules[N].match: must name at least one of class, title, substr, title_prefix, title_suffix, class_prefix` |
| Unknown `match` key | `rules[N].match.<key>: unknown key (use ...)` |
| `match` value not a string | `rules[N].match.<key>: must be a string` |
| `match` value empty | `rules[N].match.<key>: must not be empty` |
| `min_width` not an integer from 1 to 2147483647 | `rules[N].match.min_width: must be a positive integer` |
| Two or more of `place`/`tile`/`center` | `rules[N]: place, tile and center are mutually exclusive` |
| `place` not 4 elements | `rules[N].place: must be [X, Y, WIDTH, HEIGHT]` |
| A `place` token unresolvable | `rules[N].place: X is a number or left\|center\|right, ...` |
| `tile` not a string naming a grid position | `rules[N].tile: must be one of ...` |
| `center` not an axis | `rules[N].center: must be one of ...` |
| `workspace`/`monitor` not an integer from 0 to 2147483647 | `rules[N].<key>: must be a non-negative integer` |
| `overlay` not a boolean | `rules[N].overlay: must be a boolean` |
| Rule has no action | `rules[N]: has nothing to do (...)` |

`place` tokens are validated at load against `PROBE_WORKAREA`
(1000x1000, in `rules-format.js`), so a grammar error is caught before any
window exists. A
percentage valid there but resolving to 0 pixels, or to more than 2147483647,
on a real workarea is skipped at apply time instead.

## Matching and application

The first rule whose every predicate matches, and whose `min_width` the
tested monitor fits ([min_width](#min_width)), wins, in the [order](#order) of
the files and of the rules in each file. Later
matching rules are ignored. `wctl rules test <WINDOW>` reports which rule wins
for a live window, which later ones it shadows, and the rectangle the action
resolves to, without moving anything.

A rule applies **once per new window**, at the point mutter has shown it; on
GNOME 49 and later its frame is also handed to mutter before the first frame
(see the initial configuration below). The
window is untracked before the action runs, so a later title change or resize
never re-triggers it. This sets the initial placement only. The one part
decided again later is which windows are overlays
([Overlay windows](#overlay-windows)); `ApplyRules` applies the rules again
on request ([Applying the rules again](#applying-the-rules-again)).

Gating, in order:

1. A window still hidden and not yet `shown` is skipped — mutter's initial
   placement overrides a frame requested through the window before that, so a
   rule applied earlier would be discarded. The initial configuration below is
   the one earlier way in.
2. A shown window that is not `Meta.WindowType.NORMAL` matches no rule.
3. On a match, the action runs from a `GLib.idle_add` callback, not from inside
   the signal emission: a frame requested re-entrantly is overwritten when the
   outer move-resize continues.

Action order within `_apply`:

1. `overlay` — the window becomes an overlay, unless a load since the match
   dropped the rule ([Overlay windows](#overlay-windows)). It runs before the
   `monitor` check, so a missing monitor does not stop it.
2. `workspace` — `change_workspace_by_index(index, true)`. For an index beyond
   the last workspace mutter appends one workspace and moves the window there;
   it does not create the workspaces in between, so the window does not end on
   the rule's index (observed on GNOME Shell 50.1: rule index 7, window on
   index 2).
3. `monitor` — when the index is not below `get_n_monitors()`, the rest of
   the rule (the monitor move and the geometry) is skipped with a debug line.
   The workspace step has already run. Else `move_to_monitor(index)` moves
   the window at once: this move does not wait in the `WindowPlacer`. The
   move is the newest request for the window, so the request of a placement
   still waiting there is dropped, without running, when it puts the window
   on another monitor than `index`: a tile, a rectangle or a size alike. A
   waiting request for monitor `index` stays. The wait for the restore stays
   too, so a later request, this rule's geometry included, still waits for
   that restore.
4. Geometry — skipped when the window is fullscreen. The frame is requested
   through the `WindowPlacer` (`window-helpers.js`) that the keyboard shortcuts
   and the D-Bus geometry methods share:
   - A maximized window is unmaximized first, and the frame is requested after
     the next `size-changed` or `UNMAXIMIZE_SETTLE_MS`, whichever comes first,
     because a frame requested while the unmaximize is in flight is
     overwritten by the restored size. The rectangle resolves then, against
     the window as it is after the restore.
   - A shortcut, an apply, or a `Move`, `Resize` or `MoveResize` call for the
     same window before then replaces this request: only the newest one runs.
     A `MoveToMonitor` call or a rule's `monitor` drops it when the request's
     target monitor differs from the move's index (step 3).
   - The frame is requested as the program, not as the user
     (`move_resize_frame(false, ...)`). A window whose minimum size is above
     the rectangle grows to that minimum at the rectangle's position, kept on
     the screen while mutter's `require_fully_onscreen` holds (it does not
     once the window is partly off the screen). As a user operation, mutter would apply the minimum from the
     frame's old position, and the window would not move at all.
   - A rectangle whose largest overlap is with a monitor other than the
     window's own moves the window there with `move_to_monitor()` first. Only
     that call or a user operation makes mutter record the monitor it puts
     the window back on after a monitor change. For a rectangle on no
     monitor, `move_to_monitor()` is not called: mutter would name the
     primary monitor.

A window that matches nothing stays under evaluation for
`LATE_IDENTITY_GRACE_MS` after being shown, because a Wayland client's app ID
and first real title can arrive late. After that it is untracked, so a title
change hours later cannot rearrange a window the user has since placed. A shown
window that is not `NORMAL` matches nothing and gets the same period: a retype
to `NORMAL` within it gets the rule, one after it does not.

### Applying the rules again

`ApplyRules` (`wctl rules apply`) runs `applyRules` in `rules.js`: the rules
loaded now, applied to every window `list_all_windows()` returns, or to the one
window named.

A reload that is due (the `RELOAD_DEBOUNCE_MS` timer is armed) or a read that is
in flight is waited for first (`whenLoaded`), so a file saved just before the
call is applied as saved. A call still waiting at `disable()` raises
`Disabled`. A save whose file event has not reached the shell when the call
arrives is not waited for.

The `apply-rules` shortcut (`Super+Ctrl+KP_Multiply` by default) and the
top-bar menu item **Apply Rules Again** run the same steps for every window and
send no reply. A press still waiting at `disable()` is dropped instead of
raising `Disabled`.

For each window, in this order:

1. A window `_tracked` holds is skipped: its own apply or grace period is
   still running. A window whose placement waits for its unmaximize is not
   tracked: a rule with a geometry replaces that placement (step 4 above),
   and a rule's `monitor` can drop it (step 3 above). A rule with neither,
   such as one with only `workspace`, leaves it to land.
2. A window that has not been shown is skipped: mutter's initial placement
   would override the frame. `ApplyRules` decides this with the service's
   own record of first shows (`_isUnshown`).
3. The winning rule is decided as for a shown window: `NORMAL` only, first
   match wins, `min_width` against the rule's `monitor`, else
   `get_monitor()`.
4. The window stops being an overlay unless the winning rule has `overlay`.
5. A matched window goes through `_apply`, with the action order above,
   except that a `workspace` at or past `get_n_workspaces()` is skipped with a
   debug line: mutter would append one more workspace at each apply. A
   minimized window keeps its minimized state.

The reply counts the windows of step 5.

### Initial configuration (GNOME 49 and later)

On GNOME 49 and later, `_preplace` handles `Meta.Window`'s `configure` signal
and writes the frame of the matching rule into the window's initial
`Meta.WindowConfig`. Mutter then marks the window placed, skips its own
placement and asks the client for that size, so the first frame is drawn in
place.

This is a head start, not the application: the gating and the action order
above still run once the window is shown, and correct a client that committed
another size. `_preplace` sets nothing, and leaves the window to that later
step, when:

- the configuration is not the initial one;
- the window is an X11 client: mutter reads the frame back as the client's size
  hints there, and a server-side decorated window comes out larger by its title
  bar;
- the window is not `NORMAL`, or it is fullscreen or maximized;
- no rule matches yet — an app ID or title that arrives after the first commit;
- the rule has no geometry, or its geometry is `center`, which needs a size the
  window does not have yet;
- the rule's `monitor` does not exist, or the tokens resolve to nothing.

A rule without `monitor` resolves against the monitor mutter's own placement
would pick: the parent's for a window that has one, else
`get_current_monitor()`. Once shown, the same rule resolves against that
monitor again, not the one the window is on: literal coordinates can put the
frame on another monitor, whose workarea would resize it. `workspace` is not
part of the initial configuration; the window moves there once shown.

The rule is matched twice, at the first commit and once shown. The head start
cannot be taken back: when the title changes in between so that another rule,
or none, wins once shown, the window keeps the first rule's frame unless the
winning rule has a `place` or a `tile`. A winning `center` moves the window and
keeps the size the first rule set.

Mutter 48 has the signal but applies the handler's values through a different
code path, unverified here, so `PLACES_BEFORE_FIRST_FRAME` in `rules.js` is
false below 49.

## Overlay windows

A window whose winning rule has `"overlay": true` is an overlay. The rule's
other keys apply as for any rule; `overlay` adds the behaviour below.

**Which windows are overlays.** Unlike the rest of a rule, which applies once
to a new window and again at `ApplyRules`, membership is decided:

1. when a rule is applied to a new window (`_apply`), before its other keys;
2. at every load of the file, for every open `NORMAL` window
   (`_syncOverlays`): a window whose winning rule has `overlay` becomes an
   overlay, every other window stops being one. This is what keeps an overlay
   one after the extension is enabled again;
3. at `ApplyRules`, for each window it reaches
   ([Applying the rules again](#applying-the-rules-again)), as at a load.

A load matches each open window by its class and title at that moment. A
title change between loads does not change membership, but the next load can:
match an overlay by class to keep it stable. A window stops being
an overlay when it is unmanaged, when a load or `ApplyRules` no longer makes
it one, and at `disable()`.

**While a window is an overlay** (`WindowOverlays.add`):

| Effect | How |
|---|---|
| Above the other windows | `make_above()`, only when the window is not above already |
| Out of Alt+Tab, the overview and the workspace thumbnails | the window object's `skip_taskbar` property, under both JS names (`skip_taskbar`, `skipTaskbar`), reads `true`. Mutter's own skip-taskbar state is left unset, because a window with it set cannot minimize, and no `notify::skip-taskbar` is emitted, because the shell's app tracking counts an app's windows on that signal from mutter's state. A window that becomes an overlay while the overview is open stays in it until the overview opens again. The dash and the app grid list apps, so they still show the window's app. |
| Hidden when another window takes the focus | below |
| Hidden when the overview has opened | on the overview's `shown`. `showing` is too early: a touchpad gesture emits it as it starts, and the user can still cancel the gesture. |

A hide is a minimize without the animation (`minimizeWindow` in
`window-helpers.js`). A minimized overlay stays minimized until a caller shows
it, for example with `ActivateNoAnimation`. A window that mutter does not let
minimize (`can_minimize()` false, as for a client that sets skip-taskbar
itself) stays shown, with a debug line.

**Focus loss.** On each change of the display's focus window, a pending hide
of an overlay that is minimized or not on the active workspace is cancelled
(one on another workspace is out of sight, and a move there takes its focus).
For every other overlay:

| New focus window | Result |
|---|---|
| The overlay, or a window whose transient chain leads to it | a pending hide is cancelled |
| None | nothing: the shell's menus, its dialogs and a click on the empty desktop take no window focus. With a desktop-icons extension the desktop is a window, and a click on it is a turn to another window. |
| Any other window | a hide is armed for `FOCUS_LOSS_GRACE_MS`, replacing a pending one, so each turn to another window starts the period again. When it fires, the overlay is hidden only when a window outside the overlay and its dialogs holds the focus then. |

`ListDetailed` reports `is_overlay: true` for an overlay. Its
`is_skip_taskbar` stays mutter's own state, `false`.

**Release** (`WindowOverlays.remove`) cancels a pending hide, removes the
`skip_taskbar` overrides, and calls `unmake_above()` only when the overlay set "above" and
nothing changed "above" since. A window the user or the client set above,
before or during the overlay, stays above. Release moves, shows and hides nothing. The focus and
overview handlers are connected only while there is an overlay.

## Reload

A `Gio.FileMonitor` on `CONFIG_DIR`, not on `rules.json`, so an editor that
saves by rename is still seen, and a second one on `rules.d`. An event for the
name `rules.json` or for any name in `rules.d` schedules a reload. An event for
the name `rules.d` in `CONFIG_DIR` (the folder is created, deleted, renamed or
a symlink to it is changed) replaces the `rules.d` monitor and schedules a
reload, so a `rules.d` created after `enable()` is watched. Events are
debounced by `RELOAD_DEBOUNCE_MS` into one reload. A reload reads every file
again and replaces the whole rule set once, after the last read has landed. It
affects windows created
afterwards; which open windows are overlays is decided again at each load
([Overlay windows](#overlay-windows)). No restart is needed.

When `rules.json` or a drop-in file is a symlink, an edit to its target is not
seen: it raises no event on the watched folder. `touch -h ~/.config/gnome-window-control/rules.json`
raises one and reloads the file; disabling and enabling the extension reads it
again too.

The read at `enable()` and every reload are asynchronous (`WindowRules._load`),
so the rule set changes when the read lands: a window created between
`enable()` and the first read landing is not placed. A newer read and
`disable()` cancel the one in flight, and a cancelled read changes nothing.

A file that is absent, that cannot be read, or that does not validate adds no
rules until a file changes; the other files still load. A `rules.d` that
cannot be listed is logged, and `rules.json` still loads. A folder that cannot
be watched is logged, and its files are then read only at `enable()` and at a
reload that the other monitor starts.

`window-created` is connected only while at least one rule is loaded, so an
absent or empty file costs nothing per window.

## Timing constants

Defined at the top of the file named; change them there, not here.

| Constant | Guards | File |
|---|---|---|
| `LATE_IDENTITY_GRACE_MS` | late Wayland app ID / title; README.md's "Resetting windows to their rules" quotes its value | `rules.js` |
| `RELOAD_DEBOUNCE_MS` | one reload per save | `rules.js` |
| `FOCUS_LOSS_GRACE_MS` | a focus that comes straight back, as wl-copy and wl-paste hand it; README.md's "Overlay windows" quotes its value | `overlay.js` |
| `UNMAXIMIZE_SETTLE_MS` | a restore that reports no size change | `window-helpers.js` (`UnmaximizeWait`) |

## Capabilities

Rules are applied by the extension alone. The format is not part of the D-Bus
interface and carries no version field. A caller learns what the extension
reads from `GetCapabilities`, not from the version number. An extension that
supports a feature MUST report its name:

| Feature | Capability name |
|---|---|
| applies rules at all | `rules` |
| `title_prefix`, `title_suffix` | `rules-title-affix` |
| `class_prefix` | `rules-class-prefix` |
| `overlay` | `rules-overlay` |
| `min_width` | `rules-min-width` |
| serves `ApplyRules` | `rules-apply` |
| reads `rules.d` | `rules-dropin` |

An extension without the name of a key refuses a file that uses the key. One
without `rules` ignores the file. One without `rules-dropin` ignores the folder
and gives no error, so a tool that writes a drop-in checks this name first.

## Extending the format

Adding a key means editing, in one commit, on BOTH sides:

- `rules-format.js`: `RULE_KEYS` and `compileRule` for a rule key, or
  `MATCH_KINDS` and `matchPredicate` for a match key.
- `cli/src/rules.rs`: `RULE_KEYS` and `compile_rule`, or `MATCH_KEYS` and
  `Rule::matches_window`.
- For a rule key, how it is applied: `_apply` in `rules.js`, and `Rule`,
  `Action` and `Rule::resolve` in `cli/src/rules.rs`.
- For a match key, `shadows` in `cli/src/commands/rules.rs`. A key that is
  no window predicate, as `min_width`, is handled before `MATCH_KINDS` in
  `compileRule` and before `MATCH_KEYS` in `compile_rule`, and is read in
  `_matchIndex` in `rules.js` and in `test` in `cli/src/commands/rules.rs`.
- A case in `tests/vectors/rules-spec.json`.
- Its capability name ([Capabilities](#capabilities)): in `CAPABILITIES` in
  `dbus-service.js`, and in `NEWER_MATCH_KEYS` (a match key) or `NEWER_RULE_KEYS` (a rule key) in
  `cli/src/commands/rules.rs`, which makes `wctl rules` warn when the loaded
  extension refuses the file.
- For a key that `wctl rules add` takes as a flag: the flag in
  `cli/src/commands/rules.rs`, `cli/src/help.rs` and both files in
  `cli/completions/`.
- This spec's rule-object and validation tables, and the README section.
- For a key with its own capability name, a row in [Capabilities](#capabilities)
  and in README.md's "Keys that need a newer extension" table.

Run the checks that
[TESTING.md](../TESTING.md#minimum-checks-before-a-pr) requires: the vector
file is the fixture both sides read.
