# 0007: The rules.json grammar has two implementations, pinned to one vector file

`wctl rules check` gives the verdict of the extension without a running shell, and `wctl` cannot
load GJS. So `cli/src/rules.rs` is a second implementation of the grammar in `rules-format.js`, and
a test on each side reads `tests/vectors/rules-spec.json`.

Rejected: a limit, a keyword set or a message that each side holds and no shared vector asserts,
because it drifts with no test failing.
