// SPDX-FileCopyrightText: 2026 hko9890
// SPDX-License-Identifier: MIT
//! The help text.
//!
//! Hand written rather than generated, because it is part of the CLI contract:
//! tests/test-help.sh asserts the section headings and a synopsis line for
//! every command, and users read it as the reference for the selector grammar.

/// Text of `wctl help`, with `{VERSION}` still to be substituted.
const HELP: &str = r#"wctl {VERSION} - Window Control CLI

USAGE:
    wctl [GLOBAL OPTIONS] <COMMAND> [OPTIONS]

GLOBAL OPTIONS:
    --timeout <SECONDS>   How long to wait for GNOME Shell to reply
                          (default 25, or $WCTL_TIMEOUT). Must come before
                          the command. This is NOT how long `wctl wait`
                          waits for a window -- that is `wait --timeout`,
                          and a global timeout does not shorten it.

WINDOW SELECTOR:
    Every command that takes a <WINDOW> accepts one of:
      <ID>              numeric window ID (see wctl list)
      focused           the focused window
      -c <CLASS>        the window with this WM class
      -t <TITLE>        the window with exactly this title
      -s <SUBSTR>       the window whose title contains SUBSTR
      -p <PID>          the window owned by this process ID
    A selector must match exactly one window. If it matches several, wctl
    lists them and exits non-zero. (activate keeps its own first-match rule.)

LISTING COMMANDS:
    list [--json]           List all windows (table, or detailed JSON)
      --workspace <N>       Only windows on workspace N (sticky windows included)
      --monitor <N>         Only windows on monitor N
      --class <CLASS>       Only windows with this WM class
    focused [--json]        Show detailed info for the focused window
    workspaces [--json]     List workspaces
    monitors [--json]       List monitors
    workarea [<MONITOR>] [--json]
                            Usable area of a monitor (its rectangle minus
                            panels and docks), defaulting to the primary one.
                            This is what place and tile resolve percentages
                            against; monitors reports raw monitor rectangles.

ACTIVATION COMMANDS:
    activate <ID>           Activate by window ID
    activate -t <TITLE>     Activate by exact title match (first match)
    activate -s <SUBSTR>    Activate by title substring (first match)
    activate -c <CLASS>     Activate by WM class (first match)
    activate -p <PID>       Activate by process ID (first match)
    focus <WINDOW>          Focus window (without raising)
    wait -c|-t|-s|-p <VALUE> [--timeout <SECONDS>]
                            Wait until a matching window is shown and print its ID
                            (default timeout 10 s; exits 4 on timeout). Returns
                            only once the window is mapped and placed, so a
                            geometry command issued right after it sticks.

INFO COMMANDS:
    info <WINDOW>           Show detailed window information
    info <WINDOW> --json    Show window information as JSON

GEOMETRY COMMANDS:
    move <WINDOW> <X> <Y>                   Move window to position
    resize <WINDOW> <WIDTH> <HEIGHT>        Resize window
    move-resize <WINDOW> <X> <Y> <W> <H>    Move and resize atomically

TILING & POSITIONING:
    place <WINDOW> <X> <Y> <W> <H> [--json] [--settled]
                                            Place window using pixels and workarea-relative tokens
    tile <WINDOW> <position> [--json] [--settled]
                                            Tile window to 4x2 grid position
    center <WINDOW> [horizontal|vertical|both] [--json] [--settled]
                                            Center window on screen
    resolve-place [--monitor <N>] <X> <Y> <W> <H> [--json]
                            Resolve a placement WITHOUT applying it and without
                            a window, against the primary monitor's workarea or
                            the one named. Use it to size a window before it
                            exists.

    --json on the four commands above reports the workarea used and the
    rectangle wctl resolved, so a script can verify a placement by comparing
    against it rather than recomputing the percentages itself. It is the
    REQUESTED rectangle: mutter still clamps to size hints, and a client that
    quantises its own size settles a few pixels off. move, resize and
    move-resize have no --json -- they resolve nothing to report.

    --settled returns only once the frame has stopped changing, and reports
    where it stopped. The shell watches its own size-changed/position-changed
    signals for this, which is the only place it can be done: a geometry
    request is applied asynchronously, so a client outside the shell can only
    sample and guess. It is still a quiet period, not a promise -- a client is
    free to resize itself again later. A window that is placed but never
    settles exits 4 and still reports placed=true.

