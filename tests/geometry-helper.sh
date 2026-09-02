#!/usr/bin/env bash
#
# geometry-helper.sh - Expected geometry for the live modification tests.
#
# These two functions are an independent oracle for the live suites, not a copy
# of production code: they compute what the workarea reply means and where a
# grid cell should land, so test-modifications.sh can assert that a real window
# arrived there. The same expectations are pinned to hardcoded pixels in the
# crate's unit tests (cli/src/geometry.rs), so the two cannot drift silently --
# if the binary's formula changes, those tests fail first.
#
# Usage: source this file after test-helper.sh.

# Parse a GetWorkarea reply into "x y width height".
# Usage: parse_workarea_rect "(x, y, width, height)"
parse_workarea_rect() {
    local raw="$1"

    if [[ "$raw" =~ ^\((-?[0-9]+),\ (-?[0-9]+),\ ([0-9]+),\ ([0-9]+)\)$ ]]; then
        echo "${BASH_REMATCH[1]} ${BASH_REMATCH[2]} ${BASH_REMATCH[3]} ${BASH_REMATCH[4]}"
    else
        echo "Error: failed to parse workarea: $raw" >&2
        return 1
    fi
}

# Resolve a 4x2 grid tile position into "x y width height" for a given workarea.
# Usage: resolve_tile_geometry <POSITION> <WA_X> <WA_Y> <WA_W> <WA_H>
resolve_tile_geometry() {
    local position="$1"
    local wa_x="$2"
    local wa_y="$3"
    local wa_w="$4"
    local wa_h="$5"

    local cell_w=$((wa_w / 4))
    local cell_h=$((wa_h / 2))

    local start_col end_col start_row end_row
    case "$position" in
        top-left)      start_col=0 end_col=0 start_row=0 end_row=0 ;;
        top-center)    start_col=1 end_col=2 start_row=0 end_row=0 ;;
        top-right)     start_col=3 end_col=3 start_row=0 end_row=0 ;;
        left)          start_col=0 end_col=0 start_row=0 end_row=1 ;;
        center)        start_col=1 end_col=2 start_row=0 end_row=1 ;;
        right)         start_col=3 end_col=3 start_row=0 end_row=1 ;;
        bottom-left)   start_col=0 end_col=0 start_row=1 end_row=1 ;;
        bottom-center) start_col=1 end_col=2 start_row=1 end_row=1 ;;
        bottom-right)  start_col=3 end_col=3 start_row=1 end_row=1 ;;
        *)
            echo "Error: invalid position: $position" >&2
            return 1
            ;;
    esac

    local x=$((wa_x + cell_w * start_col))
    local y=$((wa_y + cell_h * start_row))
    local width=$((cell_w * (end_col - start_col + 1)))
    local height=$((cell_h * (end_row - start_row + 1)))
    echo "$x $y $width $height"
}
