# 0004: The wctl release asset is one static binary with no runtime dependencies

The x86_64 asset must run on any distribution, whatever its glibc version. The musl target gives
that, and zbus is pure Rust, so the build compiles no C code. `wctl` speaks D-Bus itself, through
zbus, and calls no other program.

Rejected: a glibc build, because it fails on a distribution with an older glibc than the build
machine.
