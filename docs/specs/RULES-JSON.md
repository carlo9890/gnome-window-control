# Spec: rules.json

The format of the auto-placement rules files. The extension
(`rules-format.js`, `rules.js`) and `wctl rules` (`cli/src/rules.rs`) MUST
both follow it. `tests/vectors/rules-spec.json` pins the exact messages and the
edge cases both MUST produce.

## Files

- The user file is `$XDG_CONFIG_HOME/gnome-window-control/rules.json`
  (`~/.config` when unset). The drop-in folder is `rules.d/` beside it, read
  without recursion.
- A drop-in file is a regular file, after symlinks, whose name matches
  `^[A-Za-z0-9][A-Za-z0-9._-]*\.json$`. Any other entry MUST be skipped with
  no message: a dot-name, a `~` backup, a `.off` file.
- A writer MUST write a drop-in to a dot-name in `rules.d/`, then rename it.
- An absent file or folder adds no rules. The extension writes no file.

## Order

The rule list is `rules.json`, then each drop-in in byte order of its name
(`10-a.json` before `9-b.json`). The rules of a file stay together, in file
order.

A file that does not parse or validate MUST add no rules, and the other files
MUST still load.

## Document

The top level is an array of rule objects. A rule accepts these keys only:

| Key | Value |
|---|---|
| `match` | object, required ([match](#match)) |
| `place` | `[X, Y, WIDTH, HEIGHT]` ([place](#place)) |
| `tile` | a grid position ([tile](#tile)) |
| `center` | `horizontal`, `vertical` or `both`: keeps the window's size and centres it on those axes |
| `workspace` | workspace index |
| `monitor` | monitor index: the geometry resolves against its workarea, and the window moves to it |
| `overlay` | boolean; `false` is the same as no key |

- A rule MUST NOT carry more than one of `place`, `tile`, `center`.
- A rule MUST carry `place`, `tile`, `center`, `workspace`, `monitor`, or
  `"overlay": true`.
- An index or a pixel value is a signed 32-bit integer; an index is not
  negative. `2.0` is the integer `2`.

## match

Every key present MUST match. A value MUST be a non-empty string, compared
case-sensitively.

| Key | Matches when |
|---|---|
| `class` | the WM class is the value |
| `title` | the title is the value |
| `substr` | the title contains the value |
| `title_prefix` | the title starts with the value |
| `title_suffix` | the title ends with the value |
| `class_prefix` | the WM class starts with the value |

`match` MUST hold at least one key of this table. `min_width`, an integer of
at least 1, is a condition on the monitor: the rule matches only when the
logical width of the monitor it resolves against (its `monitor`, else the
window's) is at least the value.

## Geometry

`place`, `tile` and `center` resolve against the workarea of the target
monitor, never the monitor rectangle.

### place

Each element is a string or a number. The size resolves before the position.

| Token | Value |
|---|---|
| `WIDTH`, `HEIGHT` | `N` pixels, N at least 1; or `N%` of the workarea, floored, MUST NOT be 0 |
| `X` | pixels, negative allowed; or `left`, `center`, `right` |
| `Y` | pixels, negative allowed; or `top`, `center`, `bottom` |

A keyword aligns the window in the workarea.
A token that resolves to nothing on the real workarea skips the geometry.

### tile

A span of cells of a grid of 4 columns and 2 rows; a cell is the workarea
divided by 4 and by 2, floored. Columns and rows count from 0.

| Value | Columns | Rows |
|---|---|---|
| `top-left` | 0 | 0 |
| `top-center` | 1-2 | 0 |
| `top-right` | 3 | 0 |
| `left` | 0 | 0-1 |
| `center` | 1-2 | 0-1 |
| `right` | 3 | 0-1 |
| `bottom-left` | 0 | 1 |
| `bottom-center` | 1-2 | 1 |
| `bottom-right` | 3 | 1 |
| `wide-left` | 0-2 | 0-1 |
| `wide-right` | 1-3 | 0-1 |

## Matching and application

- Only a `NORMAL` window matches. The first matching rule in [order](#order)
  wins; the later ones do nothing.
- A rule applies once to a new window, after mutter shows it. A window that
  matched nothing is evaluated again when its class, title or type changes
  during a short grace period after it is shown (rules.js holds the length). `ApplyRules` applies the loaded rules to the open windows again.
- The actions run in this order: `overlay`, `workspace`, `monitor`, geometry.
  A `monitor` that does not exist skips the monitor move and the geometry. A
  fullscreen window gets no geometry; a maximized one is unmaximized first.
- At each load and at `ApplyRules`, each open window whose winning rule has
  `overlay` is an overlay, and no other window is.
- A change to a file reloads every file and replaces the whole rule set.
