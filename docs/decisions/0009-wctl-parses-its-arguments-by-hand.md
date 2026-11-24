# 0009: wctl parses its arguments by hand

The `<WINDOW>` slot is a positional or an option pair such as `-c kitty` that shifts each later
positional. The help text, the usage strings and the error wording are a contract the tests assert.

Rejected: an argument-parser library such as clap, because each of those points would override it.

Rejected: generated completions, because the scripts complete live window IDs from
`wctl list --json`, which a generated script does not do.
