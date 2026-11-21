#!/usr/bin/env bash
#
# check-release-notes-path.sh - Check that scripts/release.sh reads a relative
# --notes-file from the folder it was started in, not from the project root.
#
# A stub gh that is not logged in stops release.sh at its next step, so the
# check makes no release and needs no network.
#

set -euo pipefail

PROJECT_ROOT="$(dirname "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)")"
work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT

mkdir -p "$work/scripts" "$work/elsewhere" "$work/stubs"
cp "$PROJECT_ROOT/scripts/release.sh" "$work/scripts/"
printf '#!/usr/bin/env bash\nexit 1\n' > "$work/stubs/gh"
chmod +x "$work/stubs/gh"
printf 'one\ntwo\n' > "$work/elsewhere/notes.md"

failures=0

# expect <description> <text the output must hold> <folder to start in> <--notes-file value>
expect() {
    local description=$1 wanted=$2 folder=$3 notes=$4 output
    output=$(cd "$folder" && PATH="$work/stubs:$PATH" "$work/scripts/release.sh" --notes-file "$notes" 2>&1) || true
    if [[ "$output" == *"$wanted"* ]]; then
        echo "PASS  $description"
    else
        echo "FAIL  $description: no \"$wanted\" in:"
        echo "$output"
        failures=$((failures + 1))
    fi
}

expect 'a relative path is read from the start folder' \
    "Read 2 lines from $work/elsewhere/notes.md" "$work/elsewhere" notes.md
expect 'an absolute path is read as given' \
    "Read 2 lines from $work/elsewhere/notes.md" "$work" "$work/elsewhere/notes.md"
expect 'a relative path with no file is refused' \
    "Release notes file not found: $work/elsewhere/absent.md" "$work/elsewhere" absent.md

exit $((failures > 0))
