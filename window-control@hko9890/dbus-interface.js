// D-Bus interface XML for the Window Control extension.
// Kept in its own module so the declarative interface contract can be read and
// diffed independently of the handler implementations in extension.js.

export const DBUS_INTERFACE_XML = `
<node>
  <interface name="org.gnome.Shell.Extensions.WindowControl">
    <!--
      List: Get all windows as array of tuples
      Returns: a(tssssbiiii)
        t - window ID (uint64)
        s - title
        s - wm_class
        s - wm_class_instance
        s - sandboxed_app_id
        b - is_focused
        i - workspace index (-1 if on all)
        i - monitor index
        i - PID
        i - window type enum value
    -->
    <method name="List">
      <arg type="a(tssssbiiii)" direction="out" name="windows"/>
    </method>

    <!--
      ListDetailed: Get all windows as JSON string with full details
      Returns: s - JSON string
    -->
    <method name="ListDetailed">
      <arg type="s" direction="out" name="windows_json"/>
    </method>


    <!--
      ListMonitors: Get all monitors with their properties
      Returns: s - JSON array of monitor objects
    -->
    <method name="ListMonitors">
      <arg type="s" direction="out" name="monitors_json"/>
    </method>
    <!--
      Activate: Activate (focus and raise) a window by ID
      Args: t - window ID
      Returns: b - success
    -->
    <method name="Activate">
      <arg type="t" direction="in" name="window_id"/>
      <arg type="b" direction="out" name="success"/>
    </method>

    <!--
      ActivateByTitle: Activate window by exact title match
      Args: s - title (exact match)
      Returns: b - success
    -->
    <method name="ActivateByTitle">
      <arg type="s" direction="in" name="title"/>
      <arg type="b" direction="out" name="success"/>
    </method>

    <!--
      ActivateByTitleSubstring: Activate window by title substring
      Args: s - substring to match
      Returns: b - success
    -->
    <method name="ActivateByTitleSubstring">
      <arg type="s" direction="in" name="substring"/>
      <arg type="b" direction="out" name="success"/>
    </method>

    <!--
      ActivateByWmClass: Activate window by WM class
      Args: s - wm_class (exact match)
      Returns: b - success
    -->
    <method name="ActivateByWmClass">
      <arg type="s" direction="in" name="wm_class"/>
      <arg type="b" direction="out" name="success"/>
    </method>

    <!--
      ActivateByPid: Activate window by PID
      Args: i - process ID
      Returns: b - success
    -->
    <method name="ActivateByPid">
      <arg type="i" direction="in" name="pid"/>
      <arg type="b" direction="out" name="success"/>
    </method>

    <!--
      Focus: Focus a window by ID (without raising)
      Args: t - window ID
      Returns: b - success
    -->
    <method name="Focus">
      <arg type="t" direction="in" name="window_id"/>
      <arg type="b" direction="out" name="success"/>
    </method>

    <!--
      GetFocused: Get the currently focused window
      Returns: (tss)
        t - window ID (0 if none)
        s - title
        s - wm_class
    -->
    <method name="GetFocused">
      <arg type="t" direction="out" name="window_id"/>
      <arg type="s" direction="out" name="title"/>
      <arg type="s" direction="out" name="wm_class"/>
    </method>

    <!-- Geometry Methods -->

    <!--
      Move: Move window to position
      Args: t - window ID, i - x, i - y
      Returns: b - success
    -->
    <method name="Move">
      <arg type="t" direction="in" name="window_id"/>
      <arg type="i" direction="in" name="x"/>
      <arg type="i" direction="in" name="y"/>
      <arg type="b" direction="out" name="success"/>
    </method>

    <!--
      Resize: Resize window
      Args: t - window ID, i - width, i - height
      Returns: b - success
    -->
    <method name="Resize">
      <arg type="t" direction="in" name="window_id"/>
      <arg type="i" direction="in" name="width"/>
      <arg type="i" direction="in" name="height"/>
      <arg type="b" direction="out" name="success"/>
    </method>

    <!--
      MoveResize: Move and resize window atomically
      Args: t - window ID, i - x, i - y, i - width, i - height
      Returns: b - success
    -->
    <method name="MoveResize">
      <arg type="t" direction="in" name="window_id"/>
      <arg type="i" direction="in" name="x"/>
      <arg type="i" direction="in" name="y"/>
      <arg type="i" direction="in" name="width"/>
      <arg type="i" direction="in" name="height"/>
      <arg type="b" direction="out" name="success"/>
    </method>

    <!--
      GetGeometry: Get window geometry
      Args: t - window ID
      Returns: (iiii) - x, y, width, height (-1,-1,-1,-1 if not found)
    -->
    <method name="GetGeometry">
      <arg type="t" direction="in" name="window_id"/>
      <arg type="i" direction="out" name="x"/>
      <arg type="i" direction="out" name="y"/>
      <arg type="i" direction="out" name="width"/>
      <arg type="i" direction="out" name="height"/>
    </method>


    <!--
      GetWorkarea: Get usable workspace area for a monitor
      Args: i - monitor index
      Returns: (iiii) - x, y, width, height (-1,-1,-1,-1 if invalid)
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
      Minimize: Minimize window
      Args: t - window ID
      Returns: b - success
    -->
    <method name="Minimize">
      <arg type="t" direction="in" name="window_id"/>
      <arg type="b" direction="out" name="success"/>
    </method>

    <!--
      Unminimize: Unminimize (restore) window
      Args: t - window ID
      Returns: b - success
    -->
    <method name="Unminimize">
      <arg type="t" direction="in" name="window_id"/>
      <arg type="b" direction="out" name="success"/>
    </method>

    <!--
      Maximize: Maximize window
      Args: t - window ID
      Returns: b - success
    -->
    <method name="Maximize">
      <arg type="t" direction="in" name="window_id"/>
      <arg type="b" direction="out" name="success"/>
    </method>

    <!--
      Unmaximize: Unmaximize window
      Args: t - window ID
      Returns: b - success
    -->
    <method name="Unmaximize">
      <arg type="t" direction="in" name="window_id"/>
      <arg type="b" direction="out" name="success"/>
    </method>

    <!--
      Fullscreen: Make window fullscreen
      Args: t - window ID
      Returns: b - success
    -->
    <method name="Fullscreen">
      <arg type="t" direction="in" name="window_id"/>
      <arg type="b" direction="out" name="success"/>
    </method>

    <!--
      Unfullscreen: Exit fullscreen mode
      Args: t - window ID
      Returns: b - success
    -->
    <method name="Unfullscreen">
      <arg type="t" direction="in" name="window_id"/>
      <arg type="b" direction="out" name="success"/>
    </method>

    <!--
      SetAbove: Set window always-on-top state
      Args: t - window ID, b - above (true = always on top)
      Returns: b - success
    -->
    <method name="SetAbove">
      <arg type="t" direction="in" name="window_id"/>
      <arg type="b" direction="in" name="above"/>
      <arg type="b" direction="out" name="success"/>
    </method>

    <!--
      SetSticky: Set window sticky state (on all workspaces)
      Args: t - window ID, b - sticky
      Returns: b - success
    -->
    <method name="SetSticky">
      <arg type="t" direction="in" name="window_id"/>
      <arg type="b" direction="in" name="sticky"/>
      <arg type="b" direction="out" name="success"/>
    </method>

    <!--
      Close: Close window (polite request, allows save dialogs)
      Args: t - window ID
      Returns: b - success
    -->
    <method name="Close">
      <arg type="t" direction="in" name="window_id"/>
      <arg type="b" direction="out" name="success"/>
    </method>
  </interface>
</node>
`;
