#!/usr/bin/env bash
# Record a demo GIF of the user guide: docs/images/demo-<SCENE>.gif.
#
# Usage: record.sh --real-session-ok <SCENE>     SCENE: wctl keyboard rules overlay
#
# Run it in the desktop session of a throwaway VM guest (docs/RUNNING.md), with
# this checkout copied there and the extension and wctl installed. A scene
# opens kitty windows, moves them, presses the shortcuts with
# tests/inject-keys.js and replaces rules.json for the time of the scene, so it
# refuses to run without --real-session-ok. The screen must be one monitor at
# 1920x1080, scale 1.
#
# Needs: kitty, ffmpeg, gjs, the DejaVu fonts. Set WCTL for another wctl.
# A scene types its commands into a terminal on screen (typist.sh); a caption
# at the bottom names each shortcut it presses, which a GIF cannot show.

set -euo pipefail
# EPOCHREALTIME takes the locale's decimal point, and awk reads only a dot.
export LC_ALL=C

REAL_SESSION_FLAG="--real-session-ok"
SCENES="wctl keyboard rules overlay"
DEMO="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$(dirname "$DEMO")")"
WCTL=${WCTL:-wctl}
FONT=/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf
RULES="${XDG_CONFIG_HOME:-$HOME/.config}/gnome-window-control/rules.json"

usage() {
    echo "Usage: $0 $REAL_SESSION_FLAG <SCENE>   SCENE: $SCENES" >&2
    exit 2
}

# --- helpers a scene uses ------------------------------------------------------

# open_window <CLASS> <LABEL> <COLOR>: a kitty window that shows LABEL.
open_window() {
    kitty --class "$1" --title "$1" -o background="$3" -o foreground=#ffffff \
        -o font_size=22 -o confirm_os_window_close=0 -o remember_window_size=no \
        -o initial_window_width=720 -o initial_window_height=420 \
        sh -c "printf '\n  %s\n' '$2'; exec sleep infinity" >/dev/null 2>&1 &
    "$WCTL" wait -c "$1" --timeout 15 >/dev/null
}

# open_terminal: the terminal that run_typed types into, focused.
# The kitty windows it starts inherit KITTY_CONFIG_DIRECTORY: without shell
# integration, they print no warning about the guest's bash settings into it.
open_terminal() {
    rm -f "$WORK/fifo" "$WORK/done"
    mkfifo "$WORK/fifo" "$WORK/done"
    mkdir -p "$WORK/kitty"
    echo "shell_integration disabled" >"$WORK/kitty/kitty.conf"
    KITTY_CONFIG_DIRECTORY="$WORK/kitty" kitty --class demo-term --title "Terminal" -o font_size=15 \
        -o confirm_os_window_close=0 -o remember_window_size=no \
        -o initial_window_width=900 -o initial_window_height=520 \
        bash "$DEMO/typist.sh" "$WORK/fifo" "$WORK/done" >/dev/null 2>&1 &
    "$WCTL" wait -c demo-term --timeout 15 >/dev/null
}

# run_typed <COMMAND>: type COMMAND in the terminal, run it, and wait for it.
# A command that fails stops the scene, so no broken demo is written.
run_typed() {
    local status
    echo "$1" >"$WORK/fifo"
    read -r status <"$WORK/done"
    if [[ "$status" != 0 ]]; then
        echo "The scene command failed with status $status: $1" >&2
        exit 1
    fi
    sleep 0.8
}

# caption [TEXT]: show TEXT from now until the next caption; no TEXT clears it.
# TEXT holds letters, digits, spaces and + - * only: ffmpeg's drawtext reads
# the rest as syntax.
caption() {
    echo "$(elapsed) ${1:-}" >>"$WORK/captions"
}

keys() {
    gjs -m "$PROJECT_ROOT/tests/inject-keys.js" Super_L Control_L "$@"
}

elapsed() {
    awk -v now="$EPOCHREALTIME" -v t0="$T0" 'BEGIN { printf "%.2f", now - t0 }'
}

# --- scenes: setup_<SCENE> runs before the recording, play_<SCENE> during it --

setup_wctl() {
    open_window logs "logs" "#1e5f74"
    "$WCTL" move -c logs 1060 120 >/dev/null
    open_window chat "chat" "#7a3e65"
    "$WCTL" move -c chat 260 560 >/dev/null
    open_terminal
    "$WCTL" center -c demo-term both >/dev/null
}

play_wctl() {
    sleep 1
    run_typed "wctl list"
    run_typed "wctl tile -c logs top-right"
    run_typed "wctl tile -c chat bottom-right"
    run_typed "wctl tile focused wide-left"
    sleep 2
}

setup_keyboard() {
    open_window editor "Super + Ctrl + numpad" "#2d5a27"
    "$WCTL" center -c editor both >/dev/null
}

play_keyboard() {
    sleep 1
    local step
    for step in "7 top-left KP_Home" "9 top-right KP_Page_Up" "3 bottom-right KP_Page_Down" \
                "1 bottom-left KP_End" "5 center KP_Begin" "+ wide-right KP_Add" "+ wide-left KP_Add"; do
        set -- $step
        caption "Super + Ctrl + Num $1   $2"
        keys "$3"
        sleep 1.6
    done
    caption
    sleep 1
}

