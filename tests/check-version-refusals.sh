#!/usr/bin/env bash
#
# check-version-refusals.sh - Check that scripts/check-version.sh refuses a
# metadata.json whose version-name is a number, another N, malformed or
# missing, and accepts the matching string.
#

set -euo pipefail

PROJECT_ROOT="$(dirname "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)")"
EXTENSION_DIR="window-control@carlo9890.github.io"
work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT

mkdir -p "$work/scripts" "$work/cli" "$work/$EXTENSION_DIR"
cp "$PROJECT_ROOT/scripts/check-version.sh" "$work/scripts/"
printf '[package]\nname = "wctl"\nversion = "0.24.0"\n' > "$work/cli/Cargo.toml"

failures=0

# expect <accept|refuse> <description> <version-name JSON member, or empty>
expect() {
    local outcome=$1 description=$2 member=$3
    printf '{ %s }\n' "$member" > "$work/$EXTENSION_DIR/metadata.json"
    if "$work/scripts/check-version.sh" > /dev/null 2>&1; then
        actual=accept
    else
        actual=refuse
    fi
    if [[ "$actual" == "$outcome" ]]; then
        echo "PASS  $description"
    else
        echo "FAIL  $description: expected $outcome, got $actual"
        failures=$((failures + 1))
    fi
}

expect accept 'version-name "24" matches wctl 0.24.0' '"version-name": "24"'
expect refuse 'version-name as the number 24' '"version-name": 24'
expect refuse 'version-name "23" for wctl 0.24.0' '"version-name": "23"'
expect refuse 'version-name "24a"' '"version-name": "24a"'
expect refuse 'no version-name' ''

exit $((failures > 0))
