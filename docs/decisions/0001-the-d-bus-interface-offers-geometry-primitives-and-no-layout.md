# 0001: The D-Bus interface offers geometry primitives and no layout

The caller handles layout: `wctl tile` and `wctl center` compute a rectangle and then call
`MoveResize` or `Move`.

`ApplyRules` is the one exception. It applies the rules files (`rules.json` and `rules.d`) again,
through the code that places each new window, and adds no layout of its own.

Rejected: a `wctl rules apply` without a D-Bus method, because it would have to copy the placement
steps of `rules.js` into Rust.
