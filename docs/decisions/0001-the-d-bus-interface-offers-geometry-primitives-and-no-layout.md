# 0001: The D-Bus interface offers geometry primitives and no layout

Layout in the extension changes only through an extension release and an extensions.gnome.org
review; layout in `wctl` changes with no review. So `wctl tile` and `wctl center` compute a
rectangle and call `MoveResize` or `Move`. `ApplyRules` is the one exception: it applies the rules
files again through the code that places each new window, and adds no layout of its own.

Rejected: a `wctl rules apply` without a D-Bus method, because it would copy the placement steps
of `rules.js` into Rust.
