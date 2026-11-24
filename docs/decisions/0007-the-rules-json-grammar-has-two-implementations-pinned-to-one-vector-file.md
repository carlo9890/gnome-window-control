# 0007: The rules.json grammar has two implementations, pinned to one vector file

`wctl rules check` gives the extension's verdict without a running shell, and `wctl` cannot load
GJS. So `cli/src/rules.rs` implements the grammar of `rules-format.js` a second time, and a test on
each side reads `tests/vectors/rules-spec.json`.

Rejected: a limit, a keyword set or a message that each side holds and no shared vector asserts,
because it drifts with no test failing.