setup_rules() {
    open_terminal
    "$WCTL" tile -c demo-term wide-left >/dev/null
}

play_rules() {
    sleep 1
    run_typed "wctl rules add -c logs tile top-right"
    run_typed "wctl rules add -c chat tile bottom-right"
    run_typed "kitty --class logs -o background=#1e5f74 &"
    run_typed "kitty --class chat -o background=#7a3e65 &"
    sleep 1
    run_typed "wctl move -c logs 700 300; wctl move -c chat 300 150; wctl move focused 600 500"
    caption "Super + Ctrl + Num *   apply the rules again"
    keys KP_Multiply
    sleep 2.5
    caption
    sleep 1
}

setup_overlay() {
    open_window editor "editor" "#2d5a27"
    "$WCTL" tile -c editor right >/dev/null
    open_terminal
    "$WCTL" tile -c demo-term wide-left >/dev/null
}

play_overlay() {
    sleep 1
    run_typed "wctl rules add -c quake place center top 100% 40% --overlay"
    run_typed "kitty --class quake -o background=#3b3561 &"
    sleep 1.5
    caption "focus goes to another window"
    "$WCTL" activate -c editor >/dev/null
    sleep 2
    caption "a custom shortcut shows it again"
    "$WCTL" unminimize -c quake --no-animation >/dev/null
    "$WCTL" activate -c quake >/dev/null
    sleep 2
    caption "focus goes to another window"
    "$WCTL" activate -c demo-term >/dev/null
    sleep 2
    caption
    sleep 1
}

# --- recording -----------------------------------------------------------------

# to_gif <VIDEO> <GIF>: 1280 wide, 15 frames a second, captions drawn in.
to_gif() {
    local filters="fps=15,scale=1280:-1:flags=lanczos"
    local times=() texts=() i end
    while read -r time text; do
        times+=("$time")
        texts+=("$text")
    done <"$WORK/captions"
    for ((i = 0; i < ${#times[@]}; i++)); do
        [[ -n "${texts[i]}" ]] || continue
        end=${times[i + 1]:-99999}
        filters+=",drawtext=fontfile=$FONT:text='${texts[i]}':fontsize=34:fontcolor=white"
        filters+=":box=1:boxcolor=black@0.75:boxborderw=18:x=(w-tw)/2:y=h-th-48"
        filters+=":enable='between(t,${times[i]},$end)'"
    done
    ffmpeg -loglevel error -y -i "$1" -filter_complex \
        "$filters,split[a][b];[a]palettegen=stats_mode=diff[p];[b][p]paletteuse=dither=bayer:bayer_scale=5:diff_mode=rectangle" \
        "$2"
}

# The opt-in is required on every bus: the rules.json a scene replaces is the
# one of this user, which a nested or headless shell does not read but the
# login shell does. The recording runs this script again with
# `--real-session-ok --play <SCENE> <WORK>`.
if [[ "${1:-}" != "$REAL_SESSION_FLAG" ]]; then
    echo "Refusing to run without $REAL_SESSION_FLAG: a scene opens, moves and closes" >&2
    echo "windows, presses keys and replaces $RULES." >&2
    echo "Run it only in a throwaway VM guest's session, and pass $REAL_SESSION_FLAG there." >&2
    exit 1
fi
shift

if [[ "${1:-}" == "--play" ]]; then
    WORK=$3
    T0=$EPOCHREALTIME
    "play_$2"
    exit 0
fi

[[ $# -eq 1 && " $SCENES " == *" $1 "* ]] || usage
scene=$1

screen=$("$WCTL" monitors | awk 'NR == 2 { s = $4 "x" $5 "@" $6 } END { print (NR == 2 ? s : NR - 1 " monitors") }')
if [[ "$screen" != "1920x1080@1" ]]; then
    echo "The screen is $screen; a demo needs one monitor at 1920x1080, scale 1." >&2
    exit 1
fi

WORK=$(mktemp -d)

cleanup() {
    pkill -P $$ kitty 2>/dev/null || true
    for class in logs chat editor quake demo-term; do
        while "$WCTL" close -c "$class" >/dev/null 2>&1; do sleep 0.2; done
    done
    if [[ -e "$WORK/rules.json.saved" || -L "$WORK/rules.json.saved" ]]; then
        rm -f "$RULES"
        mv "$WORK/rules.json.saved" "$RULES"
    elif [[ -e "$WORK/rules.json.ours" ]]; then
        rm -f "$RULES"
    fi
    rm -rf "$WORK"
}
trap cleanup EXIT

mkdir -p "$(dirname "$RULES")"
if [[ -e "$RULES" || -L "$RULES" ]]; then
    mv "$RULES" "$WORK/rules.json.saved"
fi
touch "$WORK/rules.json.ours"
echo '[]' >"$RULES"

"setup_$scene"
sleep 2
: >"$WORK/captions"
video=$(gjs -m "$DEMO/screencast.js" "$WORK/demo.webm" "$DEMO/record.sh" "$REAL_SESSION_FLAG" --play "$scene" "$WORK")
to_gif "$video" "$PROJECT_ROOT/docs/images/demo-$scene.gif"
echo "Wrote docs/images/demo-$scene.gif"
