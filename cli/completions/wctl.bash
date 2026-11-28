# Bash completion for wctl
# Install: mkdir -p ~/.local/share/bash-completion/completions
#          wctl completion bash > ~/.local/share/bash-completion/completions/wctl

# Window IDs come straight out of the compact JSON list. No jq: wctl has no
# runtime dependencies and its completion must not add one.
_wctl_get_window_ids() {
    wctl --timeout 1 list --json 2>/dev/null | grep -o '"id":[0-9]\+' | cut -d: -f2
}

# Words accepted where a <WINDOW> selector goes: ids, "focused", and the
# -c/-t/-s/-p match options (each of which takes a value as the next word).
_wctl_window_words() {
    echo "focused -c -t -s -p $(_wctl_get_window_ids)"
}

_wctl() {
    local cur prev words cword
    _init_completion || return

    local commands="list focused info workspaces monitors workarea activate focus wait move resize move-resize place tile center resolve-place rules workspace move-to-workspace move-to-monitor minimize unminimize maximize unmaximize fullscreen unfullscreen above sticky close version help completion"

    # A global option before the command shifts every position right.
    local off=0
    [[ "${words[1]:-}" == "--timeout" ]] && off=2

    # Complete command names, plus the global options that may precede them.
    if [[ $cword -eq $((1 + off)) ]]; then
        # The global option is taken once, so it is not offered again after it.
        local globals="--timeout"
        [[ $off -eq 2 ]] && globals=""
        COMPREPLY=($(compgen -W "$commands $globals" -- "$cur"))
        return
    fi

    # The --timeout value is a number; there is nothing to offer.
    [[ $off -eq 2 && $cword -eq 2 ]] && return

    local cmd="${words[$((1 + off))]}"

    # Position of the word being completed among the arguments, counted from
    # the command: 2 is the <WINDOW> slot for every command that takes one. A
    # flag such as --json takes no position, wherever it stands. A -c/-t/-s/-p
    # selector and its value fill the <WINDOW> slot together; the value of any
    # other option (the list of VALUE_OPTIONS in commands/mod.rs) takes none.
    local pos=2 i
    for ((i = 2 + off; i < cword; i++)); do
        case "${words[i]}" in
            -[ctsp]) ((i++, pos++)) ;;
            --title-prefix | --title-suffix | --class-prefix | --class | --workspace | --monitor | --timeout | --min-width | --at | --file) ((i++)) ;;
            --*) ;;
            *) ((pos++)) ;;
        esac
    done
    # The loop stepped past the word being completed: it is an option's value,
    # which the user makes up.
    ((i > cword)) && return

    # The raw position, for activate: its --no-animation goes with a window ID
    # given right after the command, never with -t/-s/-c/-p.
    local slot=$((cword - off))

    case "$cmd" in
        list)
            COMPREPLY=($(compgen -W "--json --workspace --monitor --class" -- "$cur"))
            ;;
        focused|workspaces|monitors|workarea|version)
            COMPREPLY=($(compgen -W "--json" -- "$cur"))
            ;;
        info)
            if [[ $pos -eq 2 ]]; then
                COMPREPLY=($(compgen -W "$(_wctl_window_words)" -- "$cur"))
            elif [[ $pos -eq 3 && " ${words[*]} " != *" --json "* ]]; then
                COMPREPLY=($(compgen -W "--json" -- "$cur"))
            fi
            ;;
        place)
            if [[ $pos -eq 2 ]]; then
                COMPREPLY=($(compgen -W "$(_wctl_window_words)" -- "$cur"))
            elif [[ $pos -eq 3 ]]; then
                COMPREPLY=($(compgen -W "left center right" -- "$cur"))
            elif [[ $pos -eq 4 ]]; then
                COMPREPLY=($(compgen -W "top center bottom" -- "$cur"))
            else
                COMPREPLY=($(compgen -W "--json --settled" -- "$cur"))
            fi
            ;;
        resolve-place)
            COMPREPLY=($(compgen -W "--monitor --json left center right top bottom" -- "$cur"))
            ;;
        rules)
            local subcommand="${words[$((2 + off))]:-}"
            if [[ $pos -eq 2 ]]; then
                COMPREPLY=($(compgen -W "list path check add remove test apply" -- "$cur"))
            elif [[ $subcommand == add ]]; then
                COMPREPLY=($(compgen -W "-c -t -s --title-prefix --title-suffix --class-prefix tile place center --min-width --workspace --monitor --overlay --at --dry-run --file" -- "$cur"))
            elif [[ $subcommand == remove ]]; then
                COMPREPLY=($(compgen -W "--dry-run --file" -- "$cur"))
            elif [[ $subcommand == test ]]; then
                COMPREPLY=($(compgen -W "$(_wctl_window_words) --json --file" -- "$cur"))
            elif [[ $subcommand == apply ]]; then
                COMPREPLY=($(compgen -W "$(_wctl_window_words)" -- "$cur"))
            elif [[ $subcommand == path ]]; then
                COMPREPLY=($(compgen -W "--file --dir" -- "$cur"))
            else
                COMPREPLY=($(compgen -W "--file --json" -- "$cur"))
            fi
            ;;
        tile)
            if [[ $pos -eq 2 ]]; then
                COMPREPLY=($(compgen -W "$(_wctl_window_words)" -- "$cur"))
            elif [[ $pos -eq 3 ]]; then
                COMPREPLY=($(compgen -W "top-left top-center top-right left center right bottom-left bottom-center bottom-right wide-left wide-right" -- "$cur"))
            else
                COMPREPLY=($(compgen -W "--json --settled" -- "$cur"))
            fi
            ;;
        center)
            if [[ $pos -eq 2 ]]; then
                COMPREPLY=($(compgen -W "$(_wctl_window_words)" -- "$cur"))
            elif [[ $pos -eq 3 ]]; then
                COMPREPLY=($(compgen -W "horizontal vertical both" -- "$cur"))
            else
                COMPREPLY=($(compgen -W "--json --settled" -- "$cur"))
            fi
            ;;
        activate)
            if [[ $slot -eq 2 ]]; then
                if [[ "$cur" == -* ]]; then
                    COMPREPLY=($(compgen -W "-t -s -c -p --no-animation" -- "$cur"))
                else
                    COMPREPLY=($(compgen -W "-t -s -c -p $(_wctl_get_window_ids)" -- "$cur"))
                fi
            elif [[ $slot -eq 3 && "$prev" == "--no-animation" ]]; then
                COMPREPLY=($(compgen -W "$(_wctl_get_window_ids)" -- "$cur"))
            elif [[ $slot -eq 3 && "$prev" != -* ]]; then
                # --no-animation goes with a window ID, never with -t/-s/-c/-p.
                COMPREPLY=($(compgen -W "--no-animation" -- "$cur"))
            fi
            ;;
        wait)
            COMPREPLY=($(compgen -W "-c -t -s -p --timeout" -- "$cur"))
            ;;
        above|sticky)
            if [[ $pos -eq 2 ]]; then
                COMPREPLY=($(compgen -W "$(_wctl_window_words)" -- "$cur"))
            elif [[ $pos -eq 3 ]]; then
                COMPREPLY=($(compgen -W "on off" -- "$cur"))
            fi
            ;;
        completion)
            if [[ $pos -eq 2 ]]; then
                COMPREPLY=($(compgen -W "bash zsh" -- "$cur"))
            fi
            ;;
        minimize|unminimize)
            # The flag may come before the window too, and is taken once.
            local flag="--no-animation"
            [[ " ${words[*]} " == *" --no-animation "* ]] && flag=""
            if [[ $pos -eq 2 ]]; then
                COMPREPLY=($(compgen -W "$(_wctl_window_words) $flag" -- "$cur"))
            elif [[ $pos -eq 3 ]]; then
                COMPREPLY=($(compgen -W "$flag" -- "$cur"))
            fi
            ;;
        focus|move|resize|move-resize|move-to-workspace|move-to-monitor|maximize|unmaximize|fullscreen|unfullscreen|close)
            if [[ $pos -eq 2 ]]; then
                COMPREPLY=($(compgen -W "$(_wctl_window_words)" -- "$cur"))
            fi
            ;;
    esac
}

complete -F _wctl wctl
