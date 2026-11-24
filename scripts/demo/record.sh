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
# 1920x1080, scale 1.5, with the desktop look docs/RUNNING.md sets.
#
# Needs: kitty, ffmpeg, gjs, the JetBrains Mono and Inter fonts, and wctl on
# PATH. Every window takes its look from kitty/kitty.conf. A scene types its
# commands into a terminal on screen (typist.sh). A bar under the screen names
# the scene and shows each shortcut it presses as key caps, which a GIF cannot
# show. The GIF wipes back to its first frame, so its loop has no jump.

set -euo pipefail
# EPOCHREALTIME takes the locale's decimal point, and awk reads only a dot.
export LC_ALL=C.UTF-8

REAL_SESSION_FLAG="--real-session-ok"
SCENES="wctl keyboard rules overlay"
DEMO="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$(dirname "$DEMO")")"
MONO=/usr/share/fonts/truetype/jetbrains-mono/JetBrainsMono-Bold.ttf
SANS=/usr/share/fonts/opentype/inter/Inter-SemiBold.otf
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
        echo "${mauve}alex${off}  docs ready?"
        echo "${teal}sam${off}   GIFs are in"
        echo "${mauve}alex${off}  ship it"
    } >"$WORK/files/chat.txt"
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

# kitty --class <CLASS> ...: kitty with the background tint of CLASS, so that
# a window has the same tint in every scene and overlapping windows stand
# apart: Catppuccin base mixed with a little of its blue, mauve or peach, and
# its darker mantle for the terminal. Each window fits a quarter tile, 320 wide. The terminal's shell gets this function
# too (export -f), so a window typed there takes its tint and its command
# stays short.
kitty() {
    local tint
    case "$2" in
        logs) tint="#1c2236" ;;
        chat) tint="#241f36" ;;
        quake) tint="#2a2230" ;;
        demo-term) tint="#181825" ;;
        *) tint="#1e1e2e" ;;
    esac
    command kitty -o background="$tint" "$@"
}
export -f kitty

# open_window <CLASS> <TITLE> <COMMAND>: a kitty window that runs COMMAND in $WORK/files.
open_window() {
    kitty --class "$1" --title "$2" --directory "$WORK/files" sh -c "$3" >/dev/null 2>&1 &
    wctl wait -c "$1" --timeout 15 >/dev/null
}

# open_terminal: the terminal that run_typed types into, focused.
open_terminal() {
    rm -f "$WORK/fifo" "$WORK/done"
    mkfifo "$WORK/fifo" "$WORK/done"
    kitty --class demo-term --title "Terminal" --directory "$WORK/files" \
        -o initial_window_width=720 -o initial_window_height=380 \
        bash "$DEMO/typist.sh" "$WORK/fifo" "$WORK/done" "$WORK/stderr" >/dev/null 2>&1 &
    wctl wait -c demo-term --timeout 15 >/dev/null
}

# run_typed <COMMAND>: type COMMAND in the terminal, run it, and wait for it.
# A command that fails stops the scene with its error, so no broken demo is
# written. Type one command per call: only the status of the last one counts.
run_typed() {
    local status
    echo "$1" >"$WORK/fifo"
    read -r status <"$WORK/done"
    if [[ "$status" != 0 ]]; then
        echo "The scene command failed with status $status: $1" >&2
        cat "$WORK/stderr" >&2
        exit 1
    fi
    sleep 1.2
}

# caption [KEYS [TEXT]]: show KEYS as key caps and TEXT after them in the bar
# from now until the next caption; no argument clears it. KEYS separates the
# keys with |. Both hold letters, digits, spaces and + - * % only: ffmpeg's
# drawtext reads the rest as syntax.
caption() {
    echo "$(elapsed);${1:-};${2:-}" >>"$WORK/captions"
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
    wctl move -c logs 660 80 >/dev/null
    open_window chat "chat" "cat chat.txt; exec sleep infinity"
    wctl move -c chat 110 360 >/dev/null
    open_terminal
    wctl center -c demo-term both >/dev/null
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
    open_window chat "chat" "cat chat.txt; exec sleep infinity"
    # The scene ends on Num 5, so its last frame and its first one match.
    wctl tile -c chat center >/dev/null
}

