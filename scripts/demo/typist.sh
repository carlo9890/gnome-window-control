#!/usr/bin/env bash
# The shell of the terminal a demo types into. It reads one command per line
# from the FIFO, types it at the prompt one character at a time, runs it, and
# writes its exit status to the DONE FIFO, so that record.sh can wait for it
# and stop on a failure. Stderr is
# dropped: a kitty started in a VM prints graphics driver warnings there.
#
# Usage: typist.sh <FIFO> <DONE>

set -u

fifo=$1
done_fifo=$2
prompt=$'\e[35m❯\e[0m '

printf '%s' "$prompt"
while IFS= read -r command <"$fifo"; do
    for ((i = 0; i < ${#command}; i++)); do
        printf '%s' "${command:i:1}"
        sleep 0.045
    done
    sleep 0.4
    printf '\n'
    eval "$command" 2>/dev/null
    status=$?
    printf '%s' "$prompt"
    echo "$status" >"$done_fifo"
done
