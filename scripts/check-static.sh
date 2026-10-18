#!/usr/bin/env bash
#
# check-static.sh <binary> - Fail unless the binary is statically linked.
#
# The wctl release asset must run on any distribution without matching a glibc
# version. CI and release.sh both run this check on the musl build.
#

set -euo pipefail

if [[ $# -ne 1 ]]; then
    echo "Usage: $0 <binary>" >&2
    exit 2
fi

# The musl target produces a static PIE, which `file` reports as "static-pie
# linked", not "statically linked" -- match both, and reject the dynamic case by
# its own marker so a future `file` wording change fails loudly here rather than
# shipping a dynamic binary.
linkage=$(file "$1")
if [[ "$linkage" == *"dynamically linked"* ]] ||
   ! [[ "$linkage" == *"statically linked"* || "$linkage" == *"static-pie linked"* ]]; then
    echo "Error: wctl is not statically linked:" >&2
    echo "  $linkage" >&2
    exit 1
fi

echo "Statically linked: $1"
