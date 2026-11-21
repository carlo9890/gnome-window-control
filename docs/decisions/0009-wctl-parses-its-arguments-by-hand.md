# 0009: wctl parses its arguments by hand

The `<WINDOW>` slot is a positional or an option pair such as `-c kitty` that shifts every later
positional. The help text, the usage strings and the error wording are a frozen contract that the
test suites assert.

Rejected: an argument-parser library such as clap, because it would have to be overridden at each
of those points.

Rejected: generated completions, because the scripts complete live window IDs from
`wctl list --json`, which a generated script does not do.