play_keyboard() {
    sleep 1
    local step
    for step in "7 top-left KP_Home" "9 top-right KP_Page_Up" "3 bottom-right KP_Page_Down" \
                "1 bottom-left KP_End" "+ wide-right KP_Add" "+ wide-left KP_Add" "5 center KP_Begin"; do
        set -- $step
        caption "Super|Ctrl|Num $1" "$2"
        keys "$3"
        sleep 1.8
    done
    caption
    sleep 1
}

setup_rules() {
    log_writer &
    open_terminal
    wctl tile -c demo-term wide-left >/dev/null
}

play_rules() {
    sleep 1
    run_typed "wctl rules add -c logs tile top-right"
    run_typed "wctl rules add -c chat tile bottom-right"
    run_typed "kitty --class logs tail -f app.log &"
    wctl wait -c logs --timeout 15 >/dev/null
    run_typed "kitty --class chat --hold cat chat.txt &"
    wctl wait -c chat --timeout 15 >/dev/null
    sleep 1
    run_typed "wctl move -c logs 460 200"
    run_typed "wctl move -c chat 200 100"
    caption "Super|Ctrl|Num *" "apply the rules again"
    keys KP_Multiply
    sleep 2.5
    caption
    sleep 1
}

setup_overlay() {
    open_window chat "chat" "cat chat.txt; exec sleep infinity"
    wctl tile -c chat right >/dev/null
    open_terminal
    wctl tile -c demo-term wide-left >/dev/null
}

play_overlay() {
    sleep 1
    run_typed "wctl rules add -c quake place center top 100% 40% --overlay"
    run_typed "kitty --class quake &"
    wctl wait -c quake --timeout 15 >/dev/null
    sleep 1.5
    caption "" "focus goes to another window"
    wctl activate -c chat >/dev/null
    sleep 2
    caption "" "a custom shortcut shows it again"
    wctl unminimize -c quake --no-animation >/dev/null
    wctl activate -c quake >/dev/null
    sleep 2
    caption "" "focus goes to another window"
    wctl activate -c demo-term >/dev/null
    sleep 2
    caption
    sleep 1
}

# --- recording -----------------------------------------------------------------

# The name each scene shows in the bar.
declare -A TITLE=([wctl]="Tile from a terminal" [keyboard]="Tile from the keyboard"
                  [rules]="Open every window in its place" [overlay]="Overlay windows")

