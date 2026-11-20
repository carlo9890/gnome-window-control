#!/usr/bin/env bash
#
# check-version.sh - Check that cli/Cargo.toml is 0.<N>.0 for metadata.json
# version N, and that metadata.json version-name is N.
#
# wctl compiles its minor version in as the newest extension version it works
# with, so a pair out of step reports the wrong "compatible" range. GetVersion
# reports version-name, because extensions.gnome.org replaces version. CI and
# release.sh both run this check.
#

set -euo pipefail

PROJECT_ROOT="$(dirname "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)")"
METADATA="$PROJECT_ROOT/window-control@carlo9890.github.io/metadata.json"
MANIFEST="$PROJECT_ROOT/cli/Cargo.toml"

extension_version=$(python3 -c "import json, sys; print(json.load(open(sys.argv[1]))['version'])" "$METADATA")
# GetVersion returns version-name as a D-Bus string, so it must be a JSON string.
version_name=$(python3 -c "import json, sys; print(json.dumps(json.load(open(sys.argv[1])).get('version-name')))" "$METADATA")

if [[ "$version_name" != "\"$extension_version\"" ]]; then
    echo "Error: metadata.json version-name is ${version_name}, expected \"$extension_version\"" >&2
    echo "Set both to the same N (see docs/RELEASING.md)." >&2
    exit 1
fi

# The package version: the first `version = "..."` under [package]
wctl_version=$(awk -F'"' '/^\[package\]/{p=1; next} /^\[/{p=0} p && /^version[[:space:]]*=/{print $2; exit}' "$MANIFEST")

expected_version="0.${extension_version}.0"

if [[ "$wctl_version" != "$expected_version" ]]; then
    echo "Error: wctl version mismatch" >&2
    echo "  metadata.json version: $extension_version" >&2
    echo "  cli/Cargo.toml:        ${wctl_version:-<none>}" >&2
    echo "  Expected:              $expected_version" >&2
    echo "Bump both together (see docs/RELEASING.md)." >&2
    exit 1
fi

echo "wctl version $wctl_version matches metadata.json version $extension_version"
