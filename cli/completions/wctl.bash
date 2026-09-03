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

    local commands="list focused info workspaces monitors workarea activate focus wait move resize move-resize place tile center resolve-place workspace move-to-workspace move-to-monitor minimize unminimize maximize unmaximize fullscreen unfullscreen above sticky close version help completion"

    # A global option before the command shifts every position right.
    local off=0
    [[ "${words[1]:-}" == "--timeout" ]] && off=2

    # Complete command names, plus the global options that may precede them.
    if [[ $cword -eq $((1 + off)) ]]; then
        COMPREPLY=($(compgen -W "$commands --timeout" -- "$cur"))
        return
    fi

    # The --timeout value is a number; there is nothing to offer.
    [[ $off -eq 2 && $cword -eq 2 ]] && return

    local cmd="${words[$((1 + off))]}"

    # Position of the word being completed, counted from the command: slot 2 is
    # the <WINDOW> slot for every command that takes one.
    local slot=$((cword - off))

    # A -c/-t/-s/-p selector occupies two words, so the arguments AFTER the
    # <WINDOW> slot sit one position further right. The <WINDOW> slot itself
    # still uses `slot`, because the selector option is the word being typed
    # there and shifting on it would offer nothing at all.
    local pos=$slot
    [[ "${words[$((2 + off))]:-}" == -[ctsp] ]] && pos=$((slot - 1))

    case "$cmd" in
        list)
            COMPREPLY=($(compgen -W "--json --workspace --monitor --class" -- "$cur"))
            ;;
        focused|workspaces|monitors|workarea|version)
            COMPREPLY=($(compgen -W "--json" -- "$cur"))
            ;;
        info)
            if [[ $slot -eq 2 ]]; then
                COMPREPLY=($(compgen -W "$(_wctl_window_words)" -- "$cur"))
            elif [[ $pos -eq 3 ]]; then
                COMPREPLY=($(compgen -W "--json" -- "$cur"))
            fi
            ;;
        place)
            if [[ $slot -eq 2 ]]; then
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
        tile)
            if [[ $slot -eq 2 ]]; then
                COMPREPLY=($(compgen -W "$(_wctl_window_words)" -- "$cur"))
            elif [[ $pos -eq 3 ]]; then
                COMPREPLY=($(compgen -W "top-left top-center top-right left center right bottom-left bottom-center bottom-right" -- "$cur"))
            else
                COMPREPLY=($(compgen -W "--json --settled" -- "$cur"))
            fi
            ;;
        center)
            if [[ $slot -eq 2 ]]; then
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
            if [[ $slot -eq 2 ]]; then
                COMPREPLY=($(compgen -W "$(_wctl_window_words)" -- "$cur"))
            elif [[ $pos -eq 3 ]]; then
                COMPREPLY=($(compgen -W "on off" -- "$cur"))
            fi
            ;;
        completion)
            if [[ $slot -eq 2 ]]; then
                COMPREPLY=($(compgen -W "bash zsh" -- "$cur"))
            fi
            ;;
        focus|move|resize|move-resize|move-to-workspace|move-to-monitor|minimize|unminimize|maximize|unmaximize|fullscreen|unfullscreen|close)
            if [[ $slot -eq 2 ]]; then
                COMPREPLY=($(compgen -W "$(_wctl_window_words)" -- "$cur"))
            fi
            ;;
    esac
}

complete -F _wctl wctl
