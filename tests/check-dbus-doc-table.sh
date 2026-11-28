#!/usr/bin/env bash
#
# check-dbus-doc-table.sh - Fail unless the method table in
# docs/user-guide/dbus.md names exactly the methods of the interface XML in
# dbus-interface.js. The table is a copy kept by hand.
#

set -euo pipefail

PROJECT_ROOT="$(dirname "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)")"
INTERFACE="$PROJECT_ROOT/window-control@carlo9890.github.io/dbus-interface.js"
GUIDE="$PROJECT_ROOT/docs/user-guide/dbus.md"

# A grep with no match ends the script under set -e: the test below reports it.
interface_methods=$(grep -oP '<method name="\K[A-Za-z]+' "$INTERFACE" | sort || true)
table_methods=$(sed -n '/^## Methods$/,/^## /p' "$GUIDE" | grep -oP '^\| `\K[A-Za-z]+(?=` \|)' | sort || true)

if [[ -z "$interface_methods" || -z "$table_methods" ]]; then
    echo "Error: no method found in $INTERFACE or in the Methods table of $GUIDE" >&2
    exit 1
fi

if ! difference=$(diff <(echo "$interface_methods") <(echo "$table_methods")); then
    echo "Error: the Methods table of docs/user-guide/dbus.md does not match the interface XML" >&2
    echo "  < only in the interface XML, > only in the table:" >&2
    echo "$difference" | grep '^[<>]' | sed 's/^/  /' >&2
    exit 1
fi

echo "The D-Bus method table names all $(echo "$interface_methods" | wc -l) methods"
