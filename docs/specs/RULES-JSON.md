# Spec: rules.json

Normative format and behaviour of the auto-placement rules file. This is the
authoritative definition; `README.md` shows users how to write one and links
here.

Two implementations follow it, and they are pinned to each other:

| Implementation | Where | Pinned by |
|---|---|---|
| The extension's grammar | `window-control@carlo9890.github.io/rules-format.js` (`compileRules`, `compileRule`, `matchPredicate`) | `tests/check-rules-format.js` |
| `wctl rules` | `cli/src/rules.rs` | the `rules_spec_vectors` test in that file |

Both read the same cases from `tests/vectors/rules-spec.json`. Change this file,
both implementations and the vectors in **one commit**: a message or a formula
changed on one side alone fails the other side's check.

The window-touching half — when a rule is applied and what it does to a window
— is `rules.js`, and the GNOME 49 maximize API is `window-helpers.js`.

## File

| Property | Value |
|---|---|
| Path | `$XDG_CONFIG_HOME/gnome-window-control/rules.json`, `~/.config` when unset (`CONFIG_DIR`) |
| Encoding | UTF-8, parsed with `JSON.parse` — no comments, no trailing commas |
| Required | No. An absent file means no rules. |

The extension creates the directory at `enable()` and never writes the file.

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
| `workspace` | integer ≥ 0 | Move the window to this workspace index. |
| `monitor` | integer ≥ 0 | Monitor whose workarea the geometry resolves against, and the monitor the window is moved to. |

A rule MUST carry at least one of `place`, `tile`, `center`, `workspace`,
`monitor`. A rule with only `match` is an error.

## match

Keys are selector kinds; values are strings. Every key present must match, so
two keys are an AND.

| Key | Matches | Predicate kind |
|---|---|---|
| `class` | WM class, exact | `class` |
| `title` | title, exact | `title` |
| `substr` | title contains the value | `substring` |

`MATCH_KINDS` maps these to `matchPredicate`. A value MUST be a non-empty
string. An empty `substr` would match every window; an empty `class` or `title`
would match only a window that has none, so a rule carrying one could never
usefully fire. All three are refused with the same message rather than loaded as
a rule that silently never matches.

`focused`, numeric window ID and PID are deliberately absent: a static file
cannot name a window that does not exist yet. `matchPredicate` still supports
`pid` for the D-Bus callers.

## Geometry actions

`place`, `tile` and `center` are mutually exclusive within one rule. All three
resolve against the workarea (monitor rectangle minus panels and docks) of the
target monitor, never the monitor rectangle.

### place

`[X, Y, WIDTH, HEIGHT]`, exactly four elements. JSON numbers and strings are
equivalent; `resolvePlaceRect` coerces with `String`.

Resolution order is size first, then position, because the alignment keywords
need the resolved size.

| Token | Grammar | Resolves to |
|---|---|---|
| `WIDTH`/`HEIGHT` literal | `^[1-9][0-9]*$` | that many pixels |
| `WIDTH`/`HEIGHT` percent | `^[0-9]+%$` | `floor(workarea_size * percent / 100)`, which MUST be > 0 |
| `X`/`Y` literal | `^-?[0-9]+$` | that pixel coordinate, negative allowed |
| `X` keyword | `left` \| `center` \| `right` | `wa.x` \| `wa.x + floor((wa.width - width) / 2)` \| `wa.x + wa.width - width` |
| `Y` keyword | `top` \| `center` \| `bottom` | `wa.y` \| `wa.y + floor((wa.height - height) / 2)` \| `wa.y + wa.height - height` |

A percentage above 100 is allowed. A size of `0`, a percentage that floors to 0
pixels, and a keyword belonging to the other axis are errors.

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
the same message text. `cli/src/rules.rs` is what produces it.

`compileRules` parses and validates the whole file before any rule takes
effect. The first problem throws and **no rule from the file is applied** — a
typo never leaves some rules live and others not. `WindowRules._load` logs the
message at warning level and runs with zero rules until the file changes.

Messages name the offending key and index (`rules[0].tile: ...`) and never the
matched value, so a window title or WM class cannot reach the journal.