# to_gif <VIDEO> <GIF> <TITLE>: the screen without the top bar, which shows
# the recording icon, at 1280 wide and 15 frames a second; a bar under it with
# TITLE and the captions; a wipe back to the first frame, which costs a small
# part of a fade's size; one palette for the whole GIF.
to_gif() {
    local top=48 bar=64 wipe=0.8 still=2
    local screen_h=$(((1080 - top) * 2 / 3))
    local base=$((screen_h + bar / 2 + 8)) cap_y=$((screen_h + bar / 2 - 17))
    local last offset
    last=$(ffprobe -v error -select_streams v:0 -show_entries frame=pts_time -of csv=p=0 "$1" | tail -n 1)
    offset=$(awk -v last="$last" -v wipe="$wipe" 'BEGIN { printf "%.2f", last - wipe }')
    local graph="[0:v]fps=15,crop=1920:$((1080 - top)):0:$top,scale=1280:$screen_h:flags=lanczos,split[v][f];"
    graph+="[f]trim=end_frame=1,loop=loop=$((still * 15 - 1)):size=1,setpts=N/15/TB[first];"
    graph+="[v][first]xfade=transition=wipeleft:duration=$wipe:offset=$offset"
    graph+=",pad=1280:$((screen_h + bar)):0:0:color=0x11111b,drawbox=y=$screen_h:w=1280:h=1:color=0x313244:t=fill"
    graph+=",drawtext=fontfile=$SANS:text='$3':fontsize=22:fontcolor=0xcdd6f4:x=28:y=$base:y_align=baseline"
    local times=() keys=() texts=() i x key width when
    while IFS=';' read -r time key_list text; do
        times+=("$time")
        keys+=("$key_list")
        texts+=("$text")
    done <"$WORK/captions"
    for ((i = 0; i < ${#times[@]}; i++)); do
        when="enable='between(t,${times[i]},${times[i + 1]:-99999})'"
        x=480
        if [[ -n "${keys[i]}" ]]; then
            while IFS= read -r -d '|' key; do
                # JetBrains Mono advances 0.6 em: 13.2 px a character at size 22.
                width=$(( (${#key} * 132 + 9) / 10 + 24 ))
                graph+=",drawbox=x=$x:y=$cap_y:w=$width:h=34:color=0x45475a:t=fill:$when"
                graph+=",drawbox=x=$x:y=$cap_y:w=$width:h=31:color=0x313244:t=fill:$when"
                graph+=",drawtext=fontfile=$MONO:text='$key':fontsize=22:fontcolor=0xcdd6f4"
                graph+=":x=$((x + 12)):y=$((base - 2)):y_align=baseline:$when"
                x=$((x + width + 10))
            done <<<"${keys[i]}|"
            x=$((x + 8))
        fi
        [[ -n "${texts[i]}" ]] || continue
        graph+=",drawtext=fontfile=$SANS:text='${texts[i]}':fontsize=22:fontcolor=0xa6adc8"
        graph+=":x=$x:y=$base:y_align=baseline:$when"
    done
    ffmpeg -loglevel error -y -i "$1" -filter_complex \
        "$graph,split[a][b];[a]palettegen=stats_mode=full[p];[b][p]paletteuse=dither=sierra2_4a:diff_mode=rectangle" \
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

screen=$(wctl monitors | awk 'NR == 2 { s = $4 "x" $5 "@" $6 } END { print (NR == 2 ? s : NR - 1 " monitors") }')
if [[ "$screen" != "1280x720@1.5" ]]; then
    echo "The screen is $screen; a demo needs one monitor at 1920x1080, scale 1.5 (1280x720 logical)." >&2
    exit 1
fi

for font in "$MONO" "$SANS"; do
    if [[ ! -r "$font" ]]; then
        echo "The bar font $font is missing: install fonts-jetbrains-mono and fonts-inter." >&2
        exit 1
    fi
done

# The user's rules.json waits next to itself, where a lost /tmp cannot take it;
# the extension reads no file of that name.
SAVED="$RULES.demo-saved"
if [[ -e "$SAVED" || -L "$SAVED" ]]; then
    echo "$SAVED is left from an earlier run: move it back to $RULES first." >&2
    exit 1
fi

WORK=$(mktemp -d)

cleanup() {
    kill $(jobs -p) 2>/dev/null || true
    if [[ -e "$SAVED" || -L "$SAVED" ]]; then
        rm -f "$RULES"
        mv "$SAVED" "$RULES"
    elif [[ -e "$WORK/rules.json.ours" ]]; then
        rm -f "$RULES"
    fi
    local class try
    for class in logs chat quake demo-term; do
        for try in 1 2 3 4 5 6 7 8 9 10; do
            wctl close -c "$class" >/dev/null 2>&1 || break
            sleep 0.2
        done
    done
    rm -rf "$WORK"
}
trap cleanup EXIT

mkdir -p "$(dirname "$RULES")"
if [[ -e "$RULES" || -L "$RULES" ]]; then
    mv "$RULES" "$SAVED"
    echo "Saved $RULES as $SAVED for the time of the scene." >&2
fi
touch "$WORK/rules.json.ours"
echo '[]' >"$RULES"

write_content
"setup_$scene"
sleep 2
: >"$WORK/captions"
video=$(gjs -m "$DEMO/screencast.js" "$WORK/demo" "$DEMO/record.sh" "$REAL_SESSION_FLAG" --play "$scene" "$WORK")
to_gif "$video" "$PROJECT_ROOT/docs/images/demo-$scene.gif" "${TITLE[$scene]}"
echo "Wrote docs/images/demo-$scene.gif"
