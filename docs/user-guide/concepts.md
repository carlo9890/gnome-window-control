# Concepts

This page explains the terms that the other pages of this guide use.

## Selectors

Every command that takes a window accepts a selector instead of an ID:

```
<ID> | focused | -c <CLASS> | -t <TITLE> | -s <SUBSTR> | -p <PID>
```

- A selector must match exactly one window.
- With several matches wctl lists the candidates and exits 1; with none it
  exits 2. See [Exit codes](wctl.md#exit-codes).
- An empty value is refused.
- `activate` takes no `focused`, and its `-c/-t/-s/-p` take the first match.

## The workarea

The workarea is the monitor minus panels and docks. `place` takes
workarea-relative tokens:

- X/Y take pixels or `left|center|right` / `top|center|bottom`.
- width/height take pixels or a percentage of the workarea.

## The tile grid

A tile is a cell span of a 4-column by 2-row grid over the
[workarea](#the-workarea). Cell size floors, so a width not divisible by 4
leaves the remainder at the right edge rather than stretching the last column.

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

The normative definition is in the
[rules.json specification](../specs/RULES-JSON.md#tile).

## Capabilities

`wctl version --json` reports a `capabilities` list; see
[Checking the extension version](wctl.md#checking-the-extension-version).

`capabilities` is what the extension says it supports, by name. Ask for a name
rather than comparing version numbers: a version before v25 installed from
extensions.gnome.org carries that site's own upload number in `extension`,
which is not related to this project's release numbers. `no-animation` means
the extension has `MinimizeNoAnimation` and `UnminimizeNoAnimation`, and
`activate-no-animation` means it has `ActivateNoAnimation`. An empty list means
the extension is too old to answer.