| Condition | Result |
|---|---|
| Top level not an array | `the top-level value must be an array of rules` |
| Rule not an object | `rules[N]: must be an object` |
| Unknown rule key | `rules[N].<key>: unknown key` |
| `match` missing or not an object | `rules[N].match: must be an object` |
| `match` empty | `rules[N].match: must name at least one of class, title, substr` |
| Unknown `match` key | `rules[N].match.<key>: unknown key` |
| `match` value not a string | `rules[N].match.<key>: must be a string` |
| `match` value empty | `rules[N].match.<key>: must not be empty` |
| Two or more of `place`/`tile`/`center` | `rules[N]: place, tile and center are mutually exclusive` |
| `place` not 4 elements | `rules[N].place: must be [X, Y, WIDTH, HEIGHT]` |
| A `place` token unresolvable | `rules[N].place: X is a number or left\|center\|right, ...` |
| `tile` not a grid position | `rules[N].tile: must be one of ...` |
| `center` not an axis | `rules[N].center: must be one of ...` |
| `workspace`/`monitor` not an integer ≥ 0 | `rules[N].<key>: must be a non-negative integer` |
| Rule has no action | `rules[N]: has nothing to do (...)` |

`place` tokens are validated at load against `PROBE_WORKAREA`
(1000x1000, in `rules-format.js`), so a grammar error is caught before any
window exists. A
percentage valid there but flooring to 0 on a real workarea is skipped at
apply time instead.

## Matching and application

The first rule whose every predicate matches wins, in file order. Later
matching rules are ignored. `wctl rules test <WINDOW>` reports which rule wins
for a live window, which later ones it shadows, and the rectangle the action
resolves to, without moving anything.

A rule applies **once per window**, at the point mutter has shown it. The
window is untracked before the action runs, so a later title change or resize
never re-triggers it. This sets the initial placement only.

Gating, in order:

1. Only `Meta.WindowType.NORMAL` windows are considered.
2. A window still hidden and not yet `shown` is skipped — mutter's initial
   placement overrides any geometry requested before that, so a rule applied
   earlier would be discarded.
3. On a match, the action runs from a `GLib.idle_add` callback, not from inside
   the signal emission: a frame requested re-entrantly is overwritten when the
   outer move-resize continues.

Action order within `_apply`:

1. `workspace` — `change_workspace_by_index(index, true)`, which creates
   workspaces up to that index.
2. `monitor` — skipped with a debug line when the index exceeds
   `get_n_monitors()`.
3. Geometry — skipped when the window is fullscreen. A maximized window is
   unmaximized first, and the frame is requested after the next `size-changed`
   or `UNMAXIMIZE_SETTLE_MS`, whichever comes first, because a frame requested
   while the unmaximize is in flight is overwritten by the restored size.

A window that matches nothing stays under evaluation for
`LATE_IDENTITY_GRACE_MS` after being shown, because a Wayland client's app ID
and first real title can arrive late. After that it is untracked, so a title
change hours later cannot rearrange a window the user has since placed.

## Reload

A `Gio.FileMonitor` on the directory, not the file, so an editor that saves by
rename is still seen. Events are debounced by `RELOAD_DEBOUNCE_MS` into one
reload. A reload replaces the whole rule set and affects windows created
afterwards. No restart is needed.

`window-created` is connected only while at least one rule is loaded, so an
absent or empty file costs nothing per window.

## Timing constants

Defined at the top of `rules.js`; change them there, not here.

| Constant | Value | Guards |
|---|---|---|
| `LATE_IDENTITY_GRACE_MS` | 2000 | late Wayland app ID / title |
| `RELOAD_DEBOUNCE_MS` | 100 | one reload per save |
| `UNMAXIMIZE_SETTLE_MS` | 1000 | a restore that reports no size change |

## Extending the format

Adding a key means editing, in one commit, on BOTH sides: `RULE_KEYS` and
`compileRule` in `rules-format.js`, the validator in `cli/src/rules.rs`, a case
in `tests/vectors/rules-spec.json`, this spec's rule-object and validation
tables, and the README section.

Re-verify with the two checks that read the vectors:

```bash
env -u GI_TYPELIB_PATH gjs -m tests/check-rules-format.js
mise run test
```

Both are CI gates — see [../TESTING.md](../TESTING.md).

Rules are read by the extension alone. The format is not part of the D-Bus
interface and carries no version field; the extension version in
`metadata.json` covers it.
