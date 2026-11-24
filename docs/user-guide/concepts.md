# Concepts

The other pages of this guide use these terms.

## Selectors

A command that takes a window accepts a selector in place of an ID:

```
<ID> | focused | -c <CLASS> | -t <TITLE> | -s <SUBSTR> | -p <PID>
```

- A selector must match exactly one window. For the exit status when it
  matches more or none, see [Exit codes](wctl.md#exit-codes).
- `activate` takes no `focused`. Its `-c`, `-t`, `-s` and `-p` take the first
  window that matches.

## The workarea

The workarea is the monitor minus panels and docks. `wctl place` and a `place`
rule take four tokens, `X Y WIDTH HEIGHT`, relative to the workarea:

| Token | Value |
|-------|-------|
| `X` | Pixels, which can be negative, or `left`, `center` or `right` |
| `Y` | Pixels, which can be negative, or `top`, `center` or `bottom` |
| `WIDTH`, `HEIGHT` | Positive pixels, or a percentage of the workarea, such as `50%` |

A keyword aligns the window by its size: `right` puts its right edge on the
right edge of the workarea.

## The tile grid

A tile is a span of cells of a grid of 4 columns and 2 rows over the
[workarea](#the-workarea). `wctl tile`, a `tile` rule and the
[shortcuts](shortcuts.md#keyboard-shortcuts) use these positions:

| Position | Columns | Rows |
|----------|---------|------|
| `top-left` | 1 | 1 |
| `top-center` | 2-3 | 1 |
| `top-right` | 4 | 1 |
| `left` | 1 | 1-2 |
| `center` | 2-3 | 1-2 |
| `right` | 4 | 1-2 |
| `bottom-left` | 1 | 2 |
| `bottom-center` | 2-3 | 2 |
| `bottom-right` | 4 | 2 |
| `wide-left` | 1-3 | 1-2 |
| `wide-right` | 2-4 | 1-2 |

## Capabilities

A capability is the name of a feature the extension supports.
`wctl version --json` lists them in `capabilities`; see
[Checking the extension version](wctl.md#checking-the-extension-version). An
empty list means that the extension is too old to tell.

Test for a capability, not for a version number: an extension before v25 from
extensions.gnome.org shows the upload number of that site, which is not a
release number of this project. The rule keys that need a capability are in
[Keys that need a newer extension](rules.md#keys-that-need-a-newer-extension).
`no-animation` means `minimize` and `unminimize` take `--no-animation`;
`activate-no-animation` means `activate` takes it.
