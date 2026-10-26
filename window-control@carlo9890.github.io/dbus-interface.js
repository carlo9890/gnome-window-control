// SPDX-FileCopyrightText: 2026 hko9890
// SPDX-License-Identifier: MIT
// D-Bus interface XML for the Window Control extension.
// Kept in its own module so the declarative interface contract can be read and
// diffed independently of the handler implementations in dbus-service.js.

export const DBUS_INTERFACE_XML = `
<node>
  <interface name="org.gnome.Shell.Extensions.WindowControl">
    <!--
      One tuple per window: id, title, wm_class, wm_class_instance,
      sandboxed_app_id, is_focused, workspace index (-1 if on all), monitor
      index, pid, Meta.WindowType value.
    -->
    <method name="List">
      <arg type="a(tssssbiiii)" direction="out" name="windows"/>
    </method>

    <method name="ListDetailed">
      <arg type="s" direction="out" name="windows_json"/>
    </method>

    <method name="ListMonitors">
      <arg type="s" direction="out" name="monitors_json"/>
    </method>

    <!--
      Focuses and raises the window. Every method that answers b success
      answers false when no window has that id.
    -->
    <method name="Activate">
      <arg type="t" direction="in" name="window_id"/>
      <arg type="b" direction="out" name="success"/>
    </method>

    <!-- Exact match. -->
    <method name="ActivateByTitle">
      <arg type="s" direction="in" name="title"/>
      <arg type="b" direction="out" name="success"/>
    </method>

    <!-- An empty substring never matches. -->
    <method name="ActivateByTitleSubstring">
      <arg type="s" direction="in" name="substring"/>
      <arg type="b" direction="out" name="success"/>
    </method>

    <!-- Exact match. -->
    <method name="ActivateByWmClass">
      <arg type="s" direction="in" name="wm_class"/>
      <arg type="b" direction="out" name="success"/>
    </method>

    <!-- pid > 0: a window with an unknown pid reports 0 and never matches. -->
    <method name="ActivateByPid">
      <arg type="i" direction="in" name="pid"/>
      <arg type="b" direction="out" name="success"/>
    </method>

    <!-- Focuses the window without raising it. -->
    <method name="Focus">
      <arg type="t" direction="in" name="window_id"/>
      <arg type="b" direction="out" name="success"/>
    </method>

    <!-- window_id is 0 when no window has focus. -->
    <method name="GetFocused">
      <arg type="t" direction="out" name="window_id"/>
      <arg type="s" direction="out" name="title"/>
      <arg type="s" direction="out" name="wm_class"/>
    </method>

    <!-- Geometry Methods -->

    <!--
      ERRORS RAISED BY NAME

      Move, Resize and MoveResize do not return a success flag. They complete,
      or they raise one of the names below, because a bare boolean could not say
      which failure happened and every caller had to guess it back by refetching
      the window and reading its flags -- a guess that cannot see tiling at all.
      WaitForWindow and WaitForGeometry raise too, for the same reason.
      These are the names the extension raises on
      purpose; a handler never invents a name at the throw site. Any other
      method that throws an Error unexpectedly answers with GJS's own
      org.gnome.gjs.JSError.<name> (TypeError, for example); before GNOME 50,
      a wait method that throws before it starts waiting sends no reply.

        org.gnome.Shell.Extensions.WindowControl.NotFound
            no window has that id (WaitForGeometry: or it closed mid-wait)
        org.gnome.Shell.Extensions.WindowControl.Refused
            the window exists and mutter will drop the request: the frame is
            pinned by fullscreen, maximize or tiling. The message names which.
        org.gnome.Shell.Extensions.WindowControl.Timeout
            WaitForGeometry: the frame did not settle within timeout_ms
        org.gnome.Shell.Extensions.WindowControl.Disabled
            the extension was disabled while a WaitForWindow or
            WaitForGeometry call was pending
        org.freedesktop.DBus.Error.InvalidArgs
            a size or a wait time was not positive, timeout_ms was below
            quiet_ms, or a wait selector was refused (unknown kind, empty
            substring, pid that is not a positive decimal integer)
        org.freedesktop.DBus.Error.Failed
            Move, Resize or MoveResize raised something unexpected

      BREAKING: before extension version 10 these three returned 'b success'.
      A client written against the old signature fails to parse the reply.
    -->

    <method name="Move">
      <arg type="t" direction="in" name="window_id"/>
      <arg type="i" direction="in" name="x"/>
      <arg type="i" direction="in" name="y"/>
    </method>

    <method name="Resize">
      <arg type="t" direction="in" name="window_id"/>
      <arg type="i" direction="in" name="width"/>
      <arg type="i" direction="in" name="height"/>
    </method>

    <!-- Moves and resizes in one request. -->
    <method name="MoveResize">
      <arg type="t" direction="in" name="window_id"/>
      <arg type="i" direction="in" name="x"/>
      <arg type="i" direction="in" name="y"/>
      <arg type="i" direction="in" name="width"/>
      <arg type="i" direction="in" name="height"/>
    </method>

    <!-- (-1, -1, -1, -1) when no window has that id. -->
    <method name="GetGeometry">
      <arg type="t" direction="in" name="window_id"/>
      <arg type="i" direction="out" name="x"/>
      <arg type="i" direction="out" name="y"/>
      <arg type="i" direction="out" name="width"/>
      <arg type="i" direction="out" name="height"/>
    </method>

    <!--
      The integer 'version' from metadata.json, as a string, as the running
      shell loaded it. That is what makes it useful: metadata.json on disk can
      already be a newer version that the shell has not loaded, and on Wayland
      it stays that way until the user logs out.
    -->
    <method name="GetVersion">
      <arg type="s" direction="out" name="version"/>
    </method>

    <!--
      Capability names, e.g. ['rules']: what this extension supports beyond the
      methods it serves. A caller asks for a name rather than comparing version
      numbers, because the version is not a reliable signal:
      extensions.gnome.org replaces the 'version' field in metadata.json with
      its own upload number, so an install from there reports a number
      unrelated to this project's releases. A capability the extension does not
      have is an absent name, and an extension too old to serve this method
      raises UnknownMethod, which means the same.
    -->
    <method name="GetCapabilities">
      <arg type="as" direction="out" name="capabilities"/>
    </method>

    <!--
      The usable area of the monitor: (-1, -1, -1, -1) when the index is not a
      monitor, and only then: a lookup that throws answers with an error.
    -->
    <method name="GetWorkarea">
      <arg type="i" direction="in" name="monitor_index"/>
      <arg type="i" direction="out" name="x"/>
      <arg type="i" direction="out" name="y"/>
      <arg type="i" direction="out" name="width"/>
      <arg type="i" direction="out" name="height"/>
    </method>

    <!-- State Methods -->

    <!--
      false also for a window the shell does not let minimize, a skip-taskbar
      one for example, unless it is minimized already.
    -->
    <method name="Minimize">
      <arg type="t" direction="in" name="window_id"/>
      <arg type="b" direction="out" name="success"/>
    </method>

    <method name="Unminimize">
      <arg type="t" direction="in" name="window_id"/>
      <arg type="b" direction="out" name="success"/>
    </method>

    <!--
      Minimize without the shell's animation; success as Minimize reports it.
      For a window a caller hides and shows as one gesture, e.g. a popup: the
      animation shrinks the window towards its taskbar icon, or towards a
      corner of the monitor when it has none. Served by an extension that
      reports the 'no-animation' capability.
      The skip is consumed by the window's next animation. A minimize that is
      reversed before the shell has hidden the window (an unminimize within
      the same frame) runs none, and the skip then falls on the window's next
      animation of any kind. Leave a frame between the two.
    -->
    <method name="MinimizeNoAnimation">
      <arg type="t" direction="in" name="window_id"/>
      <arg type="b" direction="out" name="success"/>
    </method>

    <method name="UnminimizeNoAnimation">
      <arg type="t" direction="in" name="window_id"/>
      <arg type="b" direction="out" name="success"/>
    </method>

    <!--
      Activate, restoring a minimized window without the animation. The restore
      and the activation are one call, so no frame shows the window restored
      but not focused. A window that is not minimized is activated as Activate
      does. Served by an extension that reports the 'activate-no-animation'
      capability.
    -->
    <method name="ActivateNoAnimation">
      <arg type="t" direction="in" name="window_id"/>
      <arg type="b" direction="out" name="success"/>
    </method>

    <method name="Maximize">
      <arg type="t" direction="in" name="window_id"/>
      <arg type="b" direction="out" name="success"/>
    </method>

    <method name="Unmaximize">
      <arg type="t" direction="in" name="window_id"/>
      <arg type="b" direction="out" name="success"/>
    </method>

    <method name="Fullscreen">
      <arg type="t" direction="in" name="window_id"/>
      <arg type="b" direction="out" name="success"/>
    </method>

    <method name="Unfullscreen">
      <arg type="t" direction="in" name="window_id"/>
      <arg type="b" direction="out" name="success"/>
    </method>

    <method name="SetAbove">
      <arg type="t" direction="in" name="window_id"/>
      <arg type="b" direction="in" name="above"/>
      <arg type="b" direction="out" name="success"/>
    </method>

    <!--
      Sticky means on all workspaces. false also when the state did not take:
      mutter holds a window on all workspaces while it is on a secondary
      monitor with workspaces-only-on-primary set, and unstick() cannot
      override that.
    -->
    <method name="SetSticky">
      <arg type="t" direction="in" name="window_id"/>
      <arg type="b" direction="in" name="sticky"/>
      <arg type="b" direction="out" name="success"/>
    </method>

    <!-- Asks the client to close; it may refuse or prompt. -->
    <method name="Close">
      <arg type="t" direction="in" name="window_id"/>
      <arg type="b" direction="out" name="success"/>
    </method>

    <!-- Workspace and Monitor Methods -->

    <!-- A JSON array of {index, name, is_active, window_count}. -->
    <method name="ListWorkspaces">
      <arg type="s" direction="out" name="workspaces_json"/>
    </method>

    <!--
      false when the index does not exist or the switch did not take effect.
      Hides the Activities overview first, because the switch is ignored while
      the overview is shown.
    -->
    <method name="ActivateWorkspace">
      <arg type="i" direction="in" name="workspace_index"/>
      <arg type="b" direction="out" name="success"/>
    </method>

    <!--
      false also when the index does not exist, or when mutter holds the window
      on all workspaces (see SetSticky).
    -->
    <method name="MoveToWorkspace">
      <arg type="t" direction="in" name="window_id"/>
      <arg type="i" direction="in" name="workspace_index"/>
      <arg type="b" direction="out" name="success"/>
    </method>

    <!-- false also when the index does not exist. -->
    <method name="MoveToMonitor">
      <arg type="t" direction="in" name="window_id"/>
      <arg type="i" direction="in" name="monitor_index"/>
      <arg type="b" direction="out" name="success"/>
    </method>

    <!-- Event Methods -->

    <!--
      Replies once a window matching the selector is shown. kind is "class",
      "title", "substring" or "pid"; timeout_ms > 0; window_id is 0 on timeout.
      The reply is deferred until a matching window has been shown (mapped and
      placed by mutter) or the timeout elapses; the shell main loop is never
      blocked. Replying only once the window is shown matters: a geometry
      request on a window that exists but is not yet shown is overridden by
      mutter's initial placement. An already existing matching window returns
      immediately. Invalid arguments raise
      org.freedesktop.DBus.Error.InvalidArgs; disabling the extension while a
      call is pending raises org.gnome.Shell.Extensions.WindowControl.Disabled.
      A pending call whose caller leaves the bus is dropped without a reply.
    -->
    <method name="WaitForWindow">
      <arg type="s" direction="in" name="kind"/>
      <arg type="s" direction="in" name="value"/>
      <arg type="i" direction="in" name="timeout_ms"/>
      <arg type="t" direction="out" name="window_id"/>
    </method>

    <!--
      Replies with the frame once it has stopped changing: quiet_ms (> 0) is
      how long it must hold still, timeout_ms (>= quiet_ms) when to give up.
      The reply is deferred until size-changed and position-changed have both
      been silent for quiet_ms, then carries the frame as it then stands. Only
      the compositor can do this: move_resize_frame() is asynchronous and
      get_frame_rect() read straight after it still returns the old rect, so a
      client outside the shell can only sample and guess. Watching the signals
      replaces that guess with the compositor's own account -- but "stopped
      changing" is still a quiet period, not a promise: a client is free to
      resize itself again later.
      Raises WindowControl.NotFound if the window does not exist or closes
      while waiting, WindowControl.Timeout if the frame never settles,
      org.freedesktop.DBus.Error.InvalidArgs for bad arguments, and
      WindowControl.Disabled if the extension is disabled while pending.
      A pending call whose caller leaves the bus is dropped without a reply.
    -->
    <method name="WaitForGeometry">
      <arg type="t" direction="in" name="window_id"/>
      <arg type="i" direction="in" name="quiet_ms"/>
      <arg type="i" direction="in" name="timeout_ms"/>
      <arg type="i" direction="out" name="x"/>
      <arg type="i" direction="out" name="y"/>
      <arg type="i" direction="out" name="width"/>
      <arg type="i" direction="out" name="height"/>
    </method>
  </interface>
</node>
`;
