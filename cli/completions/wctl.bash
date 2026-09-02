# Bash completion for wctl
# Install: wctl completion bash > ~/.local/share/bash-completion/completions/wctl

# Window IDs come straight out of the compact JSON list. No jq: wctl has no
# runtime dependencies and its completion must not add one.
_wctl_get_window_ids() {
    wctl list --json 2>/dev/null | grep -o '"id":[0-9]\+' | cut -d: -f2
}

# Words accepted where a <WINDOW> selector goes: ids, "focused", and the
# -c/-t/-s/-p match options (each of which takes a value as the next word).
_wctl_window_words() {
    echo "focused -c -t -s -p $(_wctl_get_window_ids)"
}

_wctl() {
    local cur prev words cword
    _init_completion || return

    local commands="list focused info workspaces monitors activate focus wait move resize move-resize place tile center workspace move-to-workspace move-to-monitor minimize unminimize maximize unmaximize fullscreen unfullscreen above sticky close help completion"

    # Complete command names
    if [[ $cword -eq 1 ]]; then
        COMPREPLY=($(compgen -W "$commands" -- "$cur"))
        return
    fi

    local cmd="${words[1]}"

    # A -c/-t/-s/-p selector occupies two words, so the arguments after the
    # <WINDOW> slot sit one position further right.
    local pos=$cword
    [[ "${words[2]:-}" == -[ctsp] ]] && pos=$((cword - 1))

    case "$cmd" in
        list)
            COMPREPLY=($(compgen -W "--json --workspace --monitor --class" -- "$cur"))
            ;;
        focused|workspaces|monitors)
            COMPREPLY=($(compgen -W "--json" -- "$cur"))
            ;;
        info)
            if [[ $cword -eq 2 ]]; then
                COMPREPLY=($(compgen -W "$(_wctl_window_words)" -- "$cur"))
            elif [[ $pos -eq 3 ]]; then
                COMPREPLY=($(compgen -W "--json" -- "$cur"))
            fi
            ;;
        place)
            if [[ $cword -eq 2 ]]; then
                COMPREPLY=($(compgen -W "$(_wctl_window_words)" -- "$cur"))
            elif [[ $pos -eq 3 ]]; then
                COMPREPLY=($(compgen -W "left center right" -- "$cur"))
            elif [[ $pos -eq 4 ]]; then
                COMPREPLY=($(compgen -W "top center bottom" -- "$cur"))
            fi
            ;;
        tile)
            if [[ $cword -eq 2 ]]; then
                COMPREPLY=($(compgen -W "$(_wctl_window_words)" -- "$cur"))
            elif [[ $pos -eq 3 ]]; then
                COMPREPLY=($(compgen -W "top-left top-center top-right left center right bottom-left bottom-center bottom-right" -- "$cur"))
            fi
            ;;
        center)
            if [[ $cword -eq 2 ]]; then
                COMPREPLY=($(compgen -W "$(_wctl_window_words)" -- "$cur"))
            elif [[ $pos -eq 3 ]]; then
                COMPREPLY=($(compgen -W "horizontal vertical both" -- "$cur"))
            fi
            ;;
        activate)
            if [[ $cword -eq 2 ]]; then
                if [[ "$cur" == -* ]]; then
                    COMPREPLY=($(compgen -W "-t -s -c -p" -- "$cur"))
                else
                    COMPREPLY=($(compgen -W "-t -s -c -p $(_wctl_get_window_ids)" -- "$cur"))
                fi
            fi
            ;;
        wait)
            COMPREPLY=($(compgen -W "-c -t -s -p --timeout" -- "$cur"))
            ;;
        above|sticky)
            if [[ $cword -eq 2 ]]; then
                COMPREPLY=($(compgen -W "$(_wctl_window_words)" -- "$cur"))
            elif [[ $pos -eq 3 ]]; then
                COMPREPLY=($(compgen -W "on off" -- "$cur"))
            fi
            ;;
        completion)
            if [[ $cword -eq 2 ]]; then
                COMPREPLY=($(compgen -W "bash zsh" -- "$cur"))
            fi
            ;;
        focus|move|resize|move-resize|move-to-workspace|move-to-monitor|minimize|unminimize|maximize|unmaximize|fullscreen|unfullscreen|close)
            if [[ $cword -eq 2 ]]; then
                COMPREPLY=($(compgen -W "$(_wctl_window_words)" -- "$cur"))
            fi
            ;;
    esac
}

complete -F _wctl wctl
