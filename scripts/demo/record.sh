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
# Needs: kitty, ffmpeg, gjs, the JetBrains Mono font. Set WCTL for another wctl.
# Every window takes its look from kitty/kitty.conf. A scene types its commands
# into a terminal on screen (typist.sh); a caption at the bottom names each
# shortcut it presses, which a GIF cannot show.

set -euo pipefail
# EPOCHREALTIME takes the locale's decimal point, and awk reads only a dot.
export LC_ALL=C.UTF-8

REAL_SESSION_FLAG="--real-session-ok"
SCENES="wctl keyboard rules overlay"
DEMO="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$(dirname "$DEMO")")"
WCTL=${WCTL:-wctl}
FONT=/usr/share/fonts/truetype/jetbrains-mono/JetBrainsMono-Bold.ttf
RULES="${XDG_CONFIG_HOME:-$HOME/.config}/gnome-window-control/rules.json"
export KITTY_CONFIG_DIRECTORY="$DEMO/kitty"

usage() {
    echo "Usage: $0 $REAL_SESSION_FLAG <SCENE>   SCENE: $SCENES" >&2
    exit 2
}

# --- helpers a scene uses ------------------------------------------------------

# write_content: the files the demo windows show, in $WORK/files.
write_content() {
    local grey=$'\e[90m' blue=$'\e[34m' mauve=$'\e[35m' teal=$'\e[36m' yellow=$'\e[33m' off=$'\e[0m'
    mkdir -p "$WORK/files"
    {
        echo "${grey}09:41${off} ${blue}listening on :8080${off}"
        echo "${grey}09:41${off} cache warm, 412 keys"
        echo "${grey}09:41${off} GET /api 200 3ms"
        echo "${grey}09:41${off} ${yellow}slow query 182ms${off}"
    } >"$WORK/files/app.log"
    {
        echo "${mauve}alex${off}  are the docs ready?"
        echo "${teal}sam${off}   the new GIFs are in"
        echo "${mauve}alex${off}  nice, ship it"
    } >"$WORK/files/chat.txt"
    {
        echo "["
        echo "  { ${blue}\"match\"${off}: { ${blue}\"class\"${off}: ${yellow}\"logs\"${off} }, ${blue}\"tile\"${off}: ${yellow}\"top-right\"${off} },"
        echo "  { ${blue}\"match\"${off}: { ${blue}\"class\"${off}: ${yellow}\"chat\"${off} }, ${blue}\"tile\"${off}: ${yellow}\"bottom-right\"${off} }"
        echo "]"
    } >"$WORK/files/rules.json"
}

# log_writer: append a log line now and then, so the logs window is live.
log_writer() {
    local lines=("GET /api 200 2ms" "worker 3 done" "GET /health 200"
                 "cache hit 97%" "POST /tile 204")
    local i=0
    while sleep 0.9; do
        printf '\e[90m09:%02d\e[0m %s\n' $((42 + i / 6)) "${lines[i % ${#lines[@]}]}" \
            >>"$WORK/files/app.log"
        i=$((i + 1))
    done
}

# The background tint of each window the script opens, so that overlapping
# windows stand apart: Catppuccin base mixed with a little of its blue, mauve
# or peach, and its darker mantle for the terminal. A window started from the
# terminal keeps the plain base of kitty.conf, so its command stays short.
declare -A TINT=([logs]="#1c2236" [chat]="#241f36" [editor]="#2a2230" [demo-term]="#181825")

# open_window <CLASS> <TITLE> <COMMAND>: a kitty window that runs COMMAND in $WORK/files.
open_window() {
    kitty --class "$1" --title "$2" --directory "$WORK/files" -o background="${TINT[$1]}" \
        sh -c "$3" >/dev/null 2>&1 &
    "$WCTL" wait -c "$1" --timeout 15 >/dev/null
}

# open_terminal: the terminal that run_typed types into, focused.
open_terminal() {
    rm -f "$WORK/fifo" "$WORK/done"
    mkfifo "$WORK/fifo" "$WORK/done"
    kitty --class demo-term --title "Terminal" --directory "$WORK/files" -o background="${TINT[demo-term]}" \
        -o initial_window_width=960 -o initial_window_height=560 \
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
    log_writer &
    open_window logs "logs" "tail -n 40 -f app.log"
    "$WCTL" move -c logs 1060 140 >/dev/null
    open_window chat "chat" "cat chat.txt; exec sleep infinity"
    "$WCTL" move -c chat 200 560 >/dev/null
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
    open_window editor "rules.json" "cat rules.json; exec sleep infinity"
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
    log_writer &
    open_terminal
    "$WCTL" tile -c demo-term wide-left >/dev/null
}

play_rules() {
    sleep 1
    run_typed "wctl rules add -c logs tile top-right"
    run_typed "wctl rules add -c chat tile bottom-right"
    run_typed "kitty --class logs tail -f app.log &"
    run_typed "kitty --class chat --hold cat chat.txt &"
    sleep 1
    run_typed "wctl move -c logs 700 300; wctl move -c chat 300 150; wctl move focused 600 500"
    caption "Super + Ctrl + Num *   apply the rules again"
    keys KP_Multiply
    sleep 2.5
    caption
    sleep 1
}

setup_overlay() {
    open_window editor "rules.json" "cat rules.json; exec sleep infinity"
    "$WCTL" tile -c editor right >/dev/null
    open_terminal
    "$WCTL" tile -c demo-term wide-left >/dev/null
}

play_overlay() {
    sleep 1
    run_typed "wctl rules add -c quake place center top 100% 40% --overlay"
    run_typed "kitty --class quake &"
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

# to_gif <VIDEO> <GIF>: 1280 wide, 15 frames a second, captions drawn in, one
# palette for the whole GIF.
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
        filters+=",drawtext=fontfile=$FONT:text='${texts[i]}':fontsize=30:fontcolor=0xcdd6f4"
        filters+=":box=1:boxcolor=0x181825@0.94:boxborderw=20:x=(w-tw)/2:y=h-th-48"
        filters+=":enable='between(t,${times[i]},$end)'"
    done
    ffmpeg -loglevel error -y -i "$1" -filter_complex \
        "$filters,split[a][b];[a]palettegen=stats_mode=full[p];[b][p]paletteuse=dither=sierra2_4a" \
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
    kill $(jobs -p) 2>/dev/null || true
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

write_content
"setup_$scene"
sleep 2
: >"$WORK/captions"
video=$(gjs -m "$DEMO/screencast.js" "$WORK/demo.webm" "$DEMO/record.sh" "$REAL_SESSION_FLAG" --play "$scene" "$WORK")
to_gif "$video" "$PROJECT_ROOT/docs/images/demo-$scene.gif"
echo "Wrote docs/images/demo-$scene.gif"