WORKSPACE & MONITOR COMMANDS:
    workspace <N>                       Switch to workspace N
    move-to-workspace <WINDOW> <N>      Move window to workspace N
    move-to-monitor <WINDOW> <N>        Move window to monitor N

STATE COMMANDS:
    minimize <WINDOW>           Minimize window
    unminimize <WINDOW>         Restore from minimize
    maximize <WINDOW>           Maximize window
    unmaximize <WINDOW>         Restore from maximize
    fullscreen <WINDOW>         Make window fullscreen
    unfullscreen <WINDOW>       Exit fullscreen mode
    above <WINDOW> on|off       Set always-on-top state
    sticky <WINDOW> on|off      Set sticky (all workspaces) state
    close <WINDOW>              Close window (polite request)

OTHER:
    version [--json]        Show the wctl version. With --json, also the
                            extension version the SHELL has loaded and whether
                            the two match; exits non-zero when they do not.
                            Reads the loaded version, not metadata.json on disk,
                            so an install that GNOME has not picked up yet shows
                            as a mismatch instead of looking fine.
    help                    Show this help message
    completion <SHELL>      Output shell completion script (bash or zsh)

EXAMPLES:
    wctl list                         # Show all windows
    wctl list --json                  # Get detailed JSON output
    wctl list --workspace 1           # Windows on workspace 1
    wctl list --class kitty --json    # kitty windows as JSON
    wctl focused                      # Show detailed focused window info
    wctl activate 12345               # Activate window by ID
    wctl activate -c Firefox          # Activate Firefox window
    wctl activate -s "Visual"         # Activate window with "Visual" in title
    wctl info 12345                   # Show detailed window info
    wctl info -c kitty --json         # Info for the (single) kitty window as JSON
    wctl move 12345 100 100           # Move window to (100, 100)
    wctl resize focused 800 600       # Resize the focused window to 800x600
    wctl place 12345 center top 50% 100%  # Centered half-width, full workarea height
    wctl place 12345 1280 32 3840 1408    # Exact pixel placement
    wctl tile -c kitty left           # Tile the kitty window to the left half
    wctl tile 12345 center            # Tile to center of grid
    wctl center focused               # Center the focused window (both axes)
    wctl center 12345 horizontal      # Center horizontally only
    wctl place focused center top 50% 100% --json   # Place, and report the rectangle used
    wctl resolve-place center top 50% 100% --json   # Same rectangle, nothing placed
    wctl place focused center top 50% 100% --settled  # Return once the frame stops moving
    wctl version --json               # Do wctl and the loaded extension agree?
    wctl workspaces                   # List workspaces
    wctl workspace 2                  # Switch to workspace 2
    wctl move-to-workspace -c Firefox 2   # Move the Firefox window to workspace 2
    wctl monitors                     # List monitors
    wctl workarea --json              # Usable area of the primary monitor
    wctl workarea 1                   # Usable area of monitor 1
    wctl move-to-monitor focused 1    # Move the focused window to monitor 1
    kitty & wctl wait -c kitty        # Start kitty, print its window ID once it exists
    wctl tile "$(wctl wait -p $!)" right   # Wait for a child process's window, then tile it
    wctl maximize 12345               # Maximize window
    wctl above 12345 on               # Set always-on-top
    wctl close 12345                  # Close window

SHELL COMPLETION:
    Bash: wctl completion bash > ~/.local/share/bash-completion/completions/wctl
    Zsh:  wctl completion zsh > ~/.local/share/zsh/site-functions/_wctl

EXIT CODES:
    0   Success
    1   Usage error, or a failure with no more specific code below
    2   The window, workspace or monitor does not exist
    3   The shell refused: the frame is pinned by maximize, fullscreen or
        tiling, or the window is held on all workspaces
    4   Timed out waiting for a window, or for the shell to reply
    5   The extension is not usable: not running, or a version this wctl
        cannot rely on (see wctl version --json)

ENVIRONMENT:
    The Window Control GNOME Shell extension must be enabled.

    WCTL_TIMEOUT   Reply timeout in seconds, as for --timeout, which
                   overrides it. Set it once for a script that must not
                   stall on a wedged shell.

"#;

pub fn text() -> String {
    HELP.replace("{VERSION}", crate::VERSION)
}
