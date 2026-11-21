# 0004: The wctl release asset is one static binary with no runtime dependencies

The asset, an x86_64 binary, must run on any distribution without matching a glibc version. The
musl target gives that, and zbus is pure Rust, so the build compiles no C code. `wctl` speaks D-Bus
itself, through zbus, and calls no other program.
